import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

function loadTestApi(fetch, desktop) {
  let definition
  const context = {
    fetch,
    __DSH_DIRECTORY_PICKER__: desktop,
    window: {
      __ModuleLoader__: {
        load(value) { definition = value },
      },
    },
  }
  const instrumented = source.replace(
    '    exports.apply = apply;',
    '    exports.__test = { prepareImageSave };\n    exports.apply = apply;',
  )
  vm.runInNewContext(instrumented, context)
  return definition.factory(() => ({ createElement: () => null })).__test
}

test('local image downloads use the cancellable Host picker and Host save', async () => {
  let request
  const controller = new AbortController()
  const { prepareImageSave } = loadTestApi(async (route, options) => {
    request = { route, options }
    return { ok: true, json: async () => ({ path: '/tmp/chosen-images' }) }
  })

  const destination = await prepareImageSave(
    { available: true, picker: true },
    '/tmp/default-images',
    controller.signal,
  )

  assert.equal(destination.delivery, 'save')
  assert.equal(destination.directory, '/tmp/chosen-images')
  assert.equal(request.route, 'api/conversation-export.pick')
  assert.strictEqual(request.options.signal, controller.signal)
})

test('cancelling the Host picker leaves no export destination', async () => {
  const { prepareImageSave } = loadTestApi(async () => ({
    ok: true,
    json: async () => ({ path: null }),
  }))

  const destination = await prepareImageSave({ available: true, picker: true }, '', new AbortController().signal)

  assert.equal(destination, null)
})

test('Desktop uses its native directory bridge without a Host pick request', async () => {
  let called = false
  let picks = 0
  const { prepareImageSave } = loadTestApi(async () => {
    called = true
    throw new Error('unexpected Host request')
  }, {
    pick: async () => {
      picks++
      return '/tmp/desktop-images'
    },
  })

  const destination = await prepareImageSave({ available: true, picker: false }, '', new AbortController().signal)

  assert.equal(destination.delivery, 'save')
  assert.equal(destination.directory, '/tmp/desktop-images')
  assert.equal(picks, 1)
  assert.equal(called, false)
})

test('a Host without a native picker saves to the configured folder', async () => {
  let called = false
  const { prepareImageSave } = loadTestApi(async () => {
    called = true
    throw new Error('unexpected Host request')
  })

  const destination = await prepareImageSave(
    { available: true, picker: false },
    '/tmp/default-images',
    new AbortController().signal,
  )

  assert.equal(destination.delivery, 'save')
  assert.equal(destination.directory, '/tmp/default-images')
  assert.equal(called, false)
})
