import assert from 'node:assert/strict'
import test from 'node:test'

import {
  activeCommands,
  appendTail,
  cancelCommandPath,
  commandCapabilities,
  disconnectPresentation,
  outputPage,
  outputPath,
  runnerUpdateFeedback,
  statusOf,
  platformLabel,
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

test('finished output pages preserve server cursor and do not accumulate old text', () => {
  const first = outputPage({
    chunks: [{ seq: 0, text: 'first' }, { seq: 2, text: ' page' }],
    next: 3, has_more: true, output_complete: true,
  }, 0)
  assert.deepEqual(first, { text: 'first page', next: 3, hasMore: true, complete: true, preview: '' })
  assert.deepEqual(outputPage({
    chunks: [{ seq: 3, text: 'second' }], next: 4,
    has_more: false, output_complete: false,
  }, first.next), { text: 'second', next: 4, hasMore: false, complete: false, preview: '' })
  assert.equal(outputPage({ chunks: [], next: 0, has_more: false,
    result: { stdout: 'preview', stderr: 'only' } }, 0).preview, 'preview\nonly')
  assert.throws(() => outputPage({ chunks: [], next: 3, has_more: true }, 3), /advance/)
  assert.throws(() => outputPage({ chunks: [], next: '3', has_more: false }, 0), /invalid/)
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

const currentRunner = { id: 'h_update', paired: true, online: true, runner_update_available: false }
const lostUpdate = { hostId: 'h_update', outcome: 'lost', exitCode: 125 }

test('a self-restarted update is confirmed by its fresh current runner, not the missing exit report', () => {
  assert.deepEqual(runnerUpdateFeedback(currentRunner, lostUpdate), {
    tone: 'success',
    message: 'Runner updated and reconnected. The installer’s final report wasn’t received.',
    retry: false,
  })
  assert.equal(lostUpdate.outcome, 'lost')
  assert.equal(lostUpdate.exitCode, 125)
})

test('lost update feedback follows reconnection without rerunning the installer', () => {
  assert.equal(runnerUpdateFeedback({ ...currentRunner, online: false }, lostUpdate).tone, 'waiting')
  assert.equal(runnerUpdateFeedback(currentRunner, lostUpdate).tone, 'success')
})

test('an offline, stale, unpaired or still-outdated runner never confirms a lost update', () => {
  for (const host of [
    { ...currentRunner, online: false },
    { ...currentRunner, paired: false },
    { ...currentRunner, runner_update_available: true },
    { ...currentRunner, runner_update_available: undefined },
  ]) {
    const feedback = runnerUpdateFeedback(host, lostUpdate)
    assert.equal(feedback.tone, 'waiting')
    assert.equal(feedback.retry, false)
    assert.match(feedback.message, /not confirmed/)
  }
  assert.equal(runnerUpdateFeedback(currentRunner, lostUpdate, true).tone, 'waiting')
})

test('update confirmation requires both a completed installer and fresh connectivity when a result exists', () => {
  const completed = { hostId: currentRunner.id, outcome: 'completed', exitCode: 0 }
  assert.equal(runnerUpdateFeedback(currentRunner, completed).tone, 'success')
  assert.equal(runnerUpdateFeedback({ ...currentRunner, online: false }, completed).tone, 'waiting')
  assert.equal(runnerUpdateFeedback(currentRunner, completed, true).tone, 'waiting')
})

test('a connected current runner does not conceal a failed, canceled, expired or timed-out installer', () => {
  for (const outcome of ['canceled', 'timed_out']) {
    assert.equal(runnerUpdateFeedback(currentRunner, { ...lostUpdate, outcome }).tone, 'error')
  }
  const failed = runnerUpdateFeedback(currentRunner, { ...lostUpdate, outcome: 'completed' })
  assert.equal(failed.tone, 'error')
  assert.match(failed.message, /failed \(exit 125\)/)
  for (const code of ['host_busy', 'command_expired']) {
    assert.equal(runnerUpdateFeedback(currentRunner, { hostId: currentRunner.id, code }).retry, true)
  }
  assert.equal(runnerUpdateFeedback(currentRunner, { ...lostUpdate, outcome: 'expired' }).retry, true)
  assert.deepEqual(runnerUpdateFeedback(currentRunner, { ...lostUpdate, errorMessage: 'Request failed.' }), {
    tone: 'error', message: 'Request failed.', retry: false,
  })
})

test('an update result from another machine cannot confirm this one', () => {
  assert.equal(runnerUpdateFeedback({ ...currentRunner, id: 'h_other' }, lostUpdate), null)
  assert.equal(runnerUpdateFeedback(currentRunner, null), null)
})


test('compact platform names preserve unknown systems rather than inventing a family', () => {
  for (const [input, expected] of [['Darwin-24-arm64', 'macOS'], ['Linux-6.8-x86_64', 'Linux'], ['Windows-11', 'Windows'], ['FreeBSD 14', 'FreeBSD 14'], [null, '']]) {
    assert.equal(platformLabel(input), expected)
  }
})

test('update availability does not hide whether an idle machine is online', () => {
  assert.equal(statusOf({ online: true, runner_update_available: true }).label, 'Online')
})
