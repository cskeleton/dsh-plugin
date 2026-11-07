// Run with the DSH host's Node runtime; for Desktop use ELECTRON_RUN_AS_NODE=1.
// DSH_PACKAGE_JSON points at its package.json; ZVEC_TEST_ROOT is already indexed.
// Uses the real shipped MCP bridge + real zg, with a small registry/lifetime stub.
// This proves bridge behavior, not the authenticated GUI installation itself.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { parse } = require('yaml');

async function main() {
  assert.ok(process.env.DSH_PACKAGE_JSON, 'Set DSH_PACKAGE_JSON to the host package.json');
  assert.ok(process.env.ZVEC_TEST_ROOT, 'Set ZVEC_TEST_ROOT to an already-indexed workspace');
  const host = createRequire(resolve(process.env.DSH_PACKAGE_JSON));
  const mcp = host('@deepseek-ai/dsh-mcp-client');
  const patch = parse(readFileSync(resolve(__dirname, '../cordis.patch.yml'), 'utf8'));
  const config = mcp.Config(patch[0].insert[0].config);
  const tools = new Map();
  const owner = {};
  const makeContext = () => {
    const effects = [];
    return {
      root: owner,
      fiber: {},
      logger: console,
      tools: { register(definition) {
        assert.ok(!tools.has(definition.name), `Duplicate tool: ${definition.name}`);
        tools.set(definition.name, definition);
        return () => tools.delete(definition.name);
      } },
      effect(setup) { const dispose = setup(); if (dispose) effects.push(dispose); },
      on() {},
      inject() {}, // Optional resource/system-prompt registries are absent in this stub.
      async dispose() { for (const dispose of effects.reverse()) await dispose(); },
    };
  };
  let ctx = makeContext();
  try {
    await mcp.apply(ctx, config);
    const names = [...tools.keys()];
    const searchName = 'mcp__zvec_grep__zvec_grep_search';
    assert.ok(tools.has(searchName), 'Search tool must be registered');
    console.log('Registered:', names.join(', '));
    const search = tools.get(searchName);
    const result = await search.execute({
      root: resolve(process.env.ZVEC_TEST_ROOT),
      query: 'MCP 的 stdio 桥接层在哪里把请求转发给本地服务？',
      limit: 3,
    }, { signal: AbortSignal.timeout(120000) });
    const text = JSON.stringify(result);
    assert.match(text, /stdio-bridge|http-transport/, 'Search must retrieve the indexed MCP bridge');
    assert.ok(!result.isError, 'MCP result must succeed');
    console.log('Search: relevant source returned');
    await ctx.dispose();
    assert.equal(tools.size, 0, 'Dispose must unregister all zvec tools');
    console.log('Disable: tool registry empty');
    ctx = makeContext();
    await mcp.apply(ctx, config);
    assert.deepEqual([...tools.keys()], names, 'Re-enable must release and reuse the namespace');
    console.log('Re-enable: identical tools restored');
  } finally {
    await ctx.dispose();
    assert.equal(tools.size, 0);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
