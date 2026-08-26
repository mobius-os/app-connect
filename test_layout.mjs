import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./index.jsx', import.meta.url), 'utf8')

test('header divider is an inset hairline rather than a full-width border', () => {
  assert.match(source, /\.cn-head-inner\s*\{[^}]*position:\s*relative;/s)
  assert.match(source, /\.cn-head-inner::after\s*\{[^}]*left:\s*16px;[^}]*right:\s*16px;/s)
  assert.doesNotMatch(source, /\.cn-head(?:-inner)?\s*\{[^}]*border-bottom:/s)
})

test('new-machine field and action share one control height', () => {
  assert.match(source, /\.cn-onboard\s*>\s*\.cn-btn\s*\{[^}]*min-height:\s*48px;/s)
  assert.match(source, /\.cn-input\s*\{[^}]*height:\s*48px;/s)
})
