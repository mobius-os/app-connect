import assert from 'node:assert/strict'
import test from 'node:test'
import { loadConnectionList } from './connect-api.mjs'

for (const status of [404, 501]) {
  test(`HTTP ${status} explains missing platform support without promising a restart`, async t => {
    t.mock.method(globalThis, 'fetch', async () => new Response('', { status }))
    const result = await loadConnectionList('/api/connect/outbound', 'connections', 'Shared access', {})
    assert.equal(result.ready, false)
    assert.match(result.notice.title, /not supported/)
    assert.match(result.notice.message, /platform update/)
    assert.match(result.notice.message, /repeated restarts will not add it/)
  })
}

test('503 reports an unavailable service, not an absent update or restart requirement', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }))
  const result = await loadConnectionList('/api/connect/hosts', 'hosts', 'Connect', {})
  assert.match(result.notice.title, /unavailable/)
  assert.match(result.notice.message, /check the service/)
  assert.doesNotMatch(result.notice.message, /platform update/)
})

test('a missing sharing route leaves the machine list usable', async t => {
  const headers = { Authorization: 'Bearer test-only' }
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.deepEqual(options.headers, headers)
    return url.endsWith('/hosts')
      ? Response.json({ hosts: [{ id: 'test-host' }] })
      : new Response('', { status: 404 })
  })
  const [machines, shared] = await Promise.all([
    loadConnectionList('/api/connect/hosts', 'hosts', 'Connect', headers),
    loadConnectionList('/api/connect/outbound', 'connections', 'Shared access', headers),
  ])
  assert.equal(machines.ready, true)
  assert.deepEqual(machines.items, [{ id: 'test-host' }])
  assert.equal(shared.ready, false)
})

test('network failure in one direction does not reject the successful direction', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/hosts')) throw new TypeError('Failed to fetch')
    return Response.json({ connections: [] })
  })
  const [machines, shared] = await Promise.all([
    loadConnectionList('/api/connect/hosts', 'hosts', 'Connect', {}),
    loadConnectionList('/api/connect/outbound', 'connections', 'Shared access', {}),
  ])
  assert.equal(machines.ready, false)
  assert.equal(shared.ready, true)
  assert.equal(shared.notice, null)
})

test('malformed success data is an error, not an empty saved list', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'Wrong service' }))
  const result = await loadConnectionList('/api/connect/hosts', 'hosts', 'Connect', {})
  assert.equal(result.ready, false)
  assert.match(result.notice.message, /unexpected response/)
})

test('authorization failures retain the service detail rather than recommending restarts', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'Permission denied' }, { status: 403 }))
  const result = await loadConnectionList('/api/connect/hosts', 'hosts', 'Connect', {})
  assert.equal(result.ready, false)
  assert.equal(result.notice.message, 'Permission denied')
})

test('a successful refresh clears a previous service failure', async t => {
  let ready = false
  t.mock.method(globalThis, 'fetch', async () => ready ? Response.json({ hosts: [] }) : new Response('', { status: 503 }))
  assert.equal((await loadConnectionList('/api/connect/hosts', 'hosts', 'Connect', {})).ready, false)
  ready = true
  assert.deepEqual(await loadConnectionList('/api/connect/hosts', 'hosts', 'Connect', {}), {
    ready: true, items: [], notice: null,
  })
})
