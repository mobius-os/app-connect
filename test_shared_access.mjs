import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { chromium } from 'playwright'

const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {SharedWithMe} from './BrowserAccessSection.jsx'; createRoot(document.getElementById('root')).render(<SharedWithMe headers={() => ({Authorization: 'Bearer fixture'})}/>);`,
    resolveDir: new URL('.', import.meta.url).pathname,
    loader: 'jsx',
  },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  plugins: [{ name: 'icons', setup(build) {
    build.onResolve({ filter: /^@openai\/apps-sdk-ui\/components\/Icon$/ }, () => ({ path: 'icons', namespace: 'fixture' }))
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const Check = () => null; export const Copy = () => null; export const Plus = () => null;', loader: 'js' }))
  } }],
})

async function fixture(body, status = 200) {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CONNECT_TEST_BROWSER_EXECUTABLE ? { executablePath: process.env.CONNECT_TEST_BROWSER_EXECUTABLE } : {}) })
  const page = await browser.newPage()
  await page.route('http://fixture.test/**', async route => {
    if (new URL(route.request().url()).pathname === '/api/connect/browser-access/shared')
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    else await route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' })
  })
  await page.goto('http://fixture.test/')
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  return { browser, page }
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
  const valid = { ...base, open_url: `https://shared.example/api/connect/browser-access/session/account/start?grant_id=${base.grant_id}` }
  const evil = { ...base, grant_id: 'b'.repeat(24), open_url: `https://evil.example/api/connect/browser-access/session/account/start?grant_id=${'b'.repeat(24)}` }
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
