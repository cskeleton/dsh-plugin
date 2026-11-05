/**
 * One-line summaries for tool calls and reasoning blocks.
 *
 * `heuristicToolSummary` needs no model and is always available, so the
 * condensed tool view works in every deployment. Reasoning summaries need a
 * model: `summarizeWithModel` sends one compact request per activity group
 * (split into chunks when large) and returns `{ [itemKey]: { title, text } }`.
 * Any failure falls back to the heuristic for tools and leaves reasoning
 * unsummarized; the caller counts those as warnings.
 */

import { preview } from './parse.js'

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/g

/** Pick the export language from the human prompts. */
export function detectLanguage(rounds) {
  let cjk = 0
  let total = 0
  for (const round of rounds) {
    const text = round.prompt?.text ?? ''
    total += text.length
    cjk += (text.match(CJK) ?? []).length
  }
  return total > 0 && cjk / total > 0.08 ? 'zh' : 'en'
}

function first(args, ...keys) {
  for (const key of keys) {
    const value = args?.[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

function base(path) {
  const parts = String(path).split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? String(path)
}

const PHRASES = {
  en: {
    bash: (d, c) => (d ? d : `Ran \`${preview(c, 60)}\``),
    read: p => `Read ${base(p)}`,
    write: p => `Wrote ${base(p)}`,
    edit: p => `Edited ${base(p)}`,
    grep: q => `Searched files for “${preview(q, 50)}”`,
    glob: q => `Listed files matching ${preview(q, 50)}`,
    web_search: q => `Searched the web for “${preview(q, 60)}”`,
    search: q => `Searched for “${preview(q, 60)}”`,
    web_fetch: u => `Read ${preview(u, 70)}`,
    skill: n => `Loaded skill ${n}`,
    subagent: d => `Delegated: ${preview(d, 60)}`,
    todo_write: () => 'Updated the task list',
    ask_user_question: () => 'Asked the user a question',
    generic: n => `Used ${n}`,
    failed: s => `${s} (failed)`,
  },
  zh: {
    bash: (d, c) => (d ? d : `运行命令 \`${preview(c, 60)}\``),
    read: p => `读取 ${base(p)}`,
    write: p => `写入 ${base(p)}`,
    edit: p => `修改 ${base(p)}`,
    grep: q => `在文件中搜索“${preview(q, 40)}”`,
    glob: q => `查找匹配 ${preview(q, 40)} 的文件`,
    web_search: q => `联网搜索“${preview(q, 40)}”`,
    search: q => `检索“${preview(q, 40)}”`,
    web_fetch: u => `读取网页 ${preview(u, 60)}`,
    skill: n => `加载技能 ${n}`,
    subagent: d => `委派子任务：${preview(d, 40)}`,
    todo_write: () => '更新任务清单',
    ask_user_question: () => '向用户提问',
    generic: n => `调用 ${n}`,
    failed: s => `${s}（失败）`,
  },
}

/**
 * Deterministic one-line description of a tool call.
 * @param {any} tool - folded tool item.
 * @param {'en'|'zh'} lang - output language.
 */
export function heuristicToolSummary(tool, lang) {
  const p = PHRASES[lang] ?? PHRASES.en
  const a = tool.args ?? {}
  const name = tool.name
  let text
  if (name === 'bash' || name === 'pwsh') text = p.bash(first(a, 'description'), first(a, 'command') ?? '')
  else if (name === 'read' || name === 'read_image') text = p.read(first(a, 'file_path', 'path') ?? '')
  else if (name === 'write') text = p.write(first(a, 'file_path', 'path') ?? '')
  else if (name === 'edit') text = p.edit(first(a, 'file_path', 'path') ?? '')
  else if (name === 'grep') text = p.grep(first(a, 'pattern') ?? '')
  else if (name === 'glob') text = p.glob(first(a, 'pattern') ?? '')
  else if (/search/.test(name) && !/session/.test(name)) {
    const q = first(a, 'query') ?? (Array.isArray(a.queries) ? a.queries.join(' / ') : '')
    const web = name === 'web_search' || /tavily|duckduckgo|grok|brave|exa|google|bing/.test(name)
    text = q ? (web ? p.web_search(q) : p.search(q)) : p.generic(name)
  } else if (name === 'web_fetch' || /read_url|extract/.test(name)) text = p.web_fetch(first(a, 'url', 'urls') ?? '')
  else if (name === 'skill') text = p.skill(first(a, 'name') ?? '')
  else if (name === 'subagent' || name === 'subagent_fork') text = p.subagent(first(a, 'description', 'prompt') ?? '')
  else if (name === 'todo_write') text = p.todo_write()
  else if (name === 'ask_user_question') text = p.ask_user_question()
  else {
    const hint = first(a, 'description', 'query', 'path', 'name')
    text = hint ? `${p.generic(name)}: ${preview(hint, 50)}` : p.generic(name)
  }
  return tool.isError ? p.failed(text) : text
}

const SYSTEM_PROMPT = `You write the collapsed "activity" lines of an AI-assistant chat transcript, in the style ChatGPT uses under "Thought for 12s".
You receive JSON entries of kind "tool" (a tool call and a clipped result) or "reasoning" (the assistant's private thinking).
Return ONLY a JSON object mapping each entry id to its summary, with no prose and no code fences:
{"<id>": {"title": "...", "text": "..."}}
Rules:
- Write in LANGUAGE. Use plain prose; never include raw commands, code, JSON, or long paths.
- tool: "title" is one short past-tense sentence saying what the step did and, when the result shows it, what it found (at most 16 words, or 30 CJK characters). Mark failures. Leave "text" empty.
- reasoning: "title" is one short first-person sentence ("I'm checking…", "我在确认…") saying what the assistant was working out or decided (at most 24 words, or 40 CJK characters). Omit secrets and filler. Leave "text" empty.
- Every input id must appear exactly once.`

function clip(text, max) {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max)} …[${value.length - max} more chars]` : value
}

/** Build model-input entries for one activity group. */
function entriesOf(group, keyOf, wantTools, wantReasoning) {
  const entries = []
  for (const item of group.items) {
    if (item.kind === 'tool' && wantTools) {
      entries.push({
        id: keyOf(item),
        kind: 'tool',
        name: item.name,
        arguments: clip(item.argsText, 700),
        result: clip(item.result ?? '(no result)', 500),
        failed: item.isError || undefined,
      })
    } else if (item.kind === 'reasoning' && wantReasoning) {
      entries.push({ id: keyOf(item), kind: 'reasoning', text: clip(item.text, 2400) })
    }
  }
  return entries
}

function chunk(entries, maxChars) {
  const chunks = []
  let currentChunk = []
  let size = 0
  for (const entry of entries) {
    const length = JSON.stringify(entry).length
    if (currentChunk.length > 0 && size + length > maxChars) {
      chunks.push(currentChunk)
      currentChunk = []
      size = 0
    }
    currentChunk.push(entry)
    size += length
  }
  if (currentChunk.length > 0) chunks.push(currentChunk)
  return chunks
}

/** Extract the first JSON object from model output. */
export function parseSummaryJson(text) {
  const stripped = String(text).replace(/```(?:json)?/gi, '')
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    const value = JSON.parse(stripped.slice(start, end + 1))
    return value !== null && typeof value === 'object' ? value : undefined
  } catch {
    return undefined
  }
}

async function callModel(llm, route, prompt, signal) {
  const config = { provider: route.provider, model: route.model }
  const prepared = await llm.prepareCall(config, signal)
  let text = ''
  for await (const chunkValue of prepared.stream({
    ...prepared.config,
    system: SYSTEM_PROMPT.replace('LANGUAGE', route.language),
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    signal,
  })) {
    if (chunkValue.type === 'text-delta') text += chunkValue.text
    else if (chunkValue.type === 'finish' && (chunkValue.reason.kind === 'error' || chunkValue.reason.kind === 'aborted')) {
      throw new Error(chunkValue.reason.failure?.message ?? chunkValue.reason.kind)
    }
  }
  return text
}

async function pool(tasks, limit) {
  const results = new Array(tasks.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next++
      results[index] = await tasks[index]()
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * Summarize selected activity groups with one model.
 * @param {object} options
 * @param {any} options.llm - Host `ctx.llm`.
 * @param {{provider: string, model: string}} options.route - chosen model.
 * @param {'en'|'zh'} options.language - output language.
 * @param {any[]} options.rounds - selected folded rounds.
 * @param {boolean} options.tools - summarize tool calls.
 * @param {boolean} options.reasoning - summarize reasoning blocks.
 * @param {number} options.concurrency - parallel model calls.
 * @param {number} options.timeoutMs - per-call timeout.
 * @param {AbortSignal} options.signal - request cancellation.
 * @returns {Promise<{ summaries: Map<string, {title: string, text: string}>, failures: number, calls: number }>}
 */
export async function summarizeWithModel(options) {
  const { llm, route, language, rounds, concurrency, timeoutMs, signal } = options
  const languageName = language === 'zh' ? 'Simplified Chinese' : 'English'
  const tasks = []
  for (const round of rounds) {
    const context = round.prompt === undefined ? '' : preview(round.prompt.text, 400)
    for (const block of round.blocks) {
      if (block.kind !== 'activity') continue
      const entries = entriesOf(block, item => item.key, options.tools, options.reasoning)
      for (const part of chunk(entries, 14000)) {
        tasks.push(async () => {
          const callSignal = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
          const prompt = `The user's request in this round: ${JSON.stringify(context)}\n\nEntries:\n${JSON.stringify(part)}`
          try {
            const output = await callModel(llm, { ...route, language: languageName }, prompt, callSignal)
            return { part, parsed: parseSummaryJson(output) }
          } catch (error) {
            signal.throwIfAborted()
            return { part, parsed: undefined, error }
          }
        })
      }
    }
  }
  const results = await pool(tasks, concurrency)
  const summaries = new Map()
  let failures = 0
  for (const { part, parsed } of results) {
    if (parsed === undefined) {
      failures += 1
      continue
    }
    for (const entry of part) {
      const value = parsed[entry.id]
      if (value === null || typeof value !== 'object') continue
      const title = typeof value.title === 'string' ? value.title.trim() : ''
      const text = typeof value.text === 'string' ? value.text.trim() : ''
      if (title !== '' || text !== '') summaries.set(entry.id, { title, text })
    }
  }
  return { summaries, failures, calls: tasks.length }
}

/** Count the model calls an export would make, for the dialog estimate. */
export function estimateCalls(rounds, tools, reasoning) {
  let calls = 0
  for (const round of rounds) {
    for (const block of round.blocks) {
      if (block.kind !== 'activity') continue
      const entries = entriesOf(block, item => item.key, tools, reasoning)
      calls += chunk(entries, 14000).length
    }
  }
  return calls
}
