import { test, expect } from 'claude-code/testing'

const body = (n: string) => [`function ${n}() {`, ...Array.from({ length: 80 }, (_, i) => `  step${i}()`), '}']
const content = [...body('keep'), ...body('drop')].join('\n')

test('asks the configured System One endpoint, stubs what it rejects', { options: { base_url: 'https://jev.example/', api_key: 'k1' } }, async ($, on) => {
  const seen: { url?: string; auth?: string } = {}
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })) // no ast-grep: heuristic path
  on('http.fetch', (_$, e) => {
    seen.url = e.url
    seen.auth = e.init?.headers?.authorization
    return { value: { status: 200, ok: true, headers: {}, text: '{"answers":{"s0":{"noul":0.9},"s1":{"noul":0.1}}}' } }
  })
  on('tool.call', { tool: 'Read' }, (_$, e) => ({
    result: { type: 'text', file: { filePath: e.file_path, content, numLines: 164, startLine: 1, totalLines: 164 } },
  }))

  const r = JSON.stringify(await $.tool.call({ tool: 'Read', file_path: '/x/demo.ts' }))
  expect(seen).toEqual({ url: 'https://jev.example/v1/systemone', auth: 'Bearer k1' })
  expect(r).toContain('step79()') // keep: full
  expect(r).toContain('⋯ stubbed L84-163 (Read offset=84 limit=80)') // drop: stubbed
})

test('endpoint down: full file', async ($, on) => {
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('http.fetch', () => { throw new Error('ECONNREFUSED') })
  on('tool.call', { tool: 'Read' }, (_$, e) => ({
    result: { type: 'text', file: { filePath: e.file_path, content, numLines: 164, startLine: 1, totalLines: 164 } },
  }))
  expect(JSON.stringify(await $.tool.call({ tool: 'Read', file_path: '/x/demo.ts' }))).not.toContain('stubbed')
})
