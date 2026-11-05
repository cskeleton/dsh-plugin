/**
 * Host-route tests: mount `apply` on a stub context that captures the two
 * Fetch routes, feed a synthetic Session log, and check the outline and
 * both render formats, including the model-summary and no-model paths.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { apply, OUTLINE_PATH, RENDER_PATH, OPEN_PATH, PICK_PATH } from '../lib/index.js'

const t0 = 1_800_000_000_000
const events = [
  { type: 'user/message', seq: 1, time: t0, data: { role: 'user', source: { kind: 'runtime-context' }, content: [{ type: 'text', text: 'injected' }] } },
  { type: 'turn/start', seq: 2, time: t0, data: { turn: 1 } },
  { type: 'user/message', seq: 3, time: t0, data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '帮我看看 README 写了什么' }] } },
  { type: 'assistant/message', seq: 4, time: t0 + 2000, data: { turn: 1, step: 1, message: { role: 'assistant', source: { kind: 'model', provider: 'p', model: 'm' }, content: [
    { type: 'reasoning', text: 'I should read the README first.' },
    { type: 'text', text: '我先读一下文件。' },
    { type: 'tool-call', id: 'c1', name: 'read', arguments: '{"file_path":"/repo/README.md"}' },
  ] } } },
  { type: 'tool/result', seq: 5, time: t0 + 3000, data: { turn: 1, step: 1, message: { role: 'tool', toolCallId: 'c1', source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'text', text: '# Demo\nSECRET_OUTPUT_LINE' }] } } },
  { type: 'assistant/message', seq: 6, time: t0 + 9000, data: { turn: 1, step: 2, message: { role: 'assistant', source: { kind: 'model', provider: 'p', model: 'm' }, content: [
    { type: 'reasoning', text: 'Now summarize.' },
    { type: 'text', text: 'README 只有一个标题 **Demo**。' },
  ] } } },
  { type: 'turn/end', seq: 7, time: t0 + 9000, data: { turn: 1, reason: { kind: 'completed' } } },
  { type: 'user/message', seq: 8, time: t0 + 60000, data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '谢谢' }] } },
  { type: 'assistant/message', seq: 9, time: t0 + 61000, data: { turn: 2, step: 1, message: { role: 'assistant', source: { kind: 'model', provider: 'p', model: 'm' }, content: [{ type: 'text', text: '不客气。' }] } } },
]

function fakeLlm(calls) {
  return {
    listProviders: () => [{ id: 'p', name: 'Prov' }],
    listModels: async () => [{ id: 'm', name: 'Model M' }],
    async prepareCall(config) {
      return {
        config,
        async *stream(options) {
          calls.push(options)
          const ids = [...options.messages[0].content[0].text.matchAll(/"id":"([^"]+)"/g)].map(m => m[1])
          yield { type: 'text-delta', index: 0, text: JSON.stringify(Object.fromEntries(ids.map(id => [id, { title: `T-${id}`, text: `S-${id}` }]))) }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    },
  }
}

function mount({ llm, opened = [] } = {}) {
  const routes = new Map()
  const services = {
    llm,
    sessionController: {
      modelCatalog: async () => ({ default: { provider: 'p', model: 'm' }, routableProviders: llm === undefined ? ['none'] : ['p'], groups: llm === undefined ? [] : [{ id: 'p', name: 'Prov', models: [{ id: 'm', name: 'Model M' }] }], failures: [] }),
      workspaceDesktop: () => ({ name: 'test', available: true, fileManager: 'finder' }),
      openWorkspacePath: async request => { opened.push(request); return { opened: true } },
    },
  }
  const ctx = {
    connection: { fetch: { register: route => { routes.set(route.path, route); return async () => routes.delete(route.path) } } },
    sessionQuery: {
      readSession: async id => {
        if (id !== 'session-1') throw new Error(`session "${id}" not found`)
        return { session: { id }, inheritedEventCount: 0, events }
      },
      readTitle: async () => ({ title: 'README 问答' }),
    },
    get: key => services[key],
    effect: fn => fn(),
  }
  apply(ctx, {})
  const call = (route, body, { host = '127.0.0.1:1234', headers = {} } = {}) =>
    routes.get(route).fetch(new Request(`http://${host}${route}`, { method: 'POST', body: JSON.stringify(body), headers }))
  const render = async (body, options) => {
    const response = await call(RENDER_PATH, { delivery: 'download', ...body }, options)
    const value = await response.json()
    return { response, value, text: value.files?.[0] ? Buffer.from(value.files[0].base64, 'base64').toString('utf8') : '' }
  }
  return { routes, call, render, opened }
}

test('registers all routes', () => {
  const { routes } = mount()
  assert.deepEqual([...routes.keys()].sort(), [OUTLINE_PATH, RENDER_PATH, OPEN_PATH, PICK_PATH].sort())
})

test('outline lists human rounds, both message roles, and capabilities', async () => {
  const withModel = await (await mount({ llm: fakeLlm([]) }).call(OUTLINE_PATH, { sessionId: 'session-1' })).json()
  assert.equal(withModel.title, 'README 问答')
  assert.equal(withModel.rounds.length, 2)
  assert.equal(withModel.rounds[0].tools, 1)
  assert.equal(withModel.rounds[0].reasoning, 2)
  assert.equal(withModel.rounds[0].hasPrompt, true)
  assert.equal(withModel.rounds[0].hasAssistant, true)
  assert.equal(withModel.summary.available, true)
  assert.deepEqual(withModel.summary.defaultModel, { provider: 'p', model: 'm' })
  assert.equal(withModel.save.available, true)
  assert.equal(typeof withModel.save.defaultDirectory, 'string')
  assert.deepEqual(withModel.image.presets.map(preset => preset.width), [640, 960, 1200])

  const noModel = await (await mount().call(OUTLINE_PATH, { sessionId: 'session-1' })).json()
  assert.equal(noModel.summary.available, false)
  assert.equal(noModel.summary.defaultModel, null)
})

test('a tunnelled or remote browser cannot save to the Host', async () => {
  const { call } = mount()
  const remote = await (await call(OUTLINE_PATH, { sessionId: 'session-1' }, { host: 'abc.example.com' })).json()
  assert.equal(remote.save.available, false)
  const forwarded = await (await call(OUTLINE_PATH, { sessionId: 'session-1' }, { headers: { 'cf-connecting-ip': '1.2.3.4' } })).json()
  assert.equal(forwarded.save.available, false)
  const refused = await call(RENDER_PATH, { sessionId: 'session-1', format: 'markdown', delivery: 'save', directory: os.tmpdir() }, { host: 'abc.example.com' })
  assert.equal(refused.status, 403)
})

test('outline rejects bad ids and missing sessions', async () => {
  const { call } = mount()
  assert.equal((await call(OUTLINE_PATH, { sessionId: '../etc' })).status, 400)
  assert.equal((await call(OUTLINE_PATH, { sessionId: 'session-2' })).status, 404)
})

test('user and assistant messages are separate sections; tools and thinking default to none', async () => {
  const { response, value, text } = await mount().render({ sessionId: 'session-1', format: 'markdown' })
  assert.equal(response.status, 200)
  assert.equal(value.files[0].mime, 'text/markdown')
  const headings = text.split('\n').filter(line => line.startsWith('## '))
  assert.equal(headings.length, 4)
  assert.match(headings[0], /^## 用户/)
  assert.match(headings[1], /^## 助手/)
  assert.doesNotMatch(text, /已处理|读取 README\.md|I should read/)
  assert.match(text, /README 只有一个标题 \*\*Demo\*\*/)
  assert.doesNotMatch(text, /injected/)
})

test('each message is selected on its own', async () => {
  const { text } = await mount().render({
    sessionId: 'session-1', format: 'markdown',
    parts: [{ index: 0, user: false, assistant: true }, { index: 1, user: true, assistant: false }],
  })
  const headings = text.split('\n').filter(line => line.startsWith('## '))
  assert.deepEqual(headings.map(line => line.split(' ')[1]), ['助手', '用户'])
  assert.doesNotMatch(text, /帮我看看 README/)
  assert.doesNotMatch(text, /不客气/)
  assert.match(text, /谢谢/)
})

test('tool summary hides commands and output; "hidden" still means none', async () => {
  const { text } = await mount().render({ sessionId: 'session-1', format: 'markdown', tools: 'summary', thinking: 'none' })
  assert.match(text, /读取 README\.md/)
  assert.doesNotMatch(text, /SECRET_OUTPUT_LINE|file_path/)
  const hidden = await mount().render({ sessionId: 'session-1', format: 'markdown', tools: 'hidden' })
  assert.doesNotMatch(hidden.text, /读取 README\.md/)
})

test('thinking summaries go through the chosen model', async () => {
  const calls = []
  const { response, value, text } = await mount({ llm: fakeLlm(calls) }).render({
    sessionId: 'session-1', rounds: [0], format: 'html', tools: 'summary', thinking: 'summary', theme: 'night', model: { provider: 'p', model: 'm' },
  })
  assert.equal(response.status, 200)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].provider, 'p')
  assert.match(text, /data-theme="night"/)
  assert.match(text, /<details class="activity">/)
  assert.match(text, /T-r0i0/)
  assert.match(text, /S-r0i0/)
  assert.doesNotMatch(text, /谢谢/)
  assert.equal(value.summaryFailures, 0)
})

test('thinking summary without a model is refused; detailed shows everything', async () => {
  const { call, render } = mount()
  assert.equal((await call(RENDER_PATH, { sessionId: 'session-1', format: 'markdown', thinking: 'summary', model: null })).status, 400)
  const { text } = await render({ sessionId: 'session-1', format: 'markdown', tools: 'detailed', thinking: 'detailed', model: null })
  assert.match(text, /I should read the README first/)
  assert.match(text, /SECRET_OUTPUT_LINE/)
  assert.match(text, /\/repo\/README\.md/)
})

test('a failed model call falls back to rule-based tool lines', async () => {
  const llm = fakeLlm([])
  llm.prepareCall = async config => ({ config, async *stream() { yield { type: 'finish', reason: { kind: 'error', failure: { message: 'boom', code: 'X' } } } } })
  const { response, value, text } = await mount({ llm }).render({ sessionId: 'session-1', format: 'markdown', tools: 'summary', thinking: 'summary', model: { provider: 'p', model: 'm' } })
  assert.equal(response.status, 200)
  assert.equal(value.summaryFailures, 1)
  assert.match(text, /读取 README\.md/)
})

test('save writes without overwriting, and open accepts only exported files', async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cx-test-'))
  try {
    const opened = []
    const { call } = mount({ opened })
    const first = await (await call(RENDER_PATH, { sessionId: 'session-1', format: 'markdown', delivery: 'save', directory: dir })).json()
    const second = await (await call(RENDER_PATH, { sessionId: 'session-1', format: 'markdown', delivery: 'save', directory: dir })).json()
    assert.equal(first.delivery, 'save')
    assert.notEqual(first.files[0].path, second.files[0].path)
    assert.match(second.files[0].name, / \(2\)\.md$/)
    assert.ok(fs.existsSync(first.files[0].path))
    assert.equal((await call(OPEN_PATH, { path: first.files[0].path, action: 'reveal' })).status, 200)
    assert.deepEqual(opened.at(-1), { path: first.files[0].path, action: 'reveal' })
    assert.equal((await call(OPEN_PATH, { path: '/etc/hosts', action: 'open' })).status, 403)
    assert.equal((await call(RENDER_PATH, { sessionId: 'session-1', format: 'markdown', delivery: 'save', directory: path.join(dir, 'missing') })).status, 400)
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true })
  }
})

test('image export renders a PNG at the requested width', { timeout: 120000 }, async () => {
  const { response, value } = await mount().render({ sessionId: 'session-1', format: 'image', image: { width: 800, fontSize: null } })
  assert.equal(response.status, 200, JSON.stringify(value))
  assert.equal(value.files.length, 1)
  assert.equal(value.files[0].mime, 'image/png')
  const png = Buffer.from(value.files[0].base64, 'base64')
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG')
  assert.equal(png.readUInt32BE(16), 1600)
  assert.equal(value.fontSize, 22)
  const bad = await mount().call(RENDER_PATH, { sessionId: 'session-1', format: 'image', delivery: 'download', image: { width: 100 } })
  assert.equal(bad.status, 400)
})
