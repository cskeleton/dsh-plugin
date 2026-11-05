/**
 * Host half of dsh-conversation-export.
 *
 * Authenticated Connection Fetch routes (the carrier the shipped Session-log
 * ZIP download uses, so browser admission and Origin checks apply):
 *   POST /api/conversation-export.outline  { sessionId }
 *     → { title, rounds, summary, image, save }
 *   POST /api/conversation-export.render   { sessionId, parts, format, tools, thinking, theme, model,
 *                                            timeZone, image: { width, fontSize }, delivery, directory }
 *     → { delivery: 'save', files: [{ name, path }] } after writing to a Host folder, or
 *       { delivery: 'download', files: [{ name, mime, base64 }] } for the browser to save.
 *   POST /api/conversation-export.open     { path, action: 'open' | 'reveal' }
 *   POST /api/conversation-export.pick     {} → { path } from the native folder picker
 *
 * Saving to a Host folder and opening files are offered only to a loopback
 * browser (the Desktop window or a local browser), because the folder and
 * the opened window live on the Host machine. `open` accepts only paths this
 * process wrote. Session events come from `sessionQuery.readSession`, which
 * never makes a cold Session live; summaries call `ctx.llm` with a model the
 * user picked from the Host model catalog.
 */

import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { foldRounds, outlineOf, preview } from './parse.js'
import { detectLanguage, summarizeWithModel } from './summarize.js'
import { detailLevel, renderDocument, renderImageHtml, THEMES } from './render.js'
import { autoFontSize, findChromium, renderPng } from './image.js'

export const name = 'conversation-export'
export const inject = ['connection', 'sessionQuery']

export const OUTLINE_PATH = '/api/conversation-export.outline'
export const RENDER_PATH = '/api/conversation-export.render'
export const OPEN_PATH = '/api/conversation-export.open'
export const PICK_PATH = '/api/conversation-export.pick'

export const IMAGE_PRESETS = [
  { id: 'phone', width: 640 },
  { id: 'tablet', width: 960 },
  { id: 'desktop', width: 1200 },
]
const IMAGE_WIDTH = { min: 320, max: 2400, default: 640 }
const FONT_SIZE = { min: 12, max: 48 }

const SESSION_ID = /^[A-Za-z0-9_.:-]{1,200}$/
const FORMATS = new Set(['markdown', 'html', 'image'])
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

class RequestError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function json(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

async function readBody(request) {
  try {
    const value = await request.json()
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('body')
    return value
  } catch {
    throw new RequestError(400, 'request body must be a JSON object')
  }
}

function sessionIdOf(body) {
  const id = body.sessionId
  if (typeof id !== 'string' || !SESSION_ID.test(id)) throw new RequestError(400, 'invalid sessionId')
  return id
}

/** A browser on this machine: loopback URL and no proxy forwarding headers. */
function isLocalRequest(request) {
  let hostname
  try {
    hostname = new URL(request.url).hostname
  } catch {
    return false
  }
  if (!LOOPBACK.has(hostname)) return false
  for (const header of ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'cf-connecting-ip', 'x-real-ip']) {
    if (request.headers.get(header)) return false
  }
  return true
}

function expandHome(value) {
  if (typeof value !== 'string' || value === '') return undefined
  return value === '~' ? os.homedir() : value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value
}

function defaultDirectory(config) {
  const configured = expandHome(config.saveDirectory)
  if (configured && isDirectory(configured)) return configured
  const downloads = path.join(os.homedir(), 'Downloads')
  return isDirectory(downloads) ? downloads : os.homedir()
}

function isDirectory(dir) {
  try {
    return fs.statSync(dir).isDirectory()
  } catch {
    return false
  }
}

async function loadSession(ctx, sessionId) {
  let snapshot
  try {
    snapshot = await ctx.sessionQuery.readSession(sessionId)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new RequestError(/not found|unknown|no such/i.test(message) ? 404 : 500, `cannot read session: ${message}`)
  }
  const folded = foldRounds(snapshot.events)
  let title
  try {
    title = (await ctx.sessionQuery.readTitle(sessionId))?.title
  } catch {}
  const firstPrompt = folded.rounds.find(round => round.prompt?.text)?.prompt.text
  return {
    ...folded,
    title: (typeof title === 'string' && title.trim() !== '' ? title.trim() : preview(firstPrompt ?? sessionId, 60)) || sessionId,
  }
}

function sameRoute(a, b) {
  return a !== undefined && b !== undefined && a !== null && b !== null && a.provider === b.provider && a.model === b.model
}

/** Models the user may pick for summaries; empty when `ctx.llm` is absent. */
async function modelChoices(ctx) {
  const llm = ctx.get('llm')
  if (llm === undefined) return { models: [], catalogDefault: undefined }
  const models = []
  let catalogDefault
  const controller = ctx.get('sessionController')
  if (controller !== undefined && typeof controller.modelCatalog === 'function') {
    try {
      const catalog = await controller.modelCatalog()
      catalogDefault = catalog.default
      const routable = new Set(catalog.routableProviders ?? [])
      for (const group of catalog.groups ?? []) {
        if (routable.size > 0 && !routable.has(group.id)) continue
        for (const model of group.models ?? []) {
          models.push({ provider: group.id, model: model.id, label: `${group.name} · ${model.name}` })
        }
      }
    } catch {}
  }
  if (models.length === 0) {
    for (const provider of llm.listProviders?.() ?? []) {
      try {
        for (const model of await llm.listModels(provider.id)) {
          models.push({ provider: provider.id, model: model.id, label: `${provider.name} · ${model.name}` })
        }
      } catch {}
    }
  }
  return { models, catalogDefault }
}

function pickerAvailable(ctx) {
  try {
    return ctx.get('directoryPicker')?.capability()?.kind === 'native'
  } catch {
    return false
  }
}

function fileManagerOf(ctx) {
  try {
    const desktop = ctx.get('sessionController')?.workspaceDesktop?.()
    if (desktop?.available && desktop.fileManager) return desktop.fileManager
  } catch {}
  return process.platform === 'darwin' ? 'finder' : process.platform === 'win32' ? 'explorer' : 'directory'
}

function stemOf(title) {
  const stem = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'conversation'
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${stem}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
}

function intIn(value, range) {
  return Number.isSafeInteger(value) && value >= range.min && value <= range.max ? value : undefined
}

/** Parse `parts` ([{ index, user, assistant }]) or the older `rounds` index list. */
function selectRounds(rounds, body) {
  if (Array.isArray(body.parts)) {
    const byIndex = new Map()
    for (const part of body.parts) {
      if (part === null || typeof part !== 'object' || !Number.isSafeInteger(part.index)) continue
      byIndex.set(part.index, { user: part.user === true, assistant: part.assistant === true })
    }
    return rounds
      .filter(round => byIndex.has(round.index))
      .map(round => ({ ...round, parts: byIndex.get(round.index) }))
      .filter(round => (round.parts.user && round.prompt !== undefined) || (round.parts.assistant && round.blocks.length > 0))
  }
  if (Array.isArray(body.rounds)) {
    const wanted = new Set(body.rounds.filter(index => Number.isSafeInteger(index)))
    return rounds.filter(round => wanted.has(round.index)).map(round => ({ ...round, parts: { user: true, assistant: true } }))
  }
  return rounds.map(round => ({ ...round, parts: { user: true, assistant: true } }))
}

/** Write without overwriting: `name.ext`, then `name (2).ext`, … for every file of one export. */
async function writeUnique(directory, entries) {
  for (let attempt = 1; attempt < 1000; attempt++) {
    const suffix = attempt === 1 ? '' : ` (${attempt})`
    const targets = entries.map(entry => path.join(directory, entry.name.replace(/(\.[^.]+)$/, `${suffix}$1`)))
    if (targets.some(target => fs.existsSync(target))) continue
    const written = []
    try {
      for (let i = 0; i < entries.length; i++) {
        await fs.promises.writeFile(targets[i], entries[i].data, { flag: 'wx' })
        written.push(targets[i])
      }
      return written
    } catch (error) {
      for (const file of written) await fs.promises.rm(file, { force: true })
      if (error?.code === 'EEXIST') continue
      throw error
    }
  }
  throw new RequestError(409, 'could not find a free file name')
}

async function handleOutline(ctx, config, request) {
  const body = await readBody(request)
  const sessionId = sessionIdOf(body)
  const session = await loadSession(ctx, sessionId)
  const { models, catalogDefault } = await modelChoices(ctx)
  const defaultModel = [session.lastModel, catalogDefault, models[0]]
    .find(candidate => candidate !== undefined && models.some(model => sameRoute(model, candidate)))
  const chromium = await findChromium(config.chromiumPath)
  const local = isLocalRequest(request)
  return json(200, {
    sessionId,
    title: session.title,
    rounds: session.rounds.map(outlineOf),
    summary: {
      available: models.length > 0,
      models,
      defaultModel: defaultModel === undefined ? null : { provider: defaultModel.provider, model: defaultModel.model },
    },
    image: {
      available: chromium.available,
      reason: chromium.reason ?? null,
      presets: IMAGE_PRESETS,
      width: IMAGE_WIDTH,
      fontSize: FONT_SIZE,
      scale: config.imageScale,
    },
    save: {
      available: local,
      defaultDirectory: local ? defaultDirectory(config) : null,
      picker: local && pickerAvailable(ctx),
      fileManager: local ? fileManagerOf(ctx) : null,
    },
  })
}

async function handleRender(ctx, config, saved, request) {
  const body = await readBody(request)
  const sessionId = sessionIdOf(body)
  if (!FORMATS.has(body.format)) throw new RequestError(400, 'format must be "markdown", "html", or "image"')
  const format = body.format
  const tools = detailLevel(body.tools)
  const thinking = detailLevel(body.thinking)
  const theme = THEMES.includes(body.theme) ? body.theme : 'paper'
  const timeZone = typeof body.timeZone === 'string' && body.timeZone.length < 64 ? body.timeZone : undefined
  const delivery = body.delivery === 'save' ? 'save' : 'download'

  let directory
  if (delivery === 'save') {
    if (!isLocalRequest(request)) throw new RequestError(403, 'saving to a Host folder is only available on this machine')
    directory = expandHome(body.directory) ?? defaultDirectory(config)
    if (!path.isAbsolute(directory) || !isDirectory(directory)) throw new RequestError(400, `folder does not exist: ${directory}`)
  }

  let width
  let fontSize
  if (format === 'image') {
    width = body.image?.width === undefined ? IMAGE_WIDTH.default : intIn(body.image.width, IMAGE_WIDTH)
    if (width === undefined) throw new RequestError(400, `image width must be ${IMAGE_WIDTH.min}–${IMAGE_WIDTH.max} px`)
    fontSize = body.image?.fontSize === undefined || body.image?.fontSize === null ? autoFontSize(width) : intIn(body.image.fontSize, FONT_SIZE)
    if (fontSize === undefined) throw new RequestError(400, `font size must be ${FONT_SIZE.min}–${FONT_SIZE.max} px`)
  }

  const session = await loadSession(ctx, sessionId)
  const selected = selectRounds(session.rounds, body)
  if (selected.length === 0) throw new RequestError(400, 'select at least one message')

  let route
  if (body.model !== null && body.model !== undefined) {
    const { models } = await modelChoices(ctx)
    route = models.find(model => sameRoute(model, body.model))
    if (route === undefined) throw new RequestError(400, 'the selected summary model is not available')
  }
  if (thinking === 'summary' && route === undefined) throw new RequestError(400, 'thinking summaries need a model')

  const lang = detectLanguage(selected)
  let summaries = new Map()
  let failures = 0
  const wantTools = tools === 'summary' && route !== undefined
  const wantReasoning = thinking === 'summary'
  if (route !== undefined && (wantTools || wantReasoning)) {
    const result = await summarizeWithModel({
      llm: ctx.get('llm'),
      route,
      language: lang,
      rounds: selected.filter(round => round.parts.assistant),
      tools: wantTools,
      reasoning: wantReasoning,
      concurrency: config.summaryConcurrency,
      timeoutMs: config.summaryTimeoutMs,
      signal: request.signal,
    })
    summaries = result.summaries
    failures = result.failures
  }

  const models = session.lastModel === undefined ? [] : [`${session.lastModel.provider}/${session.lastModel.model}`]
  const doc = { title: session.title, sessionId, exportedAt: Date.now(), models, rounds: selected }
  const options = { format, tools, thinking, theme, lang, timeZone, summaries, maxDetailChars: config.maxDetailChars, fontSize }
  const stem = stemOf(session.title)

  let entries
  let compressed
  if (format === 'image') {
    const result = await renderPng(renderImageHtml(doc, options), {
      width,
      theme,
      scale: config.imageScale,
      maxHeight: config.imageMaxHeight,
      chromiumPath: config.chromiumPath,
      pythonPath: config.pythonPath,
      signal: request.signal,
    })
    try {
      entries = await Promise.all(result.files.map(async (file, i) => ({
        name: result.files.length === 1 ? `${stem}.png` : `${stem}-${String(i + 1).padStart(2, '0')}.png`,
        mime: 'image/png',
        data: await fs.promises.readFile(file),
      })))
    } finally {
      await fs.promises.rm(result.tempDir, { recursive: true, force: true })
    }
    compressed = result.compressed
  } else {
    const text = renderDocument(doc, options)
    entries = [{
      name: `${stem}.${format === 'html' ? 'html' : 'md'}`,
      mime: format === 'html' ? 'text/html' : 'text/markdown',
      data: Buffer.from(text, 'utf8'),
    }]
  }

  const meta = { format, summaryFailures: failures, compressed: compressed ?? null, width: width ?? null, fontSize: fontSize ?? null }
  if (delivery === 'save') {
    const written = await writeUnique(directory, entries)
    for (const file of written) saved.add(file)
    while (saved.size > 500) saved.delete(saved.values().next().value)
    return json(200, { delivery, directory, files: written.map(file => ({ name: path.basename(file), path: file })), ...meta })
  }
  return json(200, {
    delivery,
    files: entries.map(entry => ({ name: entry.name, mime: entry.mime, base64: entry.data.toString('base64') })),
    ...meta,
  })
}

function spawnOpen(target, action) {
  let command
  let args
  if (process.platform === 'darwin') {
    command = 'open'
    args = action === 'reveal' ? ['-R', target] : [target]
  } else if (process.platform === 'win32') {
    command = 'explorer.exe'
    args = action === 'reveal' ? [`/select,${target}`] : [target]
  } else {
    command = 'xdg-open'
    args = [action === 'reveal' ? path.dirname(target) : target]
  }
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 15000 }, error => {
      // explorer.exe exits 1 even on success.
      if (error && !(process.platform === 'win32' && error.code === 1)) reject(error)
      else resolve()
    })
  })
}

async function handleOpen(ctx, saved, request) {
  if (!isLocalRequest(request)) throw new RequestError(403, 'opening files is only available on this machine')
  const body = await readBody(request)
  const target = typeof body.path === 'string' ? body.path : ''
  const action = body.action === 'reveal' ? 'reveal' : 'open'
  if (!saved.has(target)) throw new RequestError(403, 'only files exported in this session of DSH can be opened')
  if (!fs.existsSync(target)) throw new RequestError(404, `file no longer exists: ${target}`)
  const controller = ctx.get('sessionController')
  if (controller !== undefined && typeof controller.openWorkspacePath === 'function') {
    try {
      await controller.openWorkspacePath(action === 'reveal' ? { path: target, action: 'reveal' } : { path: target }, request.signal)
      return json(200, { opened: true })
    } catch {}
  }
  await spawnOpen(target, action)
  return json(200, { opened: true })
}

async function handlePick(ctx, request) {
  if (!isLocalRequest(request)) throw new RequestError(403, 'the folder picker is only available on this machine')
  const picker = ctx.get('directoryPicker')
  const capability = picker?.capability?.()
  if (capability?.kind !== 'native') return json(200, { unsupported: true })
  const picked = await capability.pick(request.signal)
  return json(200, { path: picked ?? null })
}

function guard(handler, log) {
  return async request => {
    try {
      return await handler(request)
    } catch (error) {
      if (request.signal?.aborted) return json(499, { error: 'cancelled' })
      if (error instanceof RequestError) return json(error.status, { error: error.message })
      log(error)
      return json(500, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

function resolveConfig(config) {
  const int = (value, min, max, fallback) => (Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback)
  const imageScale = int(config.imageScale, 1, 3, 2)
  return {
    summaryConcurrency: int(config.summaryConcurrency, 1, 16, 4),
    summaryTimeoutMs: int(config.summaryTimeoutMs, 5000, 3_600_000, 120000),
    maxDetailChars: int(config.maxDetailChars, 200, 1_000_000, 4000),
    imageScale,
    // Keep every page under the 16384 device-pixel texture limit of iOS.
    imageMaxHeight: Math.min(int(config.imageMaxHeight, 1000, 30000, 7500), Math.floor(16000 / imageScale)),
    saveDirectory: typeof config.saveDirectory === 'string' ? config.saveDirectory : undefined,
    chromiumPath: typeof config.chromiumPath === 'string' && config.chromiumPath !== '' ? config.chromiumPath : undefined,
    pythonPath: typeof config.pythonPath === 'string' && config.pythonPath !== '' ? config.pythonPath : undefined,
  }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - Host context with Connection and Session query.
 * @param {object} config - tunables; see README.
 */
export function apply(ctx, config = {}) {
  const resolved = resolveConfig(config)
  const saved = new Set()
  const logger = typeof ctx.logger === 'function' ? ctx.logger('conversation-export') : undefined
  const log = error => logger?.warn?.(error)
  const fetch = ctx.connection.fetch
  const route = (routePath, handler, label) => ctx.effect(() => fetch.register({
    path: routePath,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: guard(handler, log),
  }), `conversation-export: ${label} route`)
  route(OUTLINE_PATH, request => handleOutline(ctx, resolved, request), 'outline')
  route(RENDER_PATH, request => handleRender(ctx, resolved, saved, request), 'render')
  route(OPEN_PATH, request => handleOpen(ctx, saved, request), 'open')
  route(PICK_PATH, request => handlePick(ctx, request), 'pick')
}
