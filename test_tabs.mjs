import assert from 'node:assert/strict'
import test from 'node:test'
import { bundle, open } from './fixture.mjs'

const script = await bundle(`
  import App from './index.jsx'
  createRoot(document.getElementById('root')).render(<App appId={42} token="fixture"/>)
`)
const invitation = { grant_id: 'a'.repeat(24), name: 'Studio', owner_handle: 'alex', origin: 'https://studio.example', status: 'invited', unread: true,
  open_url: `https://studio.example/api/connect/browser-access/session/account/start?grant_id=${'a'.repeat(24)}` }

function answers({ hosts = [], grants = [] } = {}) {
  return request => ({
    '/api/connect/hosts': { body: { hosts } },
    '/api/connect/outbound': { body: { connections: [] } },
    '/api/connect/browser-access': { body: { grants } },
    '/api/connect/browser-access/shared': { body: { instances: [invitation] } },
  })[request.path]
}

test('tabs have roving focus, keyboard selection, one unread badge, and retain machine draft', async () => {
  const { browser, page, count } = await open(script, answers())
  try {
    const machines = page.getByRole('tab', { name: 'Machines' })
    const shared = page.getByRole('tab', { name: /Shared Möbius/ })
    await page.getByLabel('1 unread invitations').waitFor()
    assert.equal(await machines.getAttribute('tabindex'), '0')
    assert.equal(await shared.getAttribute('tabindex'), '-1')
    assert.equal(count('GET', '/api/connect/browser-access/shared'), 1)
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

test('each list polls only while its tab shows; opening Shared refreshes its lists', async () => {
  // A busy machine makes the machine list poll every 1.5 seconds.
  const hosts = [{ id: 'h1', name: 'Laptop', paired: true, online: true, busy: true }]
  const { browser, page, count } = await open(script, answers({ hosts }))
  try {
    await page.getByText('Laptop', { exact: true }).waitFor()
    await page.waitForTimeout(1800)
    assert.ok(count('GET', '/api/connect/hosts') >= 2)
    assert.equal(count('GET', '/api/connect/browser-access'), 1)
    await page.getByRole('tab', { name: /Shared Möbius/ }).click()
    await page.waitForTimeout(300)
    const machineReads = count('GET', '/api/connect/hosts')
    assert.equal(count('GET', '/api/connect/browser-access'), 2)
    assert.equal(count('GET', '/api/connect/browser-access/shared'), 2)
    await page.waitForTimeout(1800)
    assert.equal(count('GET', '/api/connect/hosts'), machineReads)
  } finally { await browser.close() }
})

test('switching tabs closes an open confirmation', async () => {
  const grants = [{ id: 'g1', label: 'Alex', status: 'active' }]
  const { browser, page, count } = await open(script, answers({ grants }))
  try {
    await page.getByRole('tab', { name: /Shared Möbius/ }).click()
    await page.getByRole('button', { name: 'Revoke', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm revoke' }).waitFor()
    await page.getByRole('tab', { name: 'Machines' }).click()
    await page.getByRole('tab', { name: /Shared Möbius/ }).click()
    assert.equal(await page.getByRole('button', { name: 'Confirm revoke' }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Revoke', exact: true }).count(), 1)
    assert.equal(count('DELETE', '/api/connect/browser-access/g1'), 0)
  } finally { await browser.close() }
})
