import assert from 'node:assert/strict'
import test from 'node:test'

import {
  cancelCommandPath,
  commandCapabilities,
  disconnectPresentation,
  statusOf,
} from './connect-state.mjs'

test('busy is distinct from online and takes precedence over an update', () => {
  assert.deepEqual(statusOf({
    online: true, busy: true, runner_update_available: true,
  }), { cls: 'busy', label: 'Working' })
})

test('old runner is honest about missing cancellation', () => {
  assert.deepEqual(commandCapabilities({
    runner_protocol: 1,
    active_command: { state: 'running' },
  }), { canStop: false, stopping: false, state: 'running' })
})

test('cancel targets the exact host and active command', () => {
  const host = {
    id: 'h_machine', runner_protocol: 2,
    active_command: { id: 'aabbccddeeff0011', state: 'canceling' },
  }
  assert.deepEqual(commandCapabilities(host), {
    canStop: true, stopping: true, state: 'canceling',
  })
  assert.equal(
    cancelCommandPath(host),
    '/api/connect/hosts/h_machine/commands/aabbccddeeff0011/cancel',
  )
  assert.equal(cancelCommandPath({ ...host, active_command: null }), null)
  assert.equal(cancelCommandPath({ ...host, id: '' }), null)
})

test('online disconnect makes the button primary and explains the local fallback', () => {
  assert.deepEqual(disconnectPresentation({ name: 'Host', paired: true, online: true }), {
    title: 'Disconnect Host?',
    description: 'The button below asks Host to uninstall Connect, revokes its access, and removes it from this list.',
    actionLabel: 'Disconnect machine',
    commandTitle: 'Otherwise, run it on Host',
    commandDescription: 'This command performs the same cleanup locally. Use it when Möbius can’t reach the machine.',
  })
})

test('offline disconnect distinguishes local uninstall from forgetting the connection', () => {
  assert.deepEqual(disconnectPresentation({ name: 'Host', paired: true, online: false }), {
    title: 'Host is offline',
    description: 'Möbius can’t ask it to uninstall Connect right now.',
    actionLabel: 'Remove saved connection',
    commandTitle: 'Remove Connect on Host',
    commandDescription: 'Run this command on the machine to remove the local service. Then remove its saved connection here.',
  })
})

test('an unpaired entry is removed without implying that a runner exists', () => {
  assert.deepEqual(disconnectPresentation({ name: 'Host', paired: false, online: false }), {
    title: 'Host hasn’t paired yet',
    description: 'Show a fresh pairing command, or remove this saved entry.',
    actionLabel: 'Remove machine',
    commandTitle: null,
    commandDescription: null,
  })
})
