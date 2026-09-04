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
  assert.match(source, /fetch\('\/api\/connect\/outbound'/)
  assert.match(source, /\/api\/connect\/outbound\/\$\{connection\.id\}/)
  assert.match(source, /Revoke access/)
})
