import { test, expect } from 'claude-code/testing'
import { s1Probs, s1Request } from './systemone'

const lines = ['function a() {', '  x()', '}', 'function b() {', '  y()', '}']
const syms = [{ label: 'function a() {', start: 0, end: 2 }, { label: 'function b() {', start: 3, end: 5 }]

test('one noul per symbol, snippet in state', () => {
  const req = JSON.parse(s1Request('fix b', '/f.ts', syms, lines))
  expect(Object.keys(req.questions)).toEqual(['s0', 's1'])
  expect(req.questions.s1.type).toBe('noul')
  expect(req.state.symbols.s1).toBe('function b() {\n  y()\n}')
  expect(req.state.task).toBe('fix b')
})

test('probs in order; missing answer throws', () => {
  expect(s1Probs('{"answers":{"s0":{"type":"noul","noul":0.1},"s1":{"noul":0.9}}}', 2)).toEqual([0.1, 0.9])
  expect(() => s1Probs('{"answers":{"s0":{"noul":0.1}}}', 2)).toThrow()
})
