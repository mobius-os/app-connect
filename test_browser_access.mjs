import assert from 'node:assert/strict'
import test from 'node:test'
import { bundle, open } from './fixture.mjs'

const script = await bundle(`
  import BrowserAccessSection from './BrowserAccessSection.jsx'
  const headers = (extra = {}) => ({ Authorization: 'Bearer fixture', ...extra })
  function Fixture() {
    const [confirmation, setConfirmation] = React.useState(null)
    return <BrowserAccessSection headers={headers} confirmation={confirmation} setConfirmation={setConfirmation}/>
  }
  createRoot(document.getElementById('root')).render(<Fixture/>)
`)
const ENDPOINT = '/api/connect/browser-access'
const link = () => ({ id: 'g1', label: 'Alex', status: 'active', created_at: 1 })
const account = (status = 'active') => ({ id: 'a1', kind: 'account', recipient_handle: 'friend', status })

// Answers like the runtime: the grant list always reflects earlier writes.
// `write` handles everything except the list read.
function server(grants, write = () => undefined) {
  return request => request.method === 'GET' && request.path === ENDPOINT
    ? { body: { grants } }
    : write(request)
}

const WARNING = 'People with access can read shared data and take powerful actions in this Möbius.'

test('the trust warning and link option appear only while inviting', async () => {
  const { browser, page } = await open(script, server([link()]))
  try {
    await page.getByText('Alex', { exact: true }).waitFor()
    assert.equal(await page.getByText(WARNING).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Use one-time invitation instead' }).count(), 0)
    await page.getByRole('button', { name: 'Invite person' }).click()
    assert.equal(await page.getByText(WARNING).count(), 1)
    await page.getByRole('button', { name: 'Cancel' }).click()
    assert.equal(await page.getByText(WARNING).count(), 0)
  } finally { await browser.close() }
})

test('the count shows only when someone has access', async () => {
  for (const [grants, count] of [[[], 0], [[link()], 1]]) {
    const { browser, page } = await open(script, server(grants))
    try {
      await page.getByRole('button', { name: 'Invite person' }).waitFor()
      assert.equal(await page.locator('.cn-count').count(), count)
      if (count) assert.equal(await page.locator('.cn-count').textContent(), '1')
    } finally { await browser.close() }
  }
})

test('one-time link appears only after explicit create, and uses the owner-assigned label', async () => {
  const grants = [link()]
  const { browser, page, requests } = await open(script, server(grants, request => {
    if (request.method !== 'POST' || request.path !== ENDPOINT) return
    const grant = { id: 'g2', label: request.body.label, status: 'invited' }
    grants.push(grant)
    return { body: { grant, join_url: 'https://fixture.test/private-secret', invite_expires_at: 123 } }
  }))
  try {
    await page.getByText('Alex', { exact: true }).waitFor()
    assert.equal(await page.getByText('private-secret').count(), 0)
    await page.getByRole('button', { name: 'Invite person', exact: true }).click()
    await page.getByRole('button', { name: 'Use one-time invitation instead' }).click()
    await page.getByPlaceholder('Alex').fill('Sam')
    await page.getByRole('button', { name: 'Create invitation' }).click()
    await page.getByText('Invitation for Sam').waitFor()
    assert.equal(await page.getByText('https://fixture.test/private-secret').count(), 1)
    assert.equal(await page.getByText('Invited · Accepted access lasts until revoked').count(), 1)
    assert.deepEqual(requests.find(item => item.method === 'POST')?.body, { label: 'Sam' })
    assert.equal(await page.getByPlaceholder('Alex').inputValue(), '')
    await page.getByRole('button', { name: 'Copy link' }).click()
    await page.getByRole('button', { name: 'Copied' }).waitFor()
    await page.getByRole('button', { name: 'Done' }).click()
    assert.equal(await page.getByText('https://fixture.test/private-secret').count(), 0)
  } finally { await browser.close() }
})

test('new invitation reuses a named grant and reveals a fresh link only after the row action', async () => {
  const grants = [link()]
  const { browser, page, requests } = await open(script, server(grants, request => request.path === `${ENDPOINT}/g1/invitation`
    ? { body: { grant: grants[0], join_url: 'https://fixture.test/renewed-secret', invite_expires_at: 456 } } : undefined))
  try {
    await page.getByText('Alex', { exact: true }).waitFor()
    assert.equal(await page.getByText('renewed-secret').count(), 0)
    await page.getByRole('button', { name: 'New invitation' }).click()
    await page.getByText('Invitation for Alex').waitFor()
    assert.equal(await page.getByText('https://fixture.test/renewed-secret').count(), 1)
    assert.equal(await page.getByText('Alex', { exact: true }).count(), 1)
    assert.equal(await page.getByText('It replaces unused invitation links only. Existing browser sessions and access are unchanged.').count(), 1)
    assert.equal(requests.filter(item => item.method === 'POST').length, 1)
    assert.equal(requests.find(item => item.method === 'POST')?.body, null)
    await page.getByRole('button', { name: 'Done' }).click()
    assert.equal(await page.getByText('renewed-secret').count(), 0)
  } finally { await browser.close() }
})

test('a failed reissue shows the server’s reason and leaves grants and revoke usable', async () => {
  const { browser, page } = await open(script, server([link()], request => request.path === `${ENDPOINT}/g1/invitation`
    ? { status: 404, body: { detail: 'This grant has no invitation to replace.' } } : undefined))
  try {
    await page.getByText('Alex', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'New invitation' }).click()
    await page.getByText('This grant has no invitation to replace.').waitFor()
    assert.equal(await page.getByText('Alex', { exact: true }).count(), 1)
    assert.equal(await page.getByRole('button', { name: 'Revoke', exact: true }).isDisabled(), false)
  } finally { await browser.close() }
})

test('revoke requires in-place confirmation; Not now never sends DELETE', async () => {
  const grants = [link()]
  const { browser, page, requests } = await open(script, server(grants, request => {
    if (request.method !== 'DELETE') return
    grants[0] = { ...grants[0], status: 'revoked' }
    return { status: 204 }
  }))
  try {
    await page.getByRole('button', { name: 'Revoke', exact: true }).click()
    assert.equal(requests.filter(item => item.method === 'DELETE').length, 0)
    await page.getByRole('button', { name: 'Not now' }).click()
    assert.equal(requests.filter(item => item.method === 'DELETE').length, 0)
    await page.getByRole('button', { name: 'Revoke', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm revoke' }).click()
    await page.getByText('Alex', { exact: true }).waitFor({ state: 'hidden' })
    assert.equal(requests.filter(item => item.method === 'DELETE').length, 1)
    await page.getByText('No people with access yet.').waitFor()
  } finally { await browser.close() }
})

test('202 keeps access revoked while stop confirmation is pending; retry 204 clears only the warning', async () => {
  const grants = [link()]
  let deletes = 0
  const { browser, page, requests } = await open(script, server(grants, request => {
    if (request.method !== 'DELETE') return
    deletes += 1
    if (deletes === 1) {
      grants[0] = { ...grants[0], status: 'revoked', stop_pending: true }
      return { status: 202, body: { revoked: true, pending_commands: [{ host_id: 'h1', request_id: 'r1', remote_confirmed: false }], pending_chat_ids: [] } }
    }
    grants[0] = { ...grants[0], stop_pending: false }
    return { status: 204 }
  }))
  try {
    await page.getByRole('button', { name: 'Revoke', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm revoke' }).click()
    await page.getByText('Some work is still stopping; stop confirmation is pending.').waitFor()
    assert.equal(await page.getByText('Revoked', { exact: true }).count(), 1)
    assert.equal(await page.getByRole('button', { name: 'Revoke', exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Retry stop' }).click()
    await page.getByText('Some work is still stopping; stop confirmation is pending.').waitFor({ state: 'hidden' })
    assert.equal(await page.getByText('Revoked', { exact: true }).count(), 0)
    assert.equal(requests.filter(item => item.method === 'DELETE').length, 2)
  } finally { await browser.close() }
})

test('retry failure preserves revoked access and pending-stop warning; initial 503 remains uncertain', async () => {
  for (const partialFirst of [true, false]) {
    const grants = [link()]
    let deletes = 0
    const { browser, page } = await open(script, server(grants, request => {
      if (request.method !== 'DELETE') return
      deletes += 1
      if (!partialFirst || deletes > 1) return { status: 503 }
      grants[0] = { ...grants[0], status: 'revoked', stop_pending: true }
      return { status: 202, body: { revoked: true, pending_commands: [], pending_chat_ids: ['chat1'] } }
    }))
    try {
      await page.getByRole('button', { name: 'Revoke', exact: true }).click()
      await page.getByRole('button', { name: 'Confirm revoke' }).click()
      if (partialFirst) {
        await page.getByRole('button', { name: 'Retry stop' }).click()
        await page.getByText('Access remains revoked. Couldn’t confirm the remaining work stopped').waitFor()
        assert.equal(await page.getByText('Revoked', { exact: true }).count(), 1)
        assert.equal(await page.getByRole('button', { name: 'Retry stop' }).isDisabled(), false)
      } else {
        await page.getByText('Couldn’t confirm that access was revoked.').waitFor()
        assert.equal(await page.getByText('Active · Access until revoked').count(), 1)
        assert.equal(await page.getByRole('button', { name: 'Confirm revoke' }).count(), 1)
      }
    } finally { await browser.close() }
  }
})

test('403 cannot manage and 404 leaves browser-access section unavailable; neither polls again', async () => {
  for (const status of [403, 404]) {
    const { browser, page, requests } = await open(script, () => ({ status }))
    try {
      if (status === 403) {
        await page.getByText('Only this Möbius’s owner can manage shared access.').waitFor()
        assert.equal(await page.getByRole('button', { name: 'Invite person' }).count(), 0)
      } else {
        await page.waitForFunction(() => !document.body.textContent.includes('Loading shared access'))
        assert.equal(await page.getByText('People with access').count(), 0)
      }
      await page.waitForTimeout(5300)
      assert.equal(requests.length, 1)
    } finally { await browser.close() }
  }
})

test('transient load error retains last grant snapshot and disables unsafe actions', async () => {
  let loads = 0
  const { browser, page, requests } = await open(script, () => {
    loads += 1
    return loads === 1 ? { body: { grants: [link()] } } : { status: 503 }
  })
  try {
    await page.getByText('Alex', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Invite person', exact: true }).click()
    await page.getByRole('button', { name: 'Use one-time invitation instead' }).click()
    await page.getByText('Showing the last successful list.').waitFor({ timeout: 8000 })
    assert.equal(await page.getByText('Alex', { exact: true }).count(), 1)
    assert.equal(await page.getByRole('button', { name: 'Revoke', exact: true }).isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: 'New invitation' }).isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: 'Create invitation' }).isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: 'Invite', exact: true }).isDisabled(), true)
    assert.equal(requests.filter(item => item.method !== 'GET').length, 0)
  } finally { await browser.close() }
})

test('a list that never loaded says so instead of offering a stale snapshot', async () => {
  const { browser, page } = await open(script, () => ({ status: 503 }))
  try {
    await page.getByText('Shared access could not be loaded.').waitFor()
    assert.equal(await page.getByText('Showing the last successful list.').count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Invite person' }).count(), 0)
  } finally { await browser.close() }
})

test('fresh mount recovers pending-stop status from the server and clears confirmed completion', async () => {
  const grants = [{ ...link(), status: 'revoked', stop_pending: true }]
  const { browser, page, requests } = await open(script, server(grants))
  try {
    await page.getByRole('button', { name: 'Retry stop' }).waitFor()
    assert.equal(await page.getByText('Revoked', { exact: true }).count(), 1)
    assert.equal(requests.some(request => request.method !== 'GET'), false)
    grants[0] = { ...grants[0], stop_pending: false }
    await page.getByRole('button', { name: 'Retry stop' }).waitFor({ state: 'hidden', timeout: 8000 })
    assert.equal(await page.getByText('Revoked', { exact: true }).count(), 0)
  } finally { await browser.close() }
})

test('account invite posts only the handle, shows the verified account, and closes the form', async () => {
  const grants = []
  const { browser, page, requests } = await open(script, server(grants, request => {
    if (request.path !== `${ENDPOINT}/accounts`) return
    grants.push(account())
    return { body: { grant: account() } }
  }))
  try {
    await page.getByRole('button', { name: 'Invite person' }).click()
    assert.equal(await page.getByRole('textbox', { name: 'mobius.you handle' }).getAttribute('maxlength'), '31')
    await page.getByRole('textbox', { name: 'mobius.you handle' }).fill(' friend ')
    await page.getByRole('button', { name: 'Invite', exact: true }).click()
    await page.getByText('Verified mobius.you account · Access until revoked').waitFor()
    assert.deepEqual(requests.find(item => item.method === 'POST')?.body, { recipient_handle: 'friend' })
    assert.equal(await page.getByRole('textbox', { name: 'mobius.you handle' }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'New invitation' }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Revoke', exact: true }).count(), 1)
  } finally { await browser.close() }
})

for (const [reason, reply, message] of [
  ['unknown handle', { status: 404, body: { detail: 'No mobius.you account has that handle.', code: 'unknown_handle' } }, 'No mobius.you account has that handle.'],
  ['unlinked owner', { status: 409, body: { detail: 'Link your mobius.you account in Identity first.', code: 'account_unlinked' } }, 'Link your mobius.you account in Identity first.'],
  ['older runtime rejection', { status: 404, body: { detail: 'The account directory rejected the request. Retry or check your account link.' } }, 'The account directory rejected the request.'],
  ['server failure without a reason', { status: 502, body: {} }, 'Couldn’t confirm account access was added. Check the list before trying again.'],
  ['lost connection', { abort: true }, 'Couldn’t confirm account access was added. Check the list before trying again.'],
]) test(`account invite: ${reason} shows a matching message and keeps the draft`, async () => {
  const { browser, page } = await open(script, server([link()], request => request.path === `${ENDPOINT}/accounts` ? reply : undefined))
  try {
    await page.getByText('Alex', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Invite person' }).click()
    await page.getByRole('textbox', { name: 'mobius.you handle' }).fill('missing-person')
    await page.getByRole('button', { name: 'Invite', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: message }).waitFor()
    assert.equal(await page.getByText('Alex', { exact: true }).count(), 1)
    assert.equal(await page.getByRole('button', { name: 'Revoke', exact: true }).isDisabled(), false)
    assert.equal(await page.getByRole('textbox', { name: 'mobius.you handle' }).inputValue(), 'missing-person')
  } finally { await browser.close() }
})

test('an account share that needs a new invitation says so and can be invited again', async () => {
  const grants = [account('inactive')]
  const { browser, page, requests } = await open(script, server(grants, request => {
    if (request.path !== `${ENDPOINT}/accounts`) return
    // A runtime that marks a stale-binding grant inactive registers a new grant
    // and revokes the stale one.
    grants.splice(0, 1, account('revoked'), { ...account(), id: 'a2' })
    return { body: { grant: grants[1] } }
  }))
  try {
    await page.getByText('mobius.you account · Needs a new invitation').waitFor()
    await page.getByRole('button', { name: 'Invite again' }).click()
    await page.getByText('Verified mobius.you account · Access until revoked').waitFor()
    // Replaced at once, not on the next list refresh.
    assert.equal(await page.getByText('Needs a new invitation').count(), 0)
    assert.deepEqual(requests.find(item => item.method === 'POST')?.body, { recipient_handle: 'friend' })
  } finally { await browser.close() }
})

test('directory cleanup pending stays visible and retryable after local account revoke', async () => {
  const grants = [account()]
  const { browser, page } = await open(script, server(grants, request => {
    if (request.method !== 'DELETE') return
    grants[0] = { ...grants[0], status: 'revoked', directory_cleanup_pending: true }
    return { status: 202, body: { revoked: true, pending_commands: [], pending_chat_ids: [], directory_cleanup_pending: true } }
  }))
  try {
    await page.getByRole('button', { name: 'Revoke', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm revoke' }).click()
    await page.getByText('Directory removal is pending', { exact: false }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Retry cleanup' }).count(), 1)
    assert.equal(await page.getByRole('button', { name: 'Revoke', exact: true }).count(), 0)
  } finally { await browser.close() }
})

test('directory cleanup state recovers from grant list after reload, then clears only on server confirmation', async () => {
  const grants = [{ ...account('revoked'), directory_cleanup_pending: true, stop_pending: false }]
  const { browser, page } = await open(script, server(grants))
  try {
    await page.getByRole('button', { name: 'Retry cleanup' }).waitFor()
    grants[0] = { ...grants[0], directory_cleanup_pending: false }
    await page.getByRole('button', { name: 'Retry cleanup' }).waitFor({ state: 'hidden', timeout: 8000 })
    assert.equal(await page.getByText('friend', { exact: true }).count(), 0)
  } finally { await browser.close() }
})

test('a pending account share can be invited again, retrying its reserved grant', async () => {
  const grants = [account('pending')]
  const { browser, page, requests } = await open(script, server(grants, request => {
    if (request.path !== `${ENDPOINT}/accounts`) return
    grants.splice(0, 1, account('active'))
    return { body: { grant: grants[0] } }
  }))
  try {
    await page.getByText('mobius.you account · Registration pending · Access unavailable').waitFor()
    await page.getByRole('button', { name: 'Invite again' }).click()
    await page.getByText('Verified mobius.you account · Access until revoked').waitFor()
    assert.deepEqual(requests.filter(item => item.method === 'POST').map(item => item.body), [{ recipient_handle: 'friend' }])
  } finally { await browser.close() }
})
