import { test, expect } from 'claude-code/testing'
import { astGrepArgv, toSyms } from './astgrep'

const m = (start: number, end: number, lines: string) => ({ lines, range: { start: { line: start }, end: { line: end } } })

test('nested dropped, tiny dropped, sorted', () => {
  const out = JSON.stringify([m(12, 14, '  m() {'), m(5, 10, 'export function f() {'), m(6, 8, '  function inner() {'), m(15, 15, '  h = 1')])
  expect(toSyms(out, 2).map(s => [s.start, s.end, s.label])).toEqual([[5, 10, 'export function f() {'], [12, 14, 'm() {']])
})

test('argv per language, undefined for unsupported', () => {
  expect(astGrepArgv('/x/a.tsx')?.[3]).toContain('"language":"Tsx"')
  expect(astGrepArgv('/x/a.rb')).toBe(undefined)
})
