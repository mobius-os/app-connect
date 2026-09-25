import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./index.jsx', import.meta.url), 'utf8')

test('header divider is an inset hairline rather than a full-width border', () => {
  assert.match(source, /\.cn-head-inner\s*\{[^}]*position:\s*relative;/s)
  assert.match(source, /\.cn-head-inner::after\s*\{[^}]*left:\s*16px;[^}]*right:\s*16px;/s)
  assert.doesNotMatch(source, /\.cn-head(?:-inner)?\s*\{[^}]*border-bottom:/s)
})

test('forms and actions share a compact control rhythm', () => {
  assert.match(source, /\.cn-input\s*\{[^}]*height:\s*46px;/s)
  assert.match(source, /\.cn-machine-form\s*>\s*\.cn-btn\s*\{[^}]*min-height:\s*46px;/s)
})

test('header keeps a concise description under the app name', () => {
  assert.match(source, /<p className="cn-sub">Remote access, both ways\.<\/p>/)
})

test('grant access uses roomy stacked fields and a separate action row', () => {
  assert.match(source, /\.cn-share-grid\s*\{[^}]*grid-template-columns:\s*1fr;[^}]*gap:\s*13px;/s)
  assert.match(source, /\.cn-command-input\s*\{[^}]*min-height:\s*76px;/s)
  assert.match(source, /className="cn-form-footer"/)
})

test('new machines start with an editable default name and restore it after creation', () => {
  assert.match(source, /const DEFAULT_MACHINE_NAME = 'My machine'/)
  assert.match(source, /useState\(DEFAULT_MACHINE_NAME\)/)
  assert.match(source, /setNewName\(DEFAULT_MACHINE_NAME\)/)
})

test('the two connection directions are the permanent page structure', () => {
  const render = source.slice(source.indexOf('export default function App'))
  const controlled = render.indexOf('Machines you control')
  const controlling = render.indexOf('<OutboundAccess')
  assert.ok(controlled > 0)
  assert.ok(controlling > controlled)
  assert.match(source, /Can control this Möbius/)
  assert.doesNotMatch(source, /Give someone access to this Möbius/)
  assert.doesNotMatch(source, /Ask them to add a machine/)
})

test('shared access stays progressive and revocable', () => {
  assert.match(source, /Paste their curl … \| sh command/)
  assert.match(source, /Full command access until you revoke it/)
  assert.match(source, /loadConnectionList\('\/api\/connect\/outbound'/)
  assert.match(source, /\/api\/connect\/outbound\/\$\{connection\.id\}/)
  assert.match(source, /Revoke access/)
})

test('runner updates require a local confirmation and use the selected host command', () => {
  assert.match(source, /className="cn-action-popover"/)
  assert.match(source, /.cn-action-popover\s*\{[^}]*position:\s*absolute;/s)
  assert.doesNotMatch(source, /cn-update-dialog-backdrop|aria-modal="true"/)
  assert.match(source, /<InlineActionConfirm[\s\S]*?triggerLabel=\{currentResult\?\.exitCode === 125/)
  assert.match(source, /fetch\(`\/api\/connect\/hosts\/\$\{host\.id\}\/exec`/)
  assert.match(source, /cmd: host\.update_command, timeout: 180/)
  assert.match(source, /Installer finished; Connect has not confirmed the updated runner yet\./)
  assert.match(source, /Another command is using this machine, so the update is waiting/)
  assert.match(source, /runner restarted before the command result was reported/i)
  assert.match(source, /runnerRestarted && updated/)
  assert.match(source, /currentResult\?\.exitCode === 125 \? 'Try update again'/)
  assert.match(source, /currentResult\.exitCode === 125 \|\| currentResult\.errorKind === 'expired' \? ' is-waiting'/)
  assert.doesNotMatch(source, /confirming \? 'Not now'/)
})

test('online update and disconnect panels share action-first manual-command layout', () => {
  const disconnect = source.slice(source.indexOf('function DisconnectPanel('), source.indexOf('function OutboundAccess('))
  const update = source.slice(source.indexOf('function UpdatePanel('), source.indexOf('function MachineRow('))
  assert.match(disconnect, /!host\.online \? <>[\s\S]*?presentation\.description/)
  assert.match(disconnect, /<InlineActionConfirm[\s\S]*?triggerLabel=\{action\}[\s\S]*?confirmLabel=\{host\.online \? 'Confirm disconnect'/)
  assert.match(disconnect, /Disconnect manually[\s\S]*?<CopyCommand/)
  assert.match(update, /triggerLabel=\{currentResult\?\.exitCode === 125 \? 'Try update again' : 'Update runner'\}/)
  assert.match(update, /<InlineActionConfirm[\s\S]*?confirmLabel="Confirm update"/)
  assert.match(update, /Update manually[\s\S]*?<CopyCommand/)
  assert.doesNotMatch(update, /cn-update-copy|Run the current installer/)
  assert.doesNotMatch(disconnect + update, /<ActionConfirm/)
  assert.match(source, /\.cn-disconnect-actions\s*\{[^}]*justify-content:\s*flex-start;/s)
  assert.match(source, /\.cn-inline-confirm\s*\{[^}]*gap:\s*8px;/s)
  assert.doesNotMatch(source, /\.cn-inline-confirm \.cn-inline-not-now\s*\{[^}]*margin-left:\s*auto;/s)
  assert.match(source, /onClick=\{open \? onConfirm : onOpen\}/)
  assert.match(source, />Not now<\/button>/)
  assert.match(source, /The machine didn’t start the update before it expired\. Nothing ran; try again\./)
  assert.match(source, /response\.status === 504/)
})

test('confirmations stay local to their action and do not reflow machine rows', () => {
  assert.match(source, /function ActionConfirm\(/)
  assert.match(source, /aria-expanded=\{open\}/)
  assert.match(source, /onKeyDown=\{event => \{ if \(event\.key === 'Escape'\) onCancel\(\) \}\}/)
  assert.match(source, /\.cn-host, \.cn-outbound\s*\{[^}]*display:\s*grid;/s)
  assert.match(source, /\.cn-list\s*\{[^}]*overflow:\s*visible;/s)
  assert.match(source, /function InlineActionConfirm\(/)
  assert.match(source, /aria-expanded=\{open\}/)
  assert.match(source, /id=\{`cn-revoke-\$\{connection\.id\}`\}/)
  assert.match(source, /id=\{`cn-stop-\$\{host\.id\}-\$\{command\.id\}`\}/)
  assert.match(source, /confirmLabel=\{host\.online \? 'Confirm disconnect'/)
  assert.doesNotMatch(source, /cn-outbound-confirm|cn-command-confirm|cn-update-popover/)
})

test('a runner supervised by another Möbius explains its update instead of offering an installer', () => {
  assert.match(source, /host\.runner_managed === 'mobius'/)
  assert.match(source, /It installs the current runner the next time it restarts\./)
})

test('live output polling never overlaps and only targets platforms with the route', () => {
  assert.match(source, /if \(inFlight\) return/)
  assert.match(source, /\.filter\(host => Array\.isArray\(host\.active_commands\)\)/)
  assert.doesNotMatch(source, /busy_source/)
})

test('agent access is offered only where the platform supports it', () => {
  assert.match(source, /setAgentSupported\(shared\.data\?\.agent_access === true\)/)
  assert.match(source, /\{agentSupported \? <label className="cn-agent-choice">/)
  assert.match(source, /\{agentSupported && connection\.status === 'active' \? <label\s+className=\{`cn-agent-toggle/)
  assert.match(source, /<div className="cn-outbound-actions">[\s\S]*cn-agent-toggle[\s\S]*<ActionConfirm/)
  assert.match(source, /\/>Full access\s*<\/label>/)
  assert.match(source, /JSON\.stringify\(\{ label, command, agent: accessAgent \}\)/)
  assert.match(source, /method: 'PATCH',[\s\S]*JSON\.stringify\(\{ agent \}\)/)
})
