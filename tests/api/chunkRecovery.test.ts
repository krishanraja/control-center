import assert from 'node:assert/strict'
import test from 'node:test'
import { needsAppReload } from '../../src/lib/chunkRecovery'

test('a missing Vite route chunk needs a full app reload', () => {
  const messages = [
    'Failed to fetch dynamically imported module: https://example.test/assets/Board-old.js',
    'error loading dynamically imported module: https://example.test/assets/Board-old.js',
    'Importing a module script failed.',
    'Loading chunk 821 failed.',
  ]
  for (const message of messages) assert.equal(needsAppReload(new TypeError(message)), true, message)
  const named = new Error('The requested module is gone')
  named.name = 'ChunkLoadError'
  assert.equal(needsAppReload(named), true)
})

test('an ordinary component error retries only its subtree', () => {
  assert.equal(needsAppReload(new Error('Cannot read properties of undefined')), false)
  assert.equal(needsAppReload(undefined), false)
})
