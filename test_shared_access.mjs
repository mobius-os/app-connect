import assert from 'node:assert/strict'
import test from 'node:test'
import { bundle, open } from './fixture.mjs'

const script = await bundle(`
  import { SharedWithMe, useSharedDirectory } from './BrowserAccessSection.jsx'
  const headers = (extra = {}) => ({ Authorization: 'Bearer fixture', ...extra })
  function Fixture() { return <SharedWithMe directory={useSharedDirectory(headers)}/> }
  createRoot(document.getElementById('root')).render(<Fixture/>)
`)
const LIST = '/api/connect/browser-access/shared'

function fixture(list, respond) {
  return open(script, request => request.path === LIST
    ? (typeof list === 'function' ? list() : list)
    : { body: { instance: respond(request.body) } })
}

test('the shared list loads once, polls slowly, and refreshes when the page becomes visible', async () => {
  const { browser, page, count } = await fixture({ body: { instances: [] } })
  try {
    await page.getByText('No Möbius shared with this account yet.').waitFor()
    await page.waitForTimeout(5500)
    assert.equal(count('GET', LIST), 1)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await page.waitForTimeout(200)
    assert.equal(count('GET', LIST), 2)
  } finally { await browser.close() }
})

for (const [runtime, body] of [
  ['the current', { detail: 'Your account is not linked.', code: 'account_unlinked' }],
  ['an older', { detail: 'Link your mobius.you account in Identity first.' }],
]) test(`unlinked state from ${runtime} runtime points to Identity`, async () => {
  const { browser, page } = await fixture({ status: 409, body })
  try {
    await page.getByText('Link your mobius.you account in Identity to see instances shared with you.').waitFor()
    assert.equal(await page.getByText('Couldn’t load instances shared with you.').count(), 0)
  } finally { await browser.close() }
})

test('a list that never loaded or the directory refused says so; an uncoded refusal or missing route hides it', async () => {
  for (const [status, body, shown] of [
    [503, {}, true],
    [403, { detail: 'The account directory rejected the request.', code: 'directory_rejected' }, true],
    [404, { detail: 'No such account.', code: 'unknown_handle' }, true],
    [403, { detail: 'Only the installation owner can manage this access.' }, false],
    [404, {}, false],
  ]) {
    const { browser, page } = await fixture({ status, body })
    try {
      if (shown) {
        await page.getByText(/^Couldn’t load instances shared with you\./).waitFor()
        assert.equal(await page.getByText('Showing the last successful list.').count(), 0)
      } else {
        await page.waitForFunction(() => !document.body.textContent.includes('Loading shared Möbius'))
        assert.equal(await page.getByText('Shared with me').count(), 0, `${status} ${JSON.stringify(body)}`)
      }
    } finally { await browser.close() }
  }
})

test('accepted shares open their link in a new tab; names and handles stay text', async () => {
  const grant_id = 'g'.repeat(24)
  const share = { grant_id, name: '<img src=x onerror=alert(1)>', origin: 'https://shared.example', owner_handle: '<owner>', status: 'accepted', unread: false,
    open_url: `https://shared.example/api/connect/browser-access/session/account/start?grant_id=${grant_id}` }
  const { browser, page } = await fixture({ body: { instances: [share] } })
  try {
    const link = page.getByRole('link', { name: 'Open' })
    await link.waitFor()
    assert.equal(await link.getAttribute('href'), share.open_url)
    assert.equal(await link.getAttribute('target'), '_blank')
    assert.equal(await link.getAttribute('rel'), 'noopener noreferrer')
    assert.equal(await page.locator('img').count(), 0)
    assert.equal(await page.getByText(share.name).count(), 1)
  } finally { await browser.close() }
})

test('Not now marks read without accepting; Accept remains available and accepts', async () => {
  const grant_id = 'c'.repeat(24)
  const instance = { grant_id, origin: 'https://shared.example', owner_handle: 'alex', name: 'Studio', status: 'invited', unread: true,
    open_url: `https://shared.example/api/connect/browser-access/session/account/start?grant_id=${grant_id}` }
  let current = instance
  const { browser, page, requests } = await fixture(() => ({ body: { instances: [current] } }), data => {
    current = data.action === 'later' ? { ...current, unread: false } : { ...current, status: 'accepted', unread: false }
    return current
  })
  try {
    await page.getByRole('button', { name: 'Not now' }).click()
    await page.getByRole('button', { name: 'Not now' }).waitFor({ state: 'hidden' })
    assert.equal(await page.getByRole('button', { name: 'Accept' }).count(), 1)
    assert.equal(await page.getByRole('link', { name: 'Open' }).count(), 0)
    await page.getByRole('button', { name: 'Accept' }).click()
    await page.getByRole('link', { name: 'Open' }).waitFor()
    const responses = requests.filter(item => item.method === 'POST')
    assert.deepEqual(responses.map(item => item.body.action), ['later', 'accept'])
    assert.deepEqual(responses[0].body, { origin: instance.origin, grant_id, action: 'later' })
  } finally { await browser.close() }
})
