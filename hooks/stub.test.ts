import { test, expect } from 'claude-code/testing'
import { stub, symbols } from './stub'

const ts = `import { x } from 'y'
const SMALL = 1
export function big(a: number) {
  const b = a + 1
  const c = b * 2
  return c
}
class Foo {
  bar() {
    one()
    two()
    three()
  }
  tiny() { return 1 }
}`.split('\n')

test('finds big fn and class method, skips imports/one-liners', () => {
  expect(symbols(ts).map(s => [s.start, s.end])).toEqual([[2, 6], [8, 12]])
})

test('stubs body, keeps signature and closer', () => {
  const out = stub(ts, symbols(ts).slice(0, 1)).split('\n')
  expect(out.slice(2, 5)).toEqual([
    'export function big(a: number) {',
    '  ⋯ stubbed L4-6 (Read offset=4 limit=3)',
    '}',
  ])
})

test('python indent blocks', () => {
  const py = ['def f(x):', '    a = 1', '    b = 2', '    return a + b', '', 'X = 3'].map(String)
  expect(symbols(py).map(s => s.start)).toEqual([0])
  expect(stub(py, symbols(py)).split('\n')[1]).toBe('    ⋯ stubbed L2-4 (Read offset=2 limit=3)')
})
