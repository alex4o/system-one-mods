import type { EngineInterface, Register } from 'claude-code'
import { chunk, pool, s1Probs, s1Request } from './systemone'
import { astGrepArgv, fileGroup, funcGroups, funcUnits, type Group, type Unit } from './units'

const TOOL = 'mcp__semantic-grep__search'
const MAX_FILES = 3000 // ponytail: hard caps instead of streaming; raise with a faster backend
const MAX_UNITS = 20000

export const register: Register = (on, options) => {
  const url = `${String(options.base_url ?? 'http://127.0.0.1:8000').replace(/\/+$/, '')}/v1/systemone`
  const key = String(options.api_key ?? '')
  const batch = Math.max(1, Number(options.batch ?? 64))
  const parallel = Math.max(1, Number(options.parallel ?? 4))
  // ponytail: Bearer auth assumed for Jev; adjust if TypeSafe wants another header
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(key && { authorization: `Bearer ${key}` }) }

  on('session.start', ($, e, next) => $.tool.register({
    name: 'search',
    description:
      'Semantic grep: finds WHERE code does something, by meaning, not text. For every file under a glob, a System One ' +
      'model reads the file and decides, in parallel, which of its functions/methods/top-level consts (by="func") do what ' +
      'the query describes, or whether the file does (by="file"). Returns them ranked with file:line. Use for ' +
      '"where do we X?" questions; use Grep for exact strings. Slow on big trees: narrow with glob/path.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What the code does, e.g. "apply temperature to the option logits"' },
        glob: { type: 'string', description: 'ripgrep glob of files to search, e.g. "**/*.py" (default: all files, .gitignore respected)' },
        path: { type: 'string', description: 'Directory to search (default: session cwd)' },
        by: { type: 'string', enum: ['func', 'file'], description: 'Unit to score (default func)' },
        top: { type: 'number', description: 'Max results (default 15)' },
      },
      required: ['query'],
    },
  }).then(() => next(e)))

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const query = typeof e.query === 'string' ? e.query.trim() : '' // model input: still check at runtime
    if (!query) return { deny: 'search: `query` is required' }
    const glob = typeof e.glob === 'string' && e.glob ? e.glob : undefined
    const by = e.by === 'file' ? 'file' : 'func'
    const top = Math.max(1, Math.min(100, Number(e.top ?? 15)))
    const root = typeof e.path === 'string' && e.path ? e.path : await $.session.cwd()

    const t0 = Date.now()
    const ls = await $.process.run(['rg', '--files', '--max-filesize', '1M', ...(glob ? ['-g', glob] : []), '.'], { cwd: root, timeoutMs: 30_000 })
    if (ls.exitCode > 1) return { deny: `search: rg failed: ${ls.stderr.slice(0, 300)}` }
    const files = ls.stdout.split('\n').filter(Boolean).map(f => f.replace(/^\.\//, ''))
    if (!files.length) return { result: `No files match ${glob ?? '*'} under ${root}.` }
    const capped = files.length > MAX_FILES

    // one request per (group, ≤batch questions): shared state, parallel decisions
    let budget = MAX_UNITS
    const requests = (await collect($, root, files.slice(0, MAX_FILES), by))
      .flatMap(g => chunk(g.units, batch).map(units => ({ ...g, units })))
      .filter(g => (budget -= g.units.length) >= 0)
    const total = requests.reduce((n, g) => n + g.units.length, 0)

    $.ui.status(`semantic-grep: ${total} decisions over ${requests.length} requests…`)
    const scored: { p: number; u: Unit }[] = []
    let failed = 0
    const score = async (g: Group): Promise<void> => {
      try {
        const res = await $.http.fetch(url, { method: 'POST', headers, body: s1Request(query, g) })
        if (res.status === 413 && g.units.length > 1) { // too many rows: halve the questions, same state
          const mid = g.units.length >> 1
          return void (await Promise.all([score({ ...g, units: g.units.slice(0, mid) }), score({ ...g, units: g.units.slice(mid) })]))
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        s1Probs(res.text, g.units.length).forEach((p, i) => scored.push({ p, u: g.units[i] as Unit }))
      } catch (err) {
        failed += g.units.length
        $.ui.log(`semantic-grep: ${g.file} (${g.units.length} decisions) failed: ${String(err)}`, { to: 'debug' })
      }
    }
    await pool(requests, parallel, score)
    $.ui.status(undefined)
    if (!scored.length) return { deny: `search: System One endpoint ${url} failed for every request (is it running?)` }

    const hits = scored.sort((x, y) => y.p - x.p).slice(0, top)
    const secs = ((Date.now() - t0) / 1000).toFixed(1)
    return {
      result: [
        `${hits.length} best of ${scored.length} decisions over ${files.length} files (${secs}s)` +
          (capped ? `; only the first ${MAX_FILES} files searched, narrow glob/path` : '') +
          (budget < 0 ? `; capped at ${MAX_UNITS} units` : '') +
          (failed ? `; ${failed} unscored (endpoint errors)` : '') + ':',
        ...hits.map(h => `${h.p.toFixed(2)}  ${h.u.file}:${h.u.line}  ${h.u.kind === 'func' ? h.u.label : ''}`.trimEnd()),
        'p = probability the unit does what the query asks; below ~0.5 is weak.',
      ].join('\n'),
    }
  })
}

// Read each file once; ast-grep splits it into functions, else the whole file is one unit.
async function collect($: EngineInterface, root: string, files: string[], by: 'func' | 'file'): Promise<Group[]> {
  const out: Group[][] = []
  await pool(files.map((f, i) => [f, i] as const), 8, async ([f, i]) => {
    let text: string
    try {
      text = await $.fs.read(`${root}/${f}`)
    } catch {
      return // unreadable / binary: skip
    }
    const argv = by === 'func' ? astGrepArgv(f) : undefined
    if (argv) {
      try {
        const r = await $.process.run(argv, { cwd: root, timeoutMs: 15_000 })
        const units = r.exitCode === 0 && !r.isStdoutTruncated ? funcUnits(f, r.stdout) : []
        if (units.length) { out[i] = funcGroups(f, text, units); return }
      } catch { /* ast-grep missing or failed: whole file below */ }
    }
    out[i] = [fileGroup(f, text)]
  })
  return out.flat()
}
