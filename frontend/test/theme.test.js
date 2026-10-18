/**
 * Theme resolution. The DOM side (`applyTheme`, `setPreference`) is exercised in
 * the browser; what is tested here is the decision, because getting it wrong is
 * what makes an explicit choice silently follow the OS again.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

const { resolveTheme, THEME_OPTIONS } = await import('../src/lib/theme.js')

test('an explicit preference beats the OS, both ways', () => {
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme('dark', false), 'dark')
})

test('system follows the OS', () => {
  assert.equal(resolveTheme('system', true), 'dark')
  assert.equal(resolveTheme('system', false), 'light')
})

test('an unknown or absent preference falls back to following the OS', () => {
  assert.equal(resolveTheme('sepia', true), 'dark')
  assert.equal(resolveTheme(undefined, false), 'light')
})

test('the control advertises exactly the three choices', () => {
  assert.deepEqual(THEME_OPTIONS, ['system', 'light', 'dark'])
})
