import assert from 'node:assert/strict'
import test from 'node:test'
import { bundle, open } from './fixture.mjs'

const script = await bundle(`
  import App from './index.jsx'
  createRoot(document.getElementById('root')).render(<App appId={42} token="fixture"/>)
`)
const laptop = (extra = {}) => ({ id: 'h1', name: 'Laptop', paired: true, online: true, platform: 'linux', active_commands: [], ...extra })

// Lists answer from the given state; `write` answers everything else.
function machines({ hosts = [laptop()], connections = [], agent_access = false, write = () => undefined } = {}) {
  return request => {
    if (request.method === 'GET' && request.path === '/api/connect/hosts') return { body: { hosts } }
    if (request.method === 'GET' && request.path === '/api/connect/outbound') return { body: { connections, agent_access } }
    if (request.method === 'GET' && request.path.startsWith('/api/connect/browser-access')) return { status: 404 }
    return write(request)
  }
}

const expand = page => page.getByRole('button', { name: 'Show details for Laptop' }).click()

test('the two connection directions are the page structure, with honest outbound status', async () => {
  const connections = [{ id: 'o1', label: 'Studio', target: 'studio.example', online: true, status: 'active', agent: false }]
  const { browser, page } = await open(script, machines({ connections }))
  try {
    await page.getByText('Studio', { exact: true }).waitFor()
    const headings = await page.getByRole('heading', { level: 2 }).allTextContents()
    assert.deepEqual(headings.slice(0, 2), ['Machines you control', 'Can control this Möbius'])
    assert.equal(await page.getByText('Service running').count(), 1)
    assert.equal(await page.getByText('Full access', { exact: true }).count(), 0)
  } finally { await browser.close() }
})

test('full access is offered only where the platform supports it, and toggles in place', async () => {
  const connections = [{ id: 'o1', label: 'Studio', target: 'studio.example', online: true, status: 'active', agent: false }]
  const { browser, page, requests } = await open(script, machines({ connections, agent_access: true, write: () => ({ body: {} }) }))
  try {
    await Promise.all([
      page.waitForRequest(request => request.method() === 'PATCH'),
      page.getByRole('checkbox', { name: 'Full access' }).click(),
    ])
    const patch = requests.find(item => item.method === 'PATCH')
    assert.deepEqual(patch, { method: 'PATCH', path: '/api/connect/outbound/o1', query: '', body: { agent: true } })
    await page.getByRole('button', { name: 'Grant access' }).click()
    assert.equal(await page.getByRole('checkbox', { name: /Full access/ }).count(), 2)
  } finally { await browser.close() }
})

test('a new machine starts with an editable default name; Enter creates it and shows pairing', async () => {
  const { browser, page, requests } = await open(script, machines({ hosts: [], write: request => request.method === 'POST'
    ? { body: { id: 'h2', name: request.body.name, install_command: 'curl https://fixture.test/pair | sh' } } : undefined }))
  try {
    await page.getByRole('button', { name: 'Add machine' }).click()
    assert.equal(await page.getByPlaceholder('My MacBook').inputValue(), 'My machine')
    await page.getByPlaceholder('My MacBook').press('Enter')
    await page.getByText('curl https://fixture.test/pair | sh').waitFor()
    assert.deepEqual(requests.find(item => item.method === 'POST').body, { name: 'My machine' })
    assert.equal(await page.getByRole('button', { name: 'Refresh command' }).count(), 1)
    await page.getByRole('button', { name: 'Add machine' }).click()
    assert.equal(await page.getByPlaceholder('My MacBook').inputValue(), 'My machine')
  } finally { await browser.close() }
})

test('rename validates locally and shows the server’s reason in the row', async () => {
  const { browser, page, requests } = await open(script, machines({ write: request => request.method === 'PATCH'
    ? { status: 409, body: { detail: 'Another machine already uses that name.' } } : undefined }))
  try {
    await page.getByRole('button', { name: 'Rename Laptop' }).click()
    const input = page.getByRole('textbox', { name: 'Rename Laptop' })
    await input.fill('  ')
    await input.press('Enter')
    await page.getByText('Enter a machine name.').waitFor()
    assert.equal(requests.filter(item => item.method === 'PATCH').length, 0)
    await input.fill('Desk')
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('alert').filter({ hasText: 'Another machine already uses that name.' }).waitFor()
    assert.equal(await input.inputValue(), 'Desk')
    await input.press('Escape')
    assert.equal(await input.count(), 0)
  } finally { await browser.close() }
})

test('stop asks in place; Not now never stops the command', async () => {
  const hosts = [laptop({ active_commands: [{ id: 'c1', label: 'make test', state: 'running', started_at: 1 }] })]
  const { browser, page, count } = await open(script, machines({ hosts, write: () => ({ body: {} }) }))
  try {
    await expand(page)
    await page.getByRole('button', { name: 'Stop command', exact: true }).click()
    await page.getByRole('button', { name: 'Not now' }).click()
    assert.equal(count('POST', '/api/connect/hosts/h1/commands/c1/cancel'), 0)
    await page.getByRole('button', { name: 'Stop command', exact: true }).click()
    await page.getByRole('button', { name: 'Stop command and its processes' }).click()
    await page.waitForFunction(() => !document.body.textContent.includes('Stop command and its processes'))
    assert.equal(count('POST', '/api/connect/hosts/h1/commands/c1/cancel'), 1)
  } finally { await browser.close() }
})

test('a failed action shows the server’s reason, or a plain fallback when the connection drops', async () => {
  for (const [reply, message] of [
    [{ status: 409, body: { detail: 'Laptop is running a command.' } }, 'Laptop is running a command.'],
    [{ abort: true }, 'Couldn’t disconnect this machine.'],
  ]) {
    const { browser, page } = await open(script, machines({ write: request => request.method === 'DELETE' ? reply : undefined }))
    try {
      await expand(page)
      await page.getByRole('button', { name: 'Disconnect machine' }).click()
      await page.getByRole('button', { name: 'Confirm disconnect' }).click()
      await page.getByText(message).waitFor()
      assert.equal(await page.getByText('Laptop', { exact: true }).count(), 1)
    } finally { await browser.close() }
  }
})

test('runner updates run the advertised installer with a bounded timeout', async () => {
  const hosts = [laptop({ runner_update_available: true, update_command: 'python3 runner.py --update' })]
  const { browser, page, requests } = await open(script, machines({ hosts, write: request => request.path.endsWith('/exec')
    ? { body: { exit_code: 0, outcome: 'completed' } } : undefined }))
  try {
    await expand(page)
    await page.getByRole('button', { name: 'Update runner' }).click()
    await page.getByRole('button', { name: 'Confirm update' }).click()
    await page.getByText('Installer finished; Connect has not confirmed the updated runner yet.').waitFor()
    assert.deepEqual(requests.find(item => item.path.endsWith('/exec')).body, { cmd: 'python3 runner.py --update', timeout: 180 })
  } finally { await browser.close() }
})

test('a runner supervised by another Möbius explains its update instead of offering one', async () => {
  const hosts = [laptop({ runner_update_available: true, runner_managed: 'mobius', update_command: 'x' })]
  const { browser, page } = await open(script, machines({ hosts }))
  try {
    await expand(page)
    await page.getByText('It installs the current runner the next time it restarts.').waitFor()
    assert.equal(await page.getByRole('button', { name: 'Update runner' }).count(), 0)
  } finally { await browser.close() }
})

test('a stale machine list stays readable while remote changes are paused', async () => {
  let reads = 0
  // A busy machine polls every 1.5 seconds, so the failure arrives quickly.
  const hosts = [laptop({ busy: true })]
  const { browser, page } = await open(script, request => {
    if (request.path === '/api/connect/hosts') return ++reads === 1 ? { body: { hosts } } : { status: 503 }
    if (request.path === '/api/connect/outbound') return { body: { connections: [] } }
  })
  try {
    await page.getByText('remote actions are paused until it refreshes', { exact: false }).waitFor({ timeout: 5000 })
    assert.equal(await page.getByText('Laptop', { exact: true }).count(), 1)
    assert.equal(await page.getByRole('button', { name: 'Add machine' }).isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: 'Rename Laptop' }).isDisabled(), true)
  } finally { await browser.close() }
})

test('switching tabs during the first load still finishes loading Machines', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const answer = machines()
  const { browser, page } = await open(script, async request => {
    if (request.method === 'GET' && request.path === '/api/connect/hosts') await gate
    return answer(request)
  })
  try {
    await page.evaluate(() => {
      window.signals = []
      window.mobius.signal = (name, data) => window.signals.push(name)
    })
    await page.getByRole('tab', { name: /Shared Möbius/ }).click()
    release()
    await page.waitForFunction(() => window.signals.includes('app_ready'))
    await page.getByRole('tab', { name: 'Machines' }).click()
    await page.getByText('Laptop', { exact: true }).waitFor()
    assert.equal(await page.getByText('Loading Connect…').count(), 0)
  } finally { await browser.close() }
})
