/**
 * Host plugin for `dsh-zvec-grep`: pairs with the native `@deepseek-ai/dsh-mcp-client`
 * bridge (`mcp-zvec-grep`) to provide:
 * 1. English query-translation guidance and pre-execution guard for code search.
 * 2. On-demand per-project auto-indexing under configured `autoIndexRoots` (e.g. `~/Dev`),
 *    plus an interactive `ask_user_question` prompt when an unindexed workspace outside
 *    `autoIndexRoots` (or a multi-project container directory) is searched.
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const name = 'zvec-grep-guidance';

export const ZVEC_GREP_TOOL_NAME = 'mcp__zvec_grep__zvec_grep_search';
export const ZVEC_GREP_PROMPT_SECTION_NAME = 'mcp:zvec_grep:query-language';
export const ZVEC_GREP_SETTINGS_ENDPOINT = '/api/dsh-zvec-grep/settings';
export const ZVEC_GREP_SETTINGS_HEADER = 'x-dsh-zvec-grep-settings';

const HAN_SCRIPT_RE = /\p{Script=Han}/u;
const ASCII_LETTER_RE = /[A-Za-z]/;

const PROJECT_MARKERS = [
  '.git',
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'CMakeLists.txt',
  'Makefile',
  'SKILL.md',
];

const KNOWN_CATEGORY_CONTAINERS = new Set([
  'MyProject',
  'Opensource',
  'AgentSkills',
  'DSHSkills',
  'mcp',
  'Inbox',
]);

export const ZVEC_GREP_QUERY_LANGUAGE_INSTRUCTIONS = [
  '### zvec-grep query-language & auto-indexing rules',
  '',
  'When calling `mcp__zvec_grep__zvec_grep_search`:',
  '- **Translate non-English prompts into English before searching code**: Source identifiers, docstrings, comments, and BM25/FTS tokens in codebases are predominantly English. Always translate Chinese or other non-English user questions into concise English technical queries for `query`, `queries`, `fts`, and `vector` (e.g., translate "等待生成内容完成时，如何轮询状态、限制超时并处理失败？" into `query: "poll generation status wait for completion timeout failure"`, `fts: ["poll_status", "wait_for_completion", "TimeoutError"]`).',
  '- **Never mix a Chinese sentence with generic English tokens (`CLI`, `ID`, `--wait`) in `query`**: In hybrid search, Chinese words match 0 BM25 tokens in English code while generic English words receive top BM25 ranks and drown out semantic recall. Put English semantic intent in `query` or `vector`, and put concrete candidate identifier names in `fts`.',
  '- **Searching Chinese docs or localized UI copy**: When Chinese text is genuinely the search target, pass both an English code query and a Chinese query in `queries` (`queries: ["<English technical query>", "<Chinese query>"]`).',
  '- **Missing index & container handling**: Concrete project subfolders under configured `autoIndexRoots` (such as `~/Dev`) are indexed automatically on first search. If a search returns `[MULTI_PROJECT_CONTAINER]`, re-call `mcp__zvec_grep__zvec_grep_search` with the relevant subproject path as `root`, or use `ask_user_question` if ambiguous. If a search returns `[INDEX_MISSING_ASK_USER]`, call `ask_user_question` to ask the user whether to index the current workspace directory, index a specific directory, or skip indexing and use native `grep`.',
].join('\n');

/**
 * Expand leading `~` or `~/` to the current user's home directory.
 * @param {string} inputPath
 * @returns {string}
 */
export function expandHome(inputPath) {
  if (inputPath === '~') return homedir();
  if (inputPath.startsWith('~/')) return join(homedir(), inputPath.slice(2));
  return inputPath;
}

function safeRealpath(target) {
  const abs = resolve(expandHome(target));
  try {
    return realpathSync(abs);
  } catch {
    return abs;
  }
}

function hasDirectoryMarker(dir, markers = PROJECT_MARKERS) {
  return markers.some((m) => existsSync(join(dir, m)));
}

/**
 * Walk up from `startDir` to check whether a `.zvec-grep` index already exists.
 * @param {string} startDir
 * @returns {string | null}
 */
export function findExistingIndexRoot(startDir) {
  let current = safeRealpath(startDir);
  while (true) {
    const zgDir = join(current, '.zvec-grep');
    if (existsSync(join(zgDir, 'manifest.json')) && existsSync(join(zgDir, 'index.zvec'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function listChildDirectories(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Determine whether `requestedRoot` is already indexed, should be auto-indexed as a
 * project subfolder under `autoIndexRoots`, is a multi-project container, or should
 * prompt the user via `ask_user_question`.
 *
 * @param {string} requestedRoot
 * @param {{ autoIndexRoots?: string[] }} [options]
 */
export function resolveAutoIndexPlan(requestedRoot, options = {}) {
  if (typeof requestedRoot !== 'string' || !requestedRoot.trim()) {
    return { kind: 'pass-through' };
  }
  const absRoot = safeRealpath(requestedRoot);
  try {
    if (!statSync(absRoot).isDirectory()) return { kind: 'pass-through' };
  } catch {
    return { kind: 'pass-through' };
  }

  const existingIndex = findExistingIndexRoot(absRoot);
  if (existingIndex) {
    return { kind: 'already-indexed', indexRoot: existingIndex };
  }

  const configuredRoots = (options.autoIndexRoots ?? ['~/Dev']).map(safeRealpath);
  const matchedBase = configuredRoots.find(
    (base) => absRoot === base || absRoot.startsWith(base + sep),
  );

  if (matchedBase) {
    // Never index the top-level autoIndexRoot (e.g. ~/Dev) itself as a single index
    if (absRoot === matchedBase) {
      return {
        kind: 'container-needs-selection',
        requestedRoot: absRoot,
        subprojects: listChildDirectories(absRoot).slice(0, 20),
      };
    }

    // Walk up from absRoot (stopping before matchedBase) to find a project root with markers
    let cursor = absRoot;
    let nearestMarkerDir = null;
    while (cursor !== matchedBase && cursor.startsWith(matchedBase + sep)) {
      if (hasDirectoryMarker(cursor)) {
        nearestMarkerDir = cursor;
        break;
      }
      const parent = dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }

    if (nearestMarkerDir) {
      return {
        kind: 'auto-index',
        targetRoot: nearestMarkerDir,
        requestedRoot: absRoot,
      };
    }

    // No marker on absRoot or its ancestors below matchedBase: check if absRoot is a
    // category container (e.g. ~/Dev/MyProject) or a parent folder holding child projects
    const relSegments = relative(matchedBase, absRoot).split(sep).filter(Boolean);
    const children = listChildDirectories(absRoot);
    const childProjects = children.filter((name) => hasDirectoryMarker(join(absRoot, name)));

    if (
      childProjects.length > 0 ||
      (relSegments.length === 1 && KNOWN_CATEGORY_CONTAINERS.has(relSegments[0]))
    ) {
      return {
        kind: 'container-needs-selection',
        requestedRoot: absRoot,
        subprojects: (childProjects.length > 0 ? childProjects : children).slice(0, 20),
      };
    }

    // Leaf project directory under matchedBase without a standard marker file
    const projectDepth = KNOWN_CATEGORY_CONTAINERS.has(relSegments[0]) ? 2 : 1;
    const targetRoot =
      relSegments.length >= projectDepth
        ? join(matchedBase, ...relSegments.slice(0, projectDepth))
        : absRoot;
    return {
      kind: 'auto-index',
      targetRoot,
      requestedRoot: absRoot,
    };
  }

  // Outside autoIndexRoots: find nearest marker ancestor or use absRoot and ask the user
  let cursor = absRoot;
  let candidateRoot = absRoot;
  while (true) {
    if (hasDirectoryMarker(cursor)) {
      candidateRoot = cursor;
      break;
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return {
    kind: 'ask-user',
    requestedRoot: absRoot,
    candidateRoot,
  };
}

/**
 * Normalize query strings from a `mcp__zvec_grep__zvec_grep_search` argument object.
 * @param {unknown} args
 * @returns {string[]}
 */
export function collectSemanticQueries(args) {
  if (typeof args !== 'object' || args === null) return [];
  const out = [];
  if (typeof args.query === 'string' && args.query.trim()) {
    out.push(args.query.trim());
  }
  for (const key of ['queries', 'vector']) {
    if (Array.isArray(args[key])) {
      for (const item of args[key]) {
        if (typeof item === 'string' && item.trim()) {
          out.push(item.trim());
        }
      }
    }
  }
  return out;
}

/**
 * Check whether a `mcp__zvec_grep__zvec_grep_search` call violates the English
 * query-translation rule (contains CJK semantic queries without any English query).
 * @param {{ name?: string, arguments?: unknown }} exec
 * @returns {string | undefined} denial reason when rejected, or `undefined` when allowed.
 */
export function checkQueryLanguageGuard(exec) {
  if (exec?.name !== ZVEC_GREP_TOOL_NAME) return undefined;
  const queries = collectSemanticQueries(exec.arguments);
  if (queries.length === 0) return undefined;
  const hasCjkQuery = queries.some((q) => HAN_SCRIPT_RE.test(q));
  if (!hasCjkQuery) return undefined;
  const hasEnglishOnlyQuery = queries.some((q) => !HAN_SCRIPT_RE.test(q) && ASCII_LETTER_RE.test(q));
  if (hasEnglishOnlyQuery) return undefined;
  return (
    'zvec-grep query-language guard: translate non-English search queries into English technical terms ' +
    'before calling mcp__zvec_grep__zvec_grep_search (for example, pass an English `query`/`vector` ' +
    'and optional identifier anchors in `fts`; when searching Chinese docs or UI copy alongside code, ' +
    'include both an English query and a Chinese query in `queries`).'
  );
}

function defaultSettingsPath() {
  const dshHome =
    typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.trim()
      ? process.env.DSH_HOME.trim()
      : join(homedir(), '.dsh');
  return join(dshHome, 'zvec-grep', 'settings.json');
}

export function normalizeAutoIndexRoots(roots, fallback = ['~/Dev']) {
  if (!Array.isArray(roots)) return [...fallback];
  const seen = new Set();
  const out = [];
  for (const item of roots) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function loadPersistedSettings(settingsPath, defaults) {
  if (!existsSync(settingsPath)) return { ...defaults };
  try {
    const raw = JSON.parse(readFileSync(settingsPath, 'utf8'));
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...defaults };
    return {
      autoIndexRoots: Array.isArray(raw.autoIndexRoots)
        ? normalizeAutoIndexRoots(raw.autoIndexRoots, defaults.autoIndexRoots)
        : [...defaults.autoIndexRoots],
      requireEnglishQuery:
        typeof raw.requireEnglishQuery === 'boolean'
          ? raw.requireEnglishQuery
          : defaults.requireEnglishQuery,
    };
  } catch {
    return { ...defaults };
  }
}

export function savePersistedSettings(settingsPath, settings) {
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

function isLoopbackAddress(value) {
  const addr = value?.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    addr === 'localhost' ||
    addr === '::1' ||
    addr?.startsWith('127.') === true ||
    addr?.startsWith('::ffff:127.') === true
  );
}

function isTrustedSettingsPost(request) {
  const hdr = request.headers?.[ZVEC_GREP_SETTINGS_HEADER];
  const headerVal = Array.isArray(hdr) ? hdr[0] : hdr;
  if (headerVal !== '1') return false;
  if (request.socket?.remoteAddress && !isLoopbackAddress(request.socket.remoteAddress)) {
    return false;
  }
  return true;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function readRequestJson(request) {
  return new Promise((resolvePromise) => {
    const chunks = [];
    let bytes = 0;
    request.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buf.length;
      if (bytes <= 64 * 1024) chunks.push(buf);
    });
    request.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolvePromise(
          parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null,
        );
      } catch {
        resolvePromise(null);
      }
    });
    request.on('error', () => resolvePromise(null));
  });
}

/**
 * Mount the prompt section, query-language guard, on-demand auto-indexer, and GUI settings endpoint.
 * @param {any} ctx
 * @param {{ requireEnglishQuery?: boolean, autoIndexRoots?: string[], settingsPath?: string, nodeCommand?: string, zgPath?: string }} [config]
 */
export function apply(ctx, config = {}) {
  const settingsPath = config?.settingsPath ?? defaultSettingsPath();
  const defaults = {
    autoIndexRoots: normalizeAutoIndexRoots(config?.autoIndexRoots, ['~/Dev']),
    requireEnglishQuery: config?.requireEnglishQuery !== false,
  };
  let liveSettings = loadPersistedSettings(settingsPath, defaults);

  const nodeCommand = config?.nodeCommand ?? '/opt/homebrew/bin/node';
  const zgPath = config?.zgPath ?? '/opt/homebrew/bin/zg';
  const inFlightIndexes = new Map();

  async function ensureIndexed(targetRoot, signal) {
    let job = inFlightIndexes.get(targetRoot);
    if (!job) {
      job = execFileAsync(nodeCommand, ['--liftoff-only', zgPath, 'index', targetRoot, '--mode', 'server'], {
        signal,
        maxBuffer: 10 * 1024 * 1024,
      }).finally(() => {
        inFlightIndexes.delete(targetRoot);
      });
      inFlightIndexes.set(targetRoot, job);
    }
    await job;
  }

  ctx.inject(['systemPrompt', 'tools'], (inner) => {
    inner.systemPrompt.section({
      name: ZVEC_GREP_PROMPT_SECTION_NAME,
      order: inner.systemPrompt.getSectionOrder('MCP_SERVERS'),
      interpolate: false,
      text: (assembleCtx) => {
        if (inner.tools?.get && inner.tools.get(ZVEC_GREP_TOOL_NAME, assembleCtx?.scope) === undefined) {
          return '';
        }
        return ZVEC_GREP_QUERY_LANGUAGE_INSTRUCTIONS;
      },
    });
  });

  ctx.inject(['tools'], (inner) => {
    inner.tools.guard((exec) => {
      if (!liveSettings.requireEnglishQuery) return undefined;
      return checkQueryLanguageGuard(exec);
    });
  });

  ctx.inject(['webServer'], (inner) => {
    const disposeRoute = inner.webServer.register({
      kind: 'exact',
      path: ZVEC_GREP_SETTINGS_ENDPOINT,
      handler: async (request, response) => {
        if (request.method === 'GET' || request.method === 'HEAD') {
          liveSettings = loadPersistedSettings(settingsPath, defaults);
          sendJson(response, 200, { ok: true, ...liveSettings });
          return;
        }
        if (request.method === 'POST') {
          if (!isTrustedSettingsPost(request)) {
            sendJson(response, 403, { ok: false, error: 'Forbidden' });
            return;
          }
          const body = await readRequestJson(request);
          if (!body) {
            sendJson(response, 400, { ok: false, error: 'Invalid JSON body' });
            return;
          }
          const nextSettings = {
            autoIndexRoots: Array.isArray(body.autoIndexRoots)
              ? normalizeAutoIndexRoots(body.autoIndexRoots, [])
              : liveSettings.autoIndexRoots,
            requireEnglishQuery:
              typeof body.requireEnglishQuery === 'boolean'
                ? body.requireEnglishQuery
                : liveSettings.requireEnglishQuery,
          };
          savePersistedSettings(settingsPath, nextSettings);
          liveSettings = nextSettings;
          sendJson(response, 200, { ok: true, ...liveSettings });
          return;
        }
        response.writeHead(405, { allow: 'GET, HEAD, POST' });
        response.end();
      },
    });
    if (typeof ctx.effect === 'function' && typeof disposeRoute === 'function') {
      ctx.effect(() => disposeRoute, 'zvec-grep-guidance: settings route');
    }
  });

  if (typeof ctx.on === 'function') {
    ctx.on('tools/execute', async (exec, next) => {
      if (exec?.name !== ZVEC_GREP_TOOL_NAME) return next();
      const currentRoots = liveSettings.autoIndexRoots;
      const plan = resolveAutoIndexPlan(exec.arguments?.root, { autoIndexRoots: currentRoots });
      if (plan.kind === 'already-indexed' || plan.kind === 'pass-through') {
        return next();
      }
      if (plan.kind === 'auto-index') {
        await ensureIndexed(plan.targetRoot, exec.signal);
        return next();
      }
      if (plan.kind === 'container-needs-selection') {
        const list = plan.subprojects.length > 0 ? plan.subprojects.join(', ') : '(none)';
        throw new Error(
          `[MULTI_PROJECT_CONTAINER] "${plan.requestedRoot}" is a multi-project container directory rather than a single project ` +
            `(detected subprojects: ${list}). If the user's question targets a specific subproject, call ${ZVEC_GREP_TOOL_NAME} ` +
            `again with that subproject's absolute path as \`root\` (it will be indexed automatically). Otherwise, call ` +
            `\`ask_user_question\` to ask the user which subfolder (or "${plan.requestedRoot}" itself) to index, or whether to use native grep.`,
        );
      }
      const rootsLabel = currentRoots.length > 0 ? currentRoots.join(', ') : '(none)';
      throw new Error(
        `[INDEX_MISSING_ASK_USER] No zvec-grep index exists for "${plan.requestedRoot}" (outside configured autoIndexRoots: ${rootsLabel}). ` +
          `Call \`ask_user_question\` to ask the user whether to: (1) index the project directory "${plan.candidateRoot}" now ` +
          `(if approved, run \`/opt/homebrew/bin/zg index "${plan.candidateRoot}" --mode server\` and retry ${ZVEC_GREP_TOOL_NAME}), ` +
          `(2) specify a different directory to index, or (3) skip indexing and use native grep.`,
      );
    });
  }
}

