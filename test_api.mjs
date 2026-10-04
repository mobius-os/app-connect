import assert from 'node:assert/strict'
import test from 'node:test'
import { INITIAL_LIST, ServerError, failureMessage, loadConnectionList, nextList, responseErrorData, serverError } from './connect-api.mjs'

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
  assert.deepEqual(shared.data, { connections: [] })
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
    ready: true, transient: false, items: [], notice: null, data: { hosts: [] },
  })
})

test('temporary failure is marked transient for keeping a prior snapshot', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch') })
  const result = await loadConnectionList('/api/connect/hosts', 'hosts', 'Connect', {})
  assert.equal(result.ready, false)
  assert.equal(result.transient, true)
})

test('unsupported and malformed responses must not preserve a stale snapshot', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }))
  assert.equal((await loadConnectionList('/api/connect/hosts', 'hosts', 'Connect', {})).transient, false)
  t.mock.restoreAll()
  t.mock.method(globalThis, 'fetch', async () => Response.json({ wrong: [] }))
  assert.equal((await loadConnectionList('/api/connect/hosts', 'hosts', 'Connect', {})).transient, false)
})

test('typed error parser preserves detail and code without guessing from copy', async () => {
  const response = Response.json({ detail: 'Busy', code: 'host_busy' }, { status: 409 })
  assert.deepEqual(await responseErrorData(response, 'Fallback'), { detail: 'Busy', code: 'host_busy' })
})

test('a failed list read reports its HTTP status and error code', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'Link first', code: 'account_unlinked' }, { status: 409 }))
  const result = await loadConnectionList('/api/connect/browser-access/shared', 'instances', 'Shared Möbius', {})
  assert.equal(result.status, 409)
  assert.equal(result.code, 'account_unlinked')
  assert.equal(result.notice.message, 'Link first')
})

test('list state keeps data only through temporary failures', () => {
  const ready = nextList(INITIAL_LIST, { ready: true, items: [1], data: { hosts: [1] } })
  assert.equal(ready.status, 'ready')
  const notice = { title: 'Down', message: 'Later' }
  const stale = nextList(ready, { ready: false, transient: true, status: 503, notice })
  assert.deepEqual([stale.status, stale.items, stale.data, stale.notice], ['stale', [1], { hosts: [1] }, notice])
  assert.equal(nextList(stale, { ready: false, transient: true, notice }).status, 'stale')
  assert.equal(nextList(stale, { ready: true, items: [], data: {} }).notice, null)
  const neverLoaded = nextList(INITIAL_LIST, { ready: false, transient: true, status: 503, notice })
  assert.deepEqual([neverLoaded.status, neverLoaded.items], ['failed', []])
  const malformed = nextList(ready, { ready: false, transient: false, status: 200, notice })
  assert.deepEqual([malformed.status, malformed.items], ['failed', []])
})

test('refused or missing routes are unsupported, which stops polling', () => {
  for (const status of [403, 404, 501]) {
    const list = nextList(INITIAL_LIST, { ready: false, transient: false, status, notice: { title: 'x', message: 'y' } })
    assert.equal(list.status, 'unsupported')
    assert.equal(list.httpStatus, status)
  }
})

test('action failures show the server’s reason, otherwise the caller’s fallback', async () => {
  const answered = await serverError(Response.json({ detail: 'No such handle.', code: 'unknown_handle' }, { status: 404 }))
  assert.ok(answered instanceof ServerError)
  assert.equal(failureMessage(answered, 'Fallback'), 'No such handle.')
  assert.equal(failureMessage(await serverError(new Response('', { status: 502 })), 'Fallback'), 'Fallback')
  assert.equal(failureMessage(new TypeError('Failed to fetch'), 'Fallback'), 'Fallback')
  assert.equal(failureMessage(new Error('Unexpected response'), 'Fallback'), 'Fallback')
})
