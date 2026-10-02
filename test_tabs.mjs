import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { chromium } from 'playwright'

const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import App from './index.jsx'; createRoot(document.getElementById('root')).render(<App appId={42} token="fixture"/>);`,
    resolveDir: new URL('.', import.meta.url).pathname, loader: 'jsx',
  },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  plugins: [{ name: 'icons', setup(build) {
    build.onResolve({ filter: /^@openai\/apps-sdk-ui\/components\/Icon$/ }, () => ({ path: 'icons', namespace: 'fixture' }))
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const Check=()=>null,ChevronDown=()=>null,Copy=()=>null,Desktop=()=>null,Pencil=()=>null,Plus=()=>null;', loader: 'js' }))
  } }],
})

test('tabs have roving focus, keyboard selection, one unread badge, and retain machine draft', async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CONNECT_TEST_BROWSER_EXECUTABLE ? { executablePath: process.env.CONNECT_TEST_BROWSER_EXECUTABLE } : {}) })
  try {
    const page = await browser.newPage()
    let directoryGets = 0
    await page.route('http://fixture.test/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' })
      let body = {}
      if (path === '/api/connect/hosts') body = { hosts: [] }
      if (path === '/api/connect/outbound') body = { connections: [] }
      if (path === '/api/connect/browser-access') body = { grants: [] }
      if (path === '/api/connect/browser-access/shared') {
        directoryGets += 1
        body = { instances: [{ grant_id: 'a'.repeat(24), name: 'Studio', owner_handle: 'alex', origin: 'https://studio.example', status: 'invited', unread: true,
          open_url: `https://studio.example/api/connect/browser-access/session/account/start?grant_id=${'a'.repeat(24)}` }] }
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
    })
    await page.goto('http://fixture.test/')
    await page.evaluate(() => { window.mobius = { signal: () => {} } })
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const machines = page.getByRole('tab', { name: 'Machines' })
    const shared = page.getByRole('tab', { name: /Shared Möbius/ })
    await page.getByLabel('1 unread invitations').waitFor()
    assert.equal(await machines.getAttribute('tabindex'), '0')
    assert.equal(await shared.getAttribute('tabindex'), '-1')
    assert.equal(directoryGets, 1)
    await page.getByRole('button', { name: 'Add machine' }).click()
    await page.getByPlaceholder('My MacBook').fill('Draft machine')
    await machines.focus()
    await page.keyboard.press('ArrowRight')
    assert.equal(await shared.getAttribute('aria-selected'), 'true')
    assert.equal(await shared.getAttribute('tabindex'), '0')
    assert.equal(await machines.getAttribute('tabindex'), '-1')
    assert.equal(await shared.evaluate(element => document.activeElement === element), true)
    assert.equal(await page.getByLabel('1 unread invitations').count(), 0)
    await page.keyboard.press('Home')
    assert.equal(await machines.getAttribute('aria-selected'), 'true')
    assert.equal(await page.getByPlaceholder('My MacBook').inputValue(), 'Draft machine')
    await page.keyboard.press('End')
    assert.equal(await shared.getAttribute('aria-selected'), 'true')
    await page.keyboard.press('ArrowLeft')
    assert.equal(await machines.getAttribute('aria-selected'), 'true')
  } finally { await browser.close() }
})
