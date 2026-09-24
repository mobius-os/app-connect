import assert from 'node:assert/strict'
import test from 'node:test'

import {
  activeCommands,
  appendTail,
  cancelCommandPath,
  commandCapabilities,
  disconnectPresentation,
  outputPath,
  statusOf,
} from './connect-state.mjs'

test('busy is distinct from online and takes precedence over an update', () => {
  assert.deepEqual(statusOf({
    online: true, busy: true, runner_update_available: true,
  }), { cls: 'busy', label: 'Working' })
})

test('several running commands are counted in the machine status', () => {
  assert.deepEqual(statusOf({
    online: true,
    busy: true,
    active_commands: [{ id: 'a' }, { id: 'b' }],
  }), { cls: 'busy', label: 'Working · 2' })
})

test('a Möbius from before parallel commands still reports its one command', () => {
  const command = { id: 'aabbccddeeff0011', state: 'running' }
  assert.deepEqual(activeCommands({ active_command: command }), [command])
  assert.deepEqual(activeCommands({ active_command: null }), [])
  assert.deepEqual(activeCommands({ active_commands: [] }), [])
})

test('cancel and output target the exact host and command', () => {
  const host = { id: 'h_machine' }
  const command = { id: 'aabbccddeeff0011', state: 'canceling' }
  assert.deepEqual(commandCapabilities(command), {
    canStop: true, stopping: true, state: 'canceling',
  })
  assert.equal(
    cancelCommandPath(host, command),
    '/api/connect/hosts/h_machine/commands/aabbccddeeff0011/cancel',
  )
  assert.equal(
    outputPath(host, command, 7),
    '/api/connect/hosts/h_machine/commands/aabbccddeeff0011/output?after=7',
  )
  assert.equal(cancelCommandPath(host, null), null)
  assert.equal(cancelCommandPath({ id: '' }, command), null)
  assert.deepEqual(commandCapabilities({ state: 'running' }), {
    canStop: false, stopping: false, state: 'running',
  })
})

test('the live tail keeps only the latest lines across chunk boundaries', () => {
  let tail = appendTail('', [{ text: 'step 1\nstep ' }], 3)
  tail = appendTail(tail, [{ text: '2\nstep 3\n' }, { text: 'step 4\n' }], 3)
  assert.equal(tail, 'step 2\nstep 3\nstep 4\n')
  assert.equal(appendTail(tail, [], 3), tail)
})

test('online disconnect makes the button primary and explains the local fallback', () => {
  assert.deepEqual(disconnectPresentation({ name: 'Host', paired: true, online: true }), {
    title: 'Disconnect Host?',
    description: 'You’ll confirm before Connect is uninstalled and this saved connection is removed.',
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

test('a tail without line breaks stays bounded', () => {
  const tail = appendTail('', [{ text: 'x'.repeat(10000) }], 12, 4000)
  assert.equal(tail.length, 4000)
})
