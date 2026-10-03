// Visual design decisions that live only in the stylesheet. Behaviour is
// tested in the browser fixtures (test_app, test_tabs, test_browser_access,
// test_shared_access), not by matching source text.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./index.jsx', import.meta.url), 'utf8')
const css = source.slice(source.indexOf('const CSS = `'), source.indexOf('`\n', source.indexOf('const CSS = `') + 13))
const rule = selector => {
  const match = css.match(new RegExp(`(?:^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))
  assert.ok(match, `missing CSS rule ${selector}`)
  return match[1]
}

test('header divider is an inset hairline rather than a full-width border', () => {
  assert.match(rule('.cn-head-inner'), /position:\s*relative;/)
  assert.match(rule('.cn-head-inner::after'), /left:\s*16px;[^}]*right:\s*16px;/)
  assert.doesNotMatch(rule('.cn-head') + rule('.cn-head-inner'), /border-bottom:/)
})

test('forms and actions share a compact control rhythm', () => {
  assert.match(rule('.cn-input'), /height:\s*46px;/)
  assert.match(rule('.cn-machine-form > .cn-btn'), /min-height:\s*46px;/)
  assert.match(rule('.cn-browser-create > .cn-btn'), /min-height:\s*46px;/)
  assert.match(rule('.cn-share-grid'), /grid-template-columns:\s*1fr;[^}]*gap:\s*13px;/)
  assert.match(rule('.cn-command-input'), /min-height:\s*76px;/)
})

test('sections are separated by space; rows carry the only dividers', () => {
  assert.doesNotMatch(rule('.cn-section') + rule('.cn-section-first'), /border/)
  assert.match(rule('.cn-host'), /border-bottom:\s*1px solid var\(--border\)/)
  assert.match(rule('.cn-list'), /border-top:\s*1px solid var\(--border\)/)
  assert.doesNotMatch(rule('.cn-disconnect, .cn-command, .cn-update, .cn-finished'), /border-top:/)
  assert.doesNotMatch(rule('.cn-disconnect-alt, .cn-update-manual'), /border-top:/)
})

test('machine summaries stay a fixed grid whose whole row toggles details', () => {
  assert.match(rule('.cn-host-summary, .cn-outbound'), /display:\s*grid;/)
  assert.match(rule('.cn-host-toggle'), /inset:\s*0;[^}]*height:\s*100%;/)
  assert.match(rule('.cn-host-details[hidden]'), /display:\s*none;/)
})

test('rename stays icon-only while preserving a touch target and keyboard focus', () => {
  const edit = rule('.cn-name-edit')
  assert.match(edit, /pointer-events:\s*auto;/)
  assert.match(edit, /width:\s*44px/)
  assert.match(edit, /height:\s*44px/)
  assert.match(edit, /border:\s*0;/)
  assert.match(edit, /background:\s*transparent;/)
  assert.match(rule('.cn-btn.cn-name-edit:hover:not(:disabled)'), /background:\s*transparent;/)
  assert.match(css, /\.cn-btn:focus-visible[^}]*outline:\s*2px/)
})

test('in-place confirmations keep their buttons together at the start of the row', () => {
  assert.match(rule('.cn-inline-confirm'), /gap:\s*8px;/)
  assert.match(rule('.cn-disconnect-actions'), /justify-content:\s*flex-start;/)
  assert.doesNotMatch(css, /cn-action-popover|cn-action-anchor/)
})
