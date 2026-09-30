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

test('renaming uses the standard edit icon instead of making the name clickable', () => {
  assert.match(source, /import \{[^}]*Pencil[^}]*\} from '@openai\/apps-sdk-ui\/components\/Icon'/)
  assert.match(source, /<span className="cn-host-name">\{host\.name\}<\/span>/)
  assert.match(source, /className="cn-host-edit"[\s\S]*aria-label=\{`Rename \$\{host\.name\}`\}[\s\S]*<Pencil size=\{15\}/)
  assert.doesNotMatch(source, /cn-host-namebtn/)
})

test('rename keeps validation and in-flight controls inside the row', () => {
  assert.match(source, /if \(!name\) \{[\s\S]*setRenameError\('Enter a machine name\.'\)/)
  assert.match(source, /event\.key === 'Escape' && !saving/)
  assert.match(source, /className="cn-rename-error"[\s\S]*role="alert"/)
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

test('runner updates use typed error codes and command outcomes', () => {
  assert.match(source, /responseErrorData\(response/)
  assert.match(source, /failure\.code/)
  assert.match(source, /outcome: result\.outcome/)
  assert.match(source, /code === 'host_busy'/)
  assert.match(source, /outcome === 'expired'/)
  assert.doesNotMatch(source, /exitCode === 125|runner restarted before the command result was reported|\/busy\|running a command\/i/)
  assert.match(source, /cmd: host\.update_command, timeout: 180/)
})

test('online update and disconnect panels share action-first manual-command layout', () => {
  const disconnect = source.slice(source.indexOf('function DisconnectPanel('), source.indexOf('function OutboundAccess('))
  const update = source.slice(source.indexOf('function UpdatePanel('), source.indexOf('function MachineRow('))
  assert.match(disconnect, /!host\.online \? <>[\s\S]*?presentation\.description/)
  assert.match(disconnect, /<InlineActionConfirm[\s\S]*?triggerLabel=\{action\}[\s\S]*?confirmLabel=\{host\.online \? 'Confirm disconnect'/)
  assert.match(disconnect, /Disconnect manually[\s\S]*?<CopyCommand/)
  assert.match(update, /triggerLabel=\{retry \? 'Try update again' : 'Update runner'\}/)
  assert.match(update, /<InlineActionConfirm[\s\S]*?confirmLabel="Confirm update"/)
  assert.match(update, /Update manually[\s\S]*?<CopyCommand/)
  assert.doesNotMatch(update, /cn-update-copy|Run the current installer/)
  assert.doesNotMatch(disconnect + update, /<ActionConfirm/)
  assert.match(source, /\.cn-disconnect-actions\s*\{[^}]*justify-content:\s*flex-start;/s)
  assert.match(source, /\.cn-inline-confirm\s*\{[^}]*gap:\s*8px;/s)
  assert.doesNotMatch(source, /\.cn-inline-confirm \.cn-inline-not-now\s*\{[^}]*margin-left:\s*auto;/s)
  assert.match(source, /onClick=\{open \? onConfirm : onOpen\}/)
  assert.match(source, />Not now<\/button>/)
})

test('stale lists remain visible but remote mutations are blocked', () => {
  assert.match(source, /machines\.ready \|\| \(machines\.transient && previous === true\)/)
  assert.match(source, /if \(machines\.ready\) \{[\s\S]*setHosts\(machines\.items\)/)
  assert.match(source, /if \(shared\.ready\) \{/)
  assert.match(source, /remote actions are paused until it refreshes/)
  assert.match(source, /disabled=\{stale \|\| revokingId === connection\.id\}/)
  assert.match(source, /disabled=\{stale \|\| updating\}/)
})

test('pairing shows actual expiry and offers a refresh command', () => {
  assert.match(source, /pairing\.expires_at/)
  assert.match(source, /Refresh command/)
  assert.match(source, /onRefresh=\{\(\) => showCommand\(pairing\.id\)\}/)
})

test('outbound process health is not mislabeled as remote connectivity', () => {
  assert.match(source, /connection\.online \? 'Service running'/)
  assert.doesNotMatch(source, /connection\.online \? 'Active'/)
})

test('confirmations stay local to their action and do not reflow machine rows', () => {
  assert.match(source, /function ActionConfirm\(/)
  assert.match(source, /aria-expanded=\{open\}/)
  assert.match(source, /onKeyDown=\{event => \{ if \(event\.key === 'Escape'\) onCancel\(\) \}\}/)
  assert.match(source, /\.cn-host-summary, \.cn-outbound\s*\{[^}]*display:\s*grid;/s)
  assert.match(source, /\.cn-list\s*\{[^}]*overflow:\s*visible;/s)
  assert.match(source, /function InlineActionConfirm\(/)
  assert.match(source, /aria-expanded=\{open\}/)
  assert.match(source, /id=\{`cn-revoke-\$\{connection\.id\}`\}/)
  assert.match(source, /id=\{`cn-stop-\$\{host\.id\}-\$\{command\.id\}`\}/)
  assert.match(source, /confirmLabel=\{host\.online \? 'Confirm disconnect'/)
  assert.doesNotMatch(source, /cn-outbound-confirm|cn-command-confirm|cn-update-popover/)
})

test('machine headings and hit targets belong to a summary independent of full-width details', () => {
  const row = source.slice(source.indexOf('function MachineRow('), source.indexOf('export default function App'))
  assert.match(row, /<article className="cn-host">\s*<div className="cn-host-summary">/)
  assert.match(row, /aria-controls=\{`cn-details-\$\{host.id\}`\}/)
  assert.match(row, /<div className="cn-host-details" id=\{`cn-details-\$\{host.id\}`\}>[\s\S]*<DisconnectPanel[\s\S]*<CommandPanel[\s\S]*<FinishedOutput[\s\S]*<UpdatePanel/)
  assert.match(source, /\.cn-host-toggle\s*\{[^}]*inset:\s*0;[^}]*height:\s*100%;/s)
  assert.match(source, /\.cn-host-details:empty\s*\{\s*display:\s*none;/)
  assert.doesNotMatch(source, /height:\s*71px|grid-column:\s*2\s*\/\s*-1|\.cn-command \+ \.cn-command/)
})

test('command sections use spacing without extra internal horizontal dividers', () => {
  assert.doesNotMatch(source, /\.cn-disconnect, \.cn-command, \.cn-update, \.cn-finished\s*\{[^}]*border-top:/s)
  assert.doesNotMatch(source, /\.cn-disconnect-alt, \.cn-update-manual\s*\{[^}]*border-top:/s)
  assert.match(source, /\.cn-host\s*\{[^}]*border-bottom:\s*1px solid var\(--border\)/s)
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

test('one discriminated confirmation owns destructive and update prompts', () => {
  assert.match(source, /const \[confirmation, setConfirmation\] = useState\(null\)/)
  for (const kind of ['remove', 'stop', 'update', 'revoke']) {
    assert.match(source, new RegExp(`setConfirmation\\(\\{ kind: '${kind}'`))
  }
  assert.doesNotMatch(source, /const \[(?:removeConfirmingId|stopConfirmingId|updateConfirmingId|outboundConfirmId),/)
})

test('expanded machines offer bounded recent-command output with one cursor reader', () => {
  assert.match(source, /host\.recent_commands\?\.length/)
  assert.match(source, /host\.recent_commands\.slice\(0, 20\)/)
  assert.match(source, /function FinishedOutput\(\{ host, commands, headers \}\)/)
  assert.match(source, /outputPath\(host, command, cursor\)/)
  assert.match(source, /setPrevious\(current => \[\.\.\.current\.slice\(-99\), cursor\]\)/)
  assert.match(source, /setPage\(null\)/)
  assert.match(source, /setPage\(loaded\)/)
  assert.match(source, /Result preview only/)
  assert.doesNotMatch(source, /host\.last_command/)
})


test('stale data disables stop, rename submission and pairing refresh without disabling local reading', () => {
  const command = source.slice(source.indexOf('function CommandPanel('), source.indexOf('function FinishedOutput('))
  assert.match(command, /disabled=\{stale \|\| stoppingNow\}/)
  assert.match(source, /onClick=\{onRenameSave\} disabled=\{saving \|\| stale\}/)
  assert.match(source, /if \(!saving && !stale\) onRenameSave\(\)/)
  assert.match(source, /onClick=\{onRefresh\} disabled=\{stale\}/)
  assert.match(source, /<PairingPanel\s+stale=\{serviceStale\}/)
})

test('output selection survives recent-list rollover with its own command and cursor', () => {
  const output = source.slice(source.indexOf('function FinishedOutput('), source.indexOf('function formatLimit('))
  assert.match(output, /useState\(commands\[0\]\)/)
  assert.match(output, /commands\.find\(item => item\.id === selectedCommand\.id\) \|\| selectedCommand/)
  assert.match(output, /setSelectedCommand\(item\)[\s\S]*setCursor\(0\)[\s\S]*setPrevious\(\[\]\)/)
  assert.doesNotMatch(output, /\|\| commands\[0\]|Page \{previous\.length/)
})
