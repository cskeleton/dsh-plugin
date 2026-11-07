/**
 * Smoke test for lib/client.js: runs the browser bundle through a stubbed
 * Module Loader, Cordis client context, and clipboard, then activates the
 * registered menu row and asserts it copies the Session id and closes the menu.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')

// --- Module Loader stub: capture the registered row. -------------------------
let loaded = null
const sandbox = {
  window: {
    __ModuleLoader__: {
      load: (payload) => { loaded = payload },
    },
  },
  navigator: {
    clipboard: {
      writes: [],
      writeText(text) { this.writes.push(text); return Promise.resolve() },
    },
  },
  document: {
    createElement: () => ({ style: {}, select() {}, remove() {}, value: '' }),
    body: { appendChild() {} },
    execCommand: () => true,
  },
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(source, sandbox)

assert.ok(loaded, 'bundle did not call window.__ModuleLoader__.load')
assert.equal(loaded.id, 'dsh-client-ui-copy-session-id')

// --- Run the factory with stubbed externals. ---------------------------------
function MenuItemButton() {}
function IconCopyOutlineRegular() {}
const created = []
const requireStub = (id) => {
  if (id === 'react') return { createElement: (type, props, ...children) => { const el = { type, props, children }; created.push(el); return el } }
  if (id === '@deepseek-ai/dsh-client-ui-primitives') return { MenuItemButton, IconCopyOutlineRegular }
  throw new Error(`unexpected require: ${id}`)
}
const plugin = loaded.factory(requireStub)
// Values created inside the vm realm carry foreign prototypes; copy before comparing.
assert.deepEqual([...plugin.inject], ['slots', 'locale'])
assert.equal(typeof plugin.apply, 'function')

// --- Cordis client context stub. ---------------------------------------------
const dictionaries = {}
const registrations = []
const ctx = {
  effect(fn) { const dispose = fn(); assert.equal(typeof dispose === 'function' || dispose === undefined, true); return dispose },
  locale: {
    register: (ns, dicts) => { dictionaries[ns] = dicts; return () => {} },
  },
  slots: {
    inject: (name, contribute) => {
      assert.equal(name, 'sidebar.workspaces.session.menu.item')
      return contribute()
    },
    register: (decl, component) => { registrations.push({ decl, component }); return () => {} },
  },
}
plugin.apply(ctx)

assert.deepEqual(Object.keys(dictionaries), ['copy-session-id'])
// Round-trip through JSON to compare across vm realms.
assert.deepEqual(JSON.parse(JSON.stringify(dictionaries['copy-session-id'])), { zh: { copyId: '复制会话 ID' }, en: { copyId: 'Copy Session ID' } })
assert.equal(registrations.length, 1)
const { decl, component } = registrations[0]
assert.equal(decl.name, 'sidebar.workspaces.session.menu.item')
assert.equal(decl.id, 'copy-session-id')
assert.equal(decl.order, 500)
assert.equal(decl.locale, 'copy-session-id')

// --- Activate the row as the slot renderer would. ----------------------------
let menuOpen = true
const setMenuOpen = (v) => { menuOpen = v }
const element = component({
  sessionId: 'sess_test_123',
  useMenuOpenState: () => [menuOpen, setMenuOpen],
  t: (key) => dictionaries['copy-session-id'].zh[key],
})

assert.equal(element.type, MenuItemButton)
assert.equal(element.props.separatorBefore, true)
assert.equal(element.children[0], '复制会话 ID')
assert.equal(created[0].type, IconCopyOutlineRegular, 'icon element should be created first')

element.props.onSelect()
assert.equal(menuOpen, false, 'menu should close after activation')
assert.deepEqual(sandbox.navigator.clipboard.writes, ['sess_test_123'])

console.log('smoke test passed: menu row registered, copies session id, closes menu')
