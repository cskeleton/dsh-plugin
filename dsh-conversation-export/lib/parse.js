/**
 * Fold a raw Session event log into human-led conversation rounds.
 *
 * A round starts at each human `user/message` (source kind `user`) and holds
 * everything the assistant did until the next human message. Inside a round
 * the assistant output is a sequence of blocks:
 *   - `activity`: reasoning, tool calls, and narration text written beside
 *     tool calls — the part ChatGPT folds into "Thought for 12s".
 *   - `reply`: text from an assistant message that made no tool call — the
 *     visible answer.
 * Injected context (runtime context, skill catalogs, job notices, …) is not
 * a human message and never starts a round.
 */

/** Join the text blocks of a content array. */
export function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => block && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n\n')
}

function countType(content, type) {
  return Array.isArray(content) ? content.filter(block => block && block.type === type).length : 0
}

/** Collapse whitespace and clip to `max` characters with an ellipsis. */
export function preview(text, max) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** Plain-text preview of Markdown for one-line list rows: drops emphasis, code, heading, and link markup. */
export function plainPreview(text, max) {
  const plain = String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~|`)/g, '')
  return preview(plain, max)
}

function parseArgs(raw) {
  if (typeof raw !== 'string' || raw === '') return {}
  try {
    const value = JSON.parse(raw)
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : { value }
  } catch {
    return { raw }
  }
}

/**
 * @param {readonly any[]} events - complete raw Session events in seq order.
 * @returns {{ rounds: any[], lastModel?: { provider: string, model: string } }}
 */
export function foldRounds(events) {
  const rounds = []
  const toolsById = new Map()
  let current
  let lastModel

  const open = (prompt) => {
    current = {
      index: rounds.length,
      startTime: prompt?.time,
      prompt,
      raw: [],
      endTime: prompt?.time,
    }
    rounds.push(current)
  }

  for (const event of events) {
    if (event === null || typeof event !== 'object') continue
    const { type, data } = event
    if (type === 'user/message') {
      if (data?.source?.kind !== 'user') continue
      open({
        seq: event.seq,
        time: event.time,
        text: textOf(data.content),
        images: countType(data.content, 'image'),
        files: Array.isArray(data.content)
          ? data.content.filter(block => block?.type === 'file').map(block => block.attachment?.name ?? 'file')
          : [],
      })
      continue
    }
    if (type === 'assistant/message') {
      const message = data?.message
      const content = Array.isArray(message?.content) ? message.content : []
      if (message?.source?.kind === 'model' && typeof message.source.provider === 'string') {
        lastModel = { provider: message.source.provider, model: message.source.model }
      }
      if (current === undefined) open(undefined)
      const hasToolCall = content.some(block => block?.type === 'tool-call')
      for (const block of content) {
        if (block?.type === 'reasoning') {
          const text = typeof block.text === 'string' ? block.text.trim() : ''
          if (text !== '') current.raw.push({ kind: 'reasoning', text, time: event.time, seq: event.seq })
        } else if (block?.type === 'text') {
          const text = typeof block.text === 'string' ? block.text.trim() : ''
          if (text === '') continue
          current.raw.push({ kind: hasToolCall ? 'narration' : 'reply', text, time: event.time, seq: event.seq })
        } else if (block?.type === 'tool-call') {
          const tool = {
            kind: 'tool',
            id: String(block.id),
            name: String(block.name ?? 'tool'),
            args: parseArgs(block.arguments),
            argsText: typeof block.arguments === 'string' ? block.arguments : '',
            result: undefined,
            isError: false,
            time: event.time,
            endTime: event.time,
            seq: event.seq,
          }
          toolsById.set(tool.id, tool)
          current.raw.push(tool)
        }
      }
      if (data.interrupted === true) current.raw.push({ kind: 'note', note: 'interrupted', time: event.time, seq: event.seq })
      current.endTime = event.time
      continue
    }
    if (type === 'tool/result') {
      const message = data?.message
      const tool = toolsById.get(String(message?.toolCallId ?? message?.source?.callId))
      if (tool !== undefined) {
        tool.result = textOf(message?.content)
        const images = countType(message?.content, 'image')
        if (images > 0) tool.result += `${tool.result === '' ? '' : '\n'}[${images} image(s)]`
        tool.isError = message?.isError === true || data.error !== undefined
        tool.endTime = event.time
        if (current !== undefined && event.time > current.endTime) current.endTime = event.time
      }
      continue
    }
    if (type === 'turn/end' && current !== undefined) {
      const kind = data?.reason?.kind
      if (kind === 'error' || kind === 'aborted' || kind === 'max-tokens') {
        current.raw.push({
          kind: 'note',
          note: kind,
          detail: kind === 'error' ? String(data.reason.error?.message ?? '') : undefined,
          time: event.time,
          seq: event.seq,
        })
      }
      if (event.time > current.endTime) current.endTime = event.time
    }
  }

  for (const round of rounds) finalizeRound(round)
  return { rounds, lastModel }
}

/** Group raw items into alternating activity and reply blocks. */
function finalizeRound(round) {
  const blocks = []
  let activity
  let boundary = round.startTime
  round.raw.forEach((item, i) => { item.key = `r${round.index}i${i}` })
  for (const item of round.raw) {
    if (item.kind === 'reply') {
      if (activity !== undefined) {
        activity.endTime = item.time
        blocks.push(activity)
        activity = undefined
      }
      const last = blocks.at(-1)
      if (last?.kind === 'reply') last.text += `\n\n${item.text}`
      else blocks.push({ kind: 'reply', text: item.text, time: item.time })
      boundary = item.time
      continue
    }
    if (item.kind === 'note' && activity === undefined) {
      blocks.push({ kind: 'note', note: item.note, detail: item.detail })
      continue
    }
    if (activity === undefined) {
      activity = { kind: 'activity', items: [], startTime: boundary ?? item.time, endTime: item.time }
    }
    activity.items.push(item)
    activity.endTime = Math.max(activity.endTime, item.endTime ?? item.time)
  }
  if (activity !== undefined) blocks.push(activity)
  round.blocks = blocks
  delete round.raw

  let tools = 0
  let reasoning = 0
  for (const block of blocks) {
    if (block.kind !== 'activity') continue
    for (const item of block.items) {
      if (item.kind === 'tool') tools += 1
      else if (item.kind === 'reasoning') reasoning += 1
    }
  }
  const replies = blocks.filter(block => block.kind === 'reply')
  round.stats = {
    tools,
    reasoning,
    activityGroups: blocks.filter(block => block.kind === 'activity').length,
  }
  round.answerPreview = replies.length > 0 ? replies.at(-1).text : ''
  const firstNote = blocks.find(block => block.kind === 'note')
  round.notePreview = firstNote === undefined ? '' : firstNote.note
  const firstAssistant = blocks[0]
  round.assistantTime = firstAssistant === undefined
    ? undefined
    : firstAssistant.kind === 'activity' ? firstAssistant.items[0]?.time : firstAssistant.time
  round.hasAssistant = blocks.length > 0
}

/**
 * Lightweight per-round summary for the selection list.
 * @param {any} round - folded round.
 */
export function outlineOf(round) {
  return {
    index: round.index,
    time: round.startTime ?? null,
    prompt: round.prompt === undefined ? '' : plainPreview(round.prompt.text, 120),
    images: round.prompt?.images ?? 0,
    answer: plainPreview(round.answerPreview, 160),
    note: round.notePreview,
    hasPrompt: round.prompt !== undefined,
    hasAssistant: round.hasAssistant,
    tools: round.stats.tools,
    reasoning: round.stats.reasoning,
    activityGroups: round.stats.activityGroups,
  }
}
