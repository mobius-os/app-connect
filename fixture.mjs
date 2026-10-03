// Browser fixtures for the UI tests. Every request is answered locally; no
// test ever reaches a live Connect service.
import { build } from 'esbuild'
import { chromium } from 'playwright'

const ICONS = 'export const Check = () => null, ChevronDown = () => null, Copy = () => null, Desktop = () => null, Pencil = () => null, Plus = () => null;'

export async function bundle(source) {
  const result = await build({
    stdin: {
      contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; ${source}`,
      resolveDir: new URL('.', import.meta.url).pathname,
      loader: 'jsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    plugins: [{ name: 'icons', setup(build) {
      build.onResolve({ filter: /^@openai\/apps-sdk-ui\/components\/Icon$/ }, () => ({ path: 'icons', namespace: 'fixture' }))
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: ICONS, loader: 'js' }))
    } }],
  })
  return result.outputFiles[0].text
}

// `answer({ method, path, query, body })` returns { status, body }, { abort: true }
// for a lost connection, or nothing for a 404.
export async function open(script, answer) {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CONNECT_TEST_BROWSER_EXECUTABLE ? { executablePath: process.env.CONNECT_TEST_BROWSER_EXECUTABLE } : {}),
  })
  const page = await browser.newPage()
  const requests = []
  await page.route('http://fixture.test/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' })
    const entry = { method: request.method(), path: url.pathname, query: url.search, body: request.postDataJSON() }
    requests.push(entry)
    const result = (await answer(entry)) ?? { status: 404 }
    if (result.abort) return route.abort()
    await route.fulfill({ status: result.status || 200, contentType: 'application/json', body: JSON.stringify(result.body ?? {}) })
  })
  await page.goto('http://fixture.test/')
  await page.evaluate(() => { window.mobius = { signal: () => {}, clipboard: { writeText: async () => true } } })
  await page.addScriptTag({ content: script })
  const count = (method, path) => requests.filter(item => item.method === method && item.path === path).length
  return { browser, page, requests, count }
}
