import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const patches = parse(await readFile(new URL(manifest.dsh.bundle.patch, root), 'utf8'));

test('installable bundle ships MCP bridge, host guidance, and browser settings UI', async () => {
  assert.equal(manifest.name, 'dsh-zvec-grep');
  assert.equal(manifest.dsh.client?.platform, 'web');
  assert.equal(manifest.exports['./client']?.default, './lib/client.js');
  assert.equal(manifest.dependencies, undefined);
  const mod = await import(new URL(manifest.main, root));
  assert.equal(typeof mod.apply, 'function');
  assert.equal(typeof mod.checkQueryLanguageGuard, 'function');
  for (const file of [manifest.main, './lib/client.js', manifest.dsh.bundle.patch, 'README.md']) {
    await access(new URL(file, root));
  }
});

test('uniquely identified insertions; no global or foreign mutations', () => {
  assert.equal(patches.length, 1);
  assert.deepEqual(Object.keys(patches[0]), ['insert']);
  assert.equal(patches[0].insert.length, 2);
  const [row, guidanceRow] = patches[0].insert;
  assert.equal(row.id, 'mcp-zvec-grep');
  assert.equal(row.name, '@deepseek-ai/dsh-mcp-client');
  assert.deepEqual(Object.keys(row).sort(), ['config', 'id', 'name']);
  assert.equal(guidanceRow.id, 'zvec-grep-guidance');
  assert.equal(guidanceRow.name, 'dsh-zvec-grep');
  assert.equal(guidanceRow.config.requireEnglishQuery, true);
  assert.deepEqual(guidanceRow.config.autoIndexRoots, ['~/Dev']);
});

test('auto-index planner resolves project subfolders under ~/Dev and asks outside ~/Dev', async () => {
  const { resolveAutoIndexPlan } = await import(new URL(manifest.main, root));

  // Already indexed workspace
  const indexedPlan = resolveAutoIndexPlan(
    '/Users/gc/Dev/MyProject/dsh-plugin/dsh-zvec-grep/benchmarks/notebooklm-py-20261025/workspace',
    { autoIndexRoots: ['~/Dev'] },
  );
  assert.equal(indexedPlan.kind, 'already-indexed');

  // Unindexed project subfolder inside ~/Dev (e.g. notebooklm-py/src/notebooklm)
  const subDirPlan = resolveAutoIndexPlan(
    '/Users/gc/Dev/Opensource/notebooklm-py/src/notebooklm',
    { autoIndexRoots: ['~/Dev'] },
  );
  assert.equal(subDirPlan.kind, 'auto-index');
  assert.equal(subDirPlan.targetRoot, '/Users/gc/Dev/Opensource/notebooklm-py');

  // Multi-project container (e.g. ~/Dev/MyProject/dsh-plugin or ~/Dev/Opensource)
  const containerPlan = resolveAutoIndexPlan(
    '/Users/gc/Dev/MyProject/dsh-plugin',
    { autoIndexRoots: ['~/Dev'] },
  );
  assert.equal(containerPlan.kind, 'container-needs-selection');
  assert.ok(containerPlan.subprojects.includes('dsh-zvec-grep'));

  // Directory outside autoIndexRoots -> ask-user
  const outsidePlan = resolveAutoIndexPlan('/tmp', { autoIndexRoots: ['~/Dev'] });
  assert.equal(outsidePlan.kind, 'ask-user');
});

test('query-language guard blocks raw Chinese queries and allows English or bilingual queries', async () => {
  const { apply, checkQueryLanguageGuard, ZVEC_GREP_TOOL_NAME, ZVEC_GREP_PROMPT_SECTION_NAME } =
    await import(new URL(manifest.main, root));

  // Blocks pure Chinese semantic query
  const denied = checkQueryLanguageGuard({
    name: ZVEC_GREP_TOOL_NAME,
    arguments: { root: '/tmp/ws', query: '等待生成内容完成时，如何轮询状态、限制超时并处理失败？' },
  });
  assert.match(denied ?? '', /translate non-English search queries into English/);

  // Allows translated English query
  assert.equal(
    checkQueryLanguageGuard({
      name: ZVEC_GREP_TOOL_NAME,
      arguments: {
        root: '/tmp/ws',
        query: 'poll generation status wait for completion timeout failure',
        fts: ['poll_status', 'wait_for_completion'],
      },
    }),
    undefined,
  );

  // Allows bilingual queries array when searching both code and Chinese docs
  assert.equal(
    checkQueryLanguageGuard({
      name: ZVEC_GREP_TOOL_NAME,
      arguments: {
        root: '/tmp/ws',
        queries: ['poll generation status timeout', '状态轮询 超时'],
      },
    }),
    undefined,
  );

  // Ignores unrelated tools
  assert.equal(
    checkQueryLanguageGuard({
      name: 'grep',
      arguments: { pattern: '中文' },
    }),
    undefined,
  );

  // Verifies apply() registers systemPrompt section, tools guard, and webServer settings endpoint
  const sections = [];
  const guards = [];
  const routes = [];
  let toolVisible = true;
  const fakeCtx = {
    tools: {
      get: (toolName) => (toolVisible && toolName === ZVEC_GREP_TOOL_NAME ? {} : undefined),
      guard: (fn) => guards.push(fn),
    },
    systemPrompt: {
      getSectionOrder: () => 3100,
      section: (sec) => sections.push(sec),
    },
    webServer: {
      register: (route) => {
        routes.push(route);
        return () => {};
      },
    },
    effect(fn) {
      fn();
    },
    inject(deps, cb) {
      cb(new Proxy(this, {
        get(target, key) {
          if (!deps.includes(key)) throw new Error(`cannot get property "${String(key)}" without inject`);
          return target[key];
        },
      }));
    },
  };
  apply(fakeCtx, { requireEnglishQuery: true });
  assert.equal(sections.length, 1);
  assert.equal(sections[0].name, ZVEC_GREP_PROMPT_SECTION_NAME);
  assert.match(sections[0].text({}), /Translate non-English prompts into English/);
  toolVisible = false;
  assert.equal(sections[0].text({}), '', 'Section hides automatically when MCP tool is absent');
  assert.equal(guards.length, 1);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].path, '/api/dsh-zvec-grep/settings');
});

test('client bundle registers plugins.bundle.config card for dsh-zvec-grep', async () => {
  let loadedModule = null;
  globalThis.window = {
    __ModuleLoader__: {
      load(def) {
        loadedModule = def;
      },
    },
  };
  await import(new URL('./lib/client.js', root));
  assert.ok(loadedModule);
  assert.equal(loadedModule.id, 'dsh-zvec-grep');
  const clientExports = loadedModule.factory((id) => {
    if (id === 'react') {
      return {
        createElement: (type, props, ...children) => ({ type, props, children }),
        useState: (init) => [init, () => {}],
        useEffect: () => {},
      };
    }
    throw new Error(`Unexpected require: ${id}`);
  });
  const registeredSlots = [];
  const fakeClientCtx = {
    effect(fn) {
      fn();
    },
    locale: {
      register() {},
    },
    slots: {
      inject(_name, cb) {
        cb();
      },
      register(opts, component) {
        registeredSlots.push({ opts, component });
      },
    },
  };
  clientExports.apply(fakeClientCtx);
  assert.equal(registeredSlots.length, 1);
  assert.equal(registeredSlots[0].opts.name, 'plugins.bundle.config');
  assert.equal(registeredSlots[0].opts.key, 'dsh-zvec-grep');
});

test('stdio reuses the existing zg service without shell, installs or indexing', () => {
  const config = patches[0].insert[0].config;
  assert.equal(config.serverName, 'zvec_grep');
  assert.equal(config.transport, 'stdio');
  assert.equal(config.command, '/opt/homebrew/bin/node');
  assert.deepEqual(config.args, ['--liftoff-only', '/opt/homebrew/bin/zg', 'server', '--stdio']);
  assert.equal(config.toolCallTimeoutMs, 600000);
  assert.equal(config.failOnStartupError, true);
  assert.equal(config.env, undefined);
  assert.equal(config.cwd, undefined, 'do not pin searches to a single workspace');
  assert.equal(config.headers, undefined);
  assert.equal(config.url, undefined);
});

test('stable public namespace fits the DSH function-name contract', () => {
  const name = `mcp__${patches[0].insert[0].config.serverName}__zvec_grep_search`;
  assert.equal(name, 'mcp__zvec_grep__zvec_grep_search');
  assert.match(name, /^[A-Za-z0-9_-]{1,64}$/);
});
