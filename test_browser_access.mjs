import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { chromium } from 'playwright'

const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import BrowserAccessSection from './BrowserAccessSection.jsx'; createRoot(document.getElementById('root')).render(<BrowserAccessSection headers={(extra = {}) => ({Authorization: 'Bearer fixture', ...extra})}/>);`,
    resolveDir: new URL('.', import.meta.url).pathname,
    loader: 'jsx',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  plugins: [{
    name: 'icons',
    setup(build) {
      build.onResolve({ filter: /^@openai\/apps-sdk-ui\/components\/Icon$/ }, () => ({ path: 'icons', namespace: 'fixture' }))
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const Check = () => null; export const Copy = () => null; export const Plus = () => null;', loader: 'js' }))
    },
  }],
})
const script = bundle.outputFiles[0].text
const grant = { id: 'g1', label: 'Alex', status: 'active', created_at: 1 }

async function fixture(get) {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CONNECT_TEST_BROWSER_EXECUTABLE
      ? { executablePath: process.env.CONNECT_TEST_BROWSER_EXECUTABLE }
      : {}),
  })
  const page = await browser.newPage()
  const requests = []
  await page.route('http://fixture.test/**', async route => {
    const request = route.request()
    if (new URL(request.url()).pathname === '/api/connect/browser-access' || request.url().includes('/api/connect/browser-access/')) {
      requests.push({ method: request.method(), body: request.postDataJSON() })
      const result = await get(request)
      await route.fulfill({ status: result.status || 200, contentType: 'application/json', body: JSON.stringify(result.body ?? {}) })
    } else await route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' })
  })
  await page.goto('http://fixture.test/')
  await page.addScriptTag({ content: script })
  return { browser, page, requests }
}

test('one-time link appears only after explicit create, and uses the owner-assigned label', async () => {
  const { browser, page, requests } = await fixture(request => request.method() === 'POST'
    ? { body: { grant: { id: 'g2', label: 'Sam', status: 'invited' }, join_url: 'https://fixture.test/private-secret', invite_expires_at: 123 } }
    : { body: { grants: [grant] } })
  try {
    await page.getByRole('heading', { name: 'People with browser access' }).waitFor()
    await page.getByText('Alex', { exact: true }).waitFor()
    assert.equal(await page.getByText('private-secret').count(), 0)
    await page.getByPlaceholder('Alex').fill('Sam')
    await page.getByRole('button', { name: 'Create invitation' }).click()
    await page.getByText('Invitation for Sam').waitFor()
    assert.equal(await page.getByText('https://fixture.test/private-secret').count(), 1)
    assert.deepEqual(requests.find(item => item.method === 'POST')?.body, { label: 'Sam' })
    await page.getByRole('button', { name: 'Done' }).click()
    assert.equal(await page.getByText('https://fixture.test/private-secret').count(), 0)
  } finally { await browser.close() }
})

test('new invitation reuses a named grant and reveals a fresh link only after the row action', async () => {
  const { browser, page, requests } = await fixture(request => request.url().endsWith('/g1/invitation')
    ? { body: { grant, join_url: 'https://fixture.test/renewed-secret', invite_expires_at: 456 } }
    : { body: { grants: [grant] } })
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

test('missing reissue route does not hide existing grants or revoke', async () => {
  const { browser, page } = await fixture(request => request.url().endsWith('/g1/invitation')
    ? { status: 404 } : { body: { grants: [grant] } })
  try {
    await page.getByText('Alex', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'New invitation' }).click()
    await page.getByText('The grant or invitation route may be unavailable').waitFor()
    assert.equal(await page.getByText('Alex', { exact: true }).count(), 1)
    assert.equal(await page.getByRole('button', { name: 'Revoke', exact: true }).isDisabled(), false)
  } finally { await browser.close() }
})

test('revoke requires in-place confirmation; Not now never sends DELETE', async () => {
  const { browser, page, requests } = await fixture(request => request.method() === 'DELETE'
    ? { status: 204 } : { body: { grants: [grant] } })
  try {
    await page.getByRole('button', { name: 'Revoke', exact: true }).click()
    assert.equal(requests.filter(item => item.method === 'DELETE').length, 0)
    await page.getByRole('button', { name: 'Not now' }).click()
    assert.equal(requests.filter(item => item.method === 'DELETE').length, 0)
    await page.getByRole('button', { name: 'Revoke', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm revoke' }).click()
    await page.getByText('Revoked', { exact: true }).waitFor()
    assert.equal(requests.filter(item => item.method === 'DELETE').length, 1)
  } finally { await browser.close() }
})

test('202 keeps access revoked while stop confirmation is pending; retry 204 clears only the warning', async () => {
  let deletes = 0
  const { browser, page, requests } = await fixture(request => {
    if (request.method() === 'DELETE') {
      deletes += 1
      return deletes === 1
        ? { status: 202, body: { revoked: true, pending_commands: [{ host_id: 'h1', request_id: 'r1', remote_confirmed: false }], pending_chat_ids: [] } }
        : { status: 204 }
    }
    // Deliberately stale GET: it must not restore Active after the 202 receipt.
    return { body: { grants: [grant] } }
  })
  try {
    await page.getByRole('button', { name: 'Revoke', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm revoke' }).click()
    await page.getByText('Some work is still stopping; stop confirmation is pending.').waitFor()
    assert.equal(await page.getByText('Revoked', { exact: true }).count(), 1)
    assert.equal(await page.getByRole('button', { name: 'Revoke', exact: true }).count(), 0)
    await page.waitForTimeout(5200)
    assert.equal(await page.getByText('Revoked', { exact: true }).count(), 1)
    await page.getByRole('button', { name: 'Retry stop' }).click()
    await page.getByText('Some work is still stopping; stop confirmation is pending.').waitFor({ state: 'hidden' })
    assert.equal(await page.getByText('Some work is still stopping; stop confirmation is pending.').count(), 0)
    assert.equal(await page.getByText('Revoked', { exact: true }).count(), 1)
    assert.equal(requests.filter(item => item.method === 'DELETE').length, 2)
  } finally { await browser.close() }
})

test('retry failure preserves revoked access and pending-stop warning; initial 503 remains uncertain', async () => {
  for (const partialFirst of [true, false]) {
    let deletes = 0
    const { browser, page } = await fixture(request => {
      if (request.method() === 'DELETE') {
        deletes += 1
        return partialFirst && deletes === 1
          ? { status: 202, body: { revoked: true, pending_commands: [], pending_chat_ids: ['chat1'] } }
          : { status: 503 }
      }
      return { body: { grants: [grant] } }
    })
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

test('403 cannot manage and 404 leaves browser-access section unavailable', async () => {
  for (const status of [403, 404]) {
    const { browser, page, requests } = await fixture(() => ({ status }))
    try {
      if (status === 403) {
        await page.getByText('Only this Möbius’s owner can manage browser access.').waitFor()
        assert.equal(await page.getByRole('button', { name: 'Create invitation' }).count(), 0)
      } else {
        await page.waitForFunction(() => !document.body.textContent.includes('Loading browser access'))
        assert.equal(await page.getByText('People with browser access').count(), 0)
      }
      assert.equal(requests.length, 1)
    } finally { await browser.close() }
  }
})

test('transient load error retains last grant snapshot and disables unsafe actions', async () => {
  let loads = 0
  const { browser, page, requests } = await fixture(() => {
    loads += 1
    return loads === 1 ? { body: { grants: [grant] } } : { status: 503 }
  })
  try {
    await page.getByText('Alex', { exact: true }).waitFor()
    await page.getByText('Showing the last successful list.').waitFor({ timeout: 8000 })
    assert.equal(await page.getByText('Alex', { exact: true }).count(), 1)
    assert.equal(await page.getByRole('button', { name: 'Revoke', exact: true }).isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: 'New invitation' }).isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: 'Create invitation' }).isDisabled(), true)
    assert.equal(requests.filter(item => item.method !== 'GET').length, 0)
  } finally { await browser.close() }
})

test('fresh mount recovers pending-stop status from the server and clears confirmed completion', async () => {
  let pending = true
  const { browser, page, requests } = await fixture(() => ({ body: {
    grants: [{ ...grant, status: 'revoked', stop_pending: pending }],
  } }))
  try {
    await page.getByRole('button', { name: 'Retry stop' }).waitFor()
    assert.equal(await page.getByText('Revoked', { exact: true }).count(), 1)
    assert.equal(requests.some(request => request.method !== 'GET'), false)
    pending = false
    await page.getByRole('button', { name: 'Retry stop' }).waitFor({ state: 'hidden', timeout: 8000 })
    assert.equal(await page.getByText('Revoked', { exact: true }).count(), 1)
  } finally { await browser.close() }
})
