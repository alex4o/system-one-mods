import { test, expect } from 'claude-code/testing'
import { chunk, pool, s1Probs, s1Request } from './systemone'
import { fileGroup, funcGroups, funcUnits, type Unit } from './units'

const m = (start: number, end: number, first: string) => ({ lines: first, range: { start: { line: start }, end: { line: end } } })

test('funcUnits: 1-based, sorted outer-first', () => {
  const us = funcUnits('a.py', JSON.stringify([m(5, 7, '  def inner():'), m(0, 9, 'def outer():')]))
  expect(us.map(u => [u.line, u.end, u.label])).toEqual([[1, 10, 'def outer():'], [6, 8, 'def inner():']])
})

test('small file: one group, whole numbered source, all units', () => {
  const text = 'def a():\n    return 1\ndef b():\n    return 2'
  const units = funcUnits('a.py', JSON.stringify([m(0, 1, 'def a():'), m(2, 3, 'def b():')]))
  const gs = funcGroups('a.py', text, units)
  expect(gs.length).toBe(1)
  expect(gs[0]?.code).toBe('1: def a():\n2:     return 1\n3: def b():\n4:     return 2')
  expect(gs[0]?.units.length).toBe(2)
})

test('big file: windows of whole bodies, nested body not repeated', () => {
  const lines = Array.from({ length: 4000 }, (_, i) => `x${i} = ${'v'.repeat(20)}`)
  const units: Unit[] = [
    { kind: 'func', file: 'b.py', line: 1, end: 200, label: 'def outer():' },
    { kind: 'func', file: 'b.py', line: 50, end: 60, label: 'def inner():' },
    ...Array.from({ length: 19 }, (_, k): Unit => ({ kind: 'func', file: 'b.py', line: 201 + k * 200, end: 400 + k * 200, label: `def f${k}():` })),
  ]
  const gs = funcGroups('b.py', lines.join('\n'), units)
  expect(gs.length).toBeGreaterThan(1)
  expect(gs.flatMap(g => g.units).length).toBe(21)
  expect(gs.every(g => g.code.length <= 24_000 + 6_001)).toBe(true)
  expect(gs[0]?.code.split('\n50: ').length).toBe(2) // line 50 shown once
})

test('request: shared state, one noul per unit; file question for file units', () => {
  const req = JSON.parse(s1Request('parse args', fileGroup('cli.py', 'import sys')))
  expect(req.state).toEqual({ query: 'parse args', file: 'cli.py', code: '1: import sys' })
  expect(req.questions.c0.instructions).toBe('Does `file` contain code that does this: parse args?')
})

test('probs, chunk, pool', async () => {
  expect(s1Probs('{"answers":{"c0":{"noul":0.2},"c1":{"noul":0.8}}}', 2)).toEqual([0.2, 0.8])
  expect(() => s1Probs('{"answers":{}}', 1)).toThrow()
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  const seen: number[] = []
  await pool([1, 2, 3], 2, async n => { seen.push(n) })
  expect(seen.sort()).toEqual([1, 2, 3])
})
