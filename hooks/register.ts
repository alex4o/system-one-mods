import type { EngineInterface, Register } from 'claude-code'
import { astGrepArgv, toSyms } from './astgrep'
import { s1Probs, s1Request } from './systemone'
import { MIN_SAVED, stub, symbols, type Sym } from './stub'

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|scala|swift|rb|php|cs|c|cc|cpp|h|hpp|lua|ex|exs|dart)$/
const MIN_LINES = 150 // smaller files: just read them

export const register: Register = (on, options) => {
  const url = `${String(options.base_url ?? 'http://127.0.0.1:8000').replace(/\/+$/, '')}/v1/systemone`
  const key = String(options.api_key ?? '')
  const keepAt = Number(options.keep_at ?? 0.5)
  // ponytail: Bearer auth assumed for Jev; adjust the header if TypeSafe wants another
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(key && { authorization: `Bearer ${key}` }) }

  let task = '' // last user prompt: what the model judges relevance against. ponytail: resets on reload

  on('prompt.submit', ($, e, next) => {
    task = e.text
    return next(e)
  })

  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const r = await next(e) // real read runs: Edit's read-state stays valid
    if (e.offset !== undefined || e.limit !== undefined || !SOURCE.test(e.file_path)) return r
    if (r.deny !== undefined || r.isError || r.result.type !== 'text') return r
    const { file } = r.result
    if (file.truncatedByTokenCap || file.totalLines < MIN_LINES) return r

    const lines = file.content.split('\n')
    const syms = (await astSymbols($, e.file_path)) ?? symbols(lines)
    if (!syms.length) return r

    const name = e.file_path.split('/').pop()
    let probs: number[]
    try {
      const res = await $.http.fetch(url, {
        method: 'POST',
        headers,
        body: s1Request(task, e.file_path, syms, lines),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      probs = s1Probs(res.text, syms.length)
    } catch (err) {
      $.ui.status(`read-stub: System One unreachable, full ${name}`)
      $.ui.log(`read-stub: System One failed (${String(err)}); returned full file`, { to: 'debug' })
      return r // fail open: full file
    }

    const drop = syms.filter((_, i) => (probs[i] ?? 1) < keepAt)
    $.ui.status(`read-stub: kept ${syms.length - drop.length}/${syms.length} in ${name}`)
    if (!drop.length) return r

    const content = stub(lines, drop)
    return {
      result: { ...r.result, file: { ...file, content, numLines: content.split('\n').length } },
      context: [
        `read-stub: the System One model judged ${drop.length} symbol(s) in ${e.file_path} irrelevant to the task and stubbed them. ` +
        `Line numbers shown are NOT file line numbers; each "⋯ stubbed Lx-y" marker gives the real range. ` +
        `Read with that offset/limit if you need a body. Do not Write this file whole from this view.`,
      ],
    }
  })
}

// ast-grep when installed and the language has rules; undefined -> indentation heuristic.
async function astSymbols($: EngineInterface, path: string): Promise<Sym[] | undefined> {
  const argv = astGrepArgv(path)
  if (!argv) return
  try {
    const r = await $.process.run(argv, { timeoutMs: 10_000 })
    return r.exitCode === 0 ? toSyms(r.stdout, MIN_SAVED) : undefined
  } catch {
    return undefined // not installed, timed out, bad JSON
  }
}
