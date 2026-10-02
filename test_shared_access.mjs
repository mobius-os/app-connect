import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { chromium } from 'playwright'

const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {SharedWithMe, useSharedDirectory} from './BrowserAccessSection.jsx'; function Fixture(){ const directory = useSharedDirectory(() => ({Authorization: 'Bearer fixture'})); return <SharedWithMe directory={directory}/> } createRoot(document.getElementById('root')).render(<Fixture/>);`,
    resolveDir: new URL('.', import.meta.url).pathname,
    loader: 'jsx',
  },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  plugins: [{ name: 'icons', setup(build) {
    build.onResolve({ filter: /^@openai\/apps-sdk-ui\/components\/Icon$/ }, () => ({ path: 'icons', namespace: 'fixture' }))
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const Check = () => null; export const Copy = () => null; export const Plus = () => null;', loader: 'js' }))
  } }],
})

async function fixture(body, status = 200, respond = null) {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CONNECT_TEST_BROWSER_EXECUTABLE ? { executablePath: process.env.CONNECT_TEST_BROWSER_EXECUTABLE } : {}) })
  const page = await browser.newPage()
  const requests = []
  await page.route('http://fixture.test/**', async route => {
    if (new URL(route.request().url()).pathname === '/api/connect/browser-access/shared')
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(typeof body === 'function' ? body() : body) })
    else if (new URL(route.request().url()).pathname === '/api/connect/browser-access/shared/respond') {
      const data = route.request().postDataJSON()
      requests.push(data)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ instance: respond(data) }) })
    }
    else await route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' })
  })
  await page.goto('http://fixture.test/')
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  return { browser, page, requests }
}

test('unlinked state points to Identity rather than opening anything', async () => {
  const { browser, page } = await fixture({ detail: 'Link your mobius.you account in Identity first.' }, 409)
  try {
    await page.getByText('Link your mobius.you account in Identity').waitFor()
    assert.equal(await page.getByRole('link', { name: 'Open' }).count(), 0)
  } finally { await browser.close() }
})

test('shared Open uses only the exact HTTPS account-start URL; markup stays text', async () => {
  const base = { grant_id: 'g'.repeat(24), name: '<img src=x onerror=alert(1)>', origin: 'https://shared.example', owner_handle: '<owner>' }
  const valid = { ...base, status: 'accepted', unread: false, open_url: `https://shared.example/api/connect/browser-access/session/account/start?grant_id=${base.grant_id}` }
  const evil = { ...base, status: 'accepted', unread: false, grant_id: 'b'.repeat(24), open_url: `https://evil.example/api/connect/browser-access/session/account/start?grant_id=${'b'.repeat(24)}` }
  const { browser, page } = await fixture({ instances: [valid, evil] })
  try {
    await page.getByText('Open unavailable: untrusted link.').waitFor()
    const link = page.getByRole('link', { name: 'Open' })
    assert.equal(await link.count(), 1)
    assert.equal(await link.getAttribute('href'), valid.open_url)
    assert.equal(await link.getAttribute('target'), '_blank')
    assert.equal(await page.locator('img').count(), 0)
    assert.equal(await page.getByText(base.name).count(), 2)
  } finally { await browser.close() }
})

test('Not now marks read without accepting; Accept remains available and accepts', async () => {
  const grant_id = 'c'.repeat(24)
  const instance = { grant_id, origin: 'https://shared.example', owner_handle: 'alex', name: 'Studio', status: 'invited', unread: true,
    open_url: `https://shared.example/api/connect/browser-access/session/account/start?grant_id=${grant_id}` }
  let current = instance
  const { browser, page, requests } = await fixture(() => ({ instances: [current] }), 200, data => {
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
    assert.deepEqual(requests.map(item => item.action), ['later', 'accept'])
    assert.deepEqual(requests[0], { origin: instance.origin, grant_id, action: 'later' })
  } finally { await browser.close() }
})
