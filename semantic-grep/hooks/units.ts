// Search units (functions/methods/top-level consts via ast-grep, or whole files) and the per-file groups
// they are asked in: one System One request per group, the file's numbered source as state, one Noul per unit.
export type Unit = { kind: 'func' | 'file'; file: string; line: number; end: number; label: string } // 1-based, inclusive
export type Group = { file: string; code: string; units: Unit[] }

const MAX_LINE = 200 // chars; long data lines would blow the row limit (HTTP 413)
const MAX_STATE = 24_000 // chars of source per request (~6-8k tokens); bigger files split into windows
const MAX_UNIT = 6_000 // chars of one unit's body inside a window

type Rule = { kind: string; any?: object[] }
const at = (...roots: string[]): { any: object[] } => ({ any: roots.map(r => ({ inside: { kind: r } })) })
const jsTop = at('program').any.concat({ inside: { kind: 'export_statement', inside: { kind: 'program' } } })
const js = (field: string): Rule[] => [
  { kind: 'function_declaration' }, { kind: 'generator_function_declaration' },
  { kind: 'method_definition' }, { kind: field },
  { kind: 'lexical_declaration', any: jsTop }, { kind: 'variable_declaration', any: jsTop },
]
const RULES: Record<string, Rule[]> = {
  TypeScript: js('public_field_definition'),
  Tsx: js('public_field_definition'),
  JavaScript: js('field_definition'),
  Python: [{ kind: 'function_definition' }, { kind: 'expression_statement', ...at('module') }],
  Go: [
    { kind: 'function_declaration' }, { kind: 'method_declaration' },
    { kind: 'const_declaration', ...at('source_file') }, { kind: 'var_declaration', ...at('source_file') },
  ],
  Rust: [{ kind: 'function_item' }, { kind: 'const_item' }, { kind: 'static_item' }],
}
const EXT: Record<string, string> = {
  ts: 'TypeScript', mts: 'TypeScript', cts: 'TypeScript', tsx: 'Tsx',
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', go: 'Go', rs: 'Rust',
}

/** argv for `ast-grep scan` on one file, or undefined when its language has no rules (caller uses the whole file). */
export function astGrepArgv(path: string): string[] | undefined {
  const language = EXT[path.split('.').pop() ?? '']
  const rules = language && RULES[language]
  if (!rules) return
  const rule = JSON.stringify({ id: 'unit', language, severity: 'info', rule: { any: rules } })
  return ['ast-grep', 'scan', '--inline-rules', rule, '--json=compact', path]
}

type Match = { lines: string; range: { start: { line: number }; end: { line: number } } }

export function funcUnits(file: string, stdout: string): Unit[] {
  return (JSON.parse(stdout) as Match[])
    .map((m): Unit => ({
      kind: 'func', file, line: m.range.start.line + 1, end: m.range.end.line + 1,
      label: (m.lines.split('\n')[0] ?? '').trim().slice(0, 80),
    }))
    .sort((a, b) => a.line - b.line || b.end - a.end)
}

const numbered = (text: string): string[] =>
  text.split('\n').map((l, i) => `${i + 1}: ${l.length > MAX_LINE ? `${l.slice(0, MAX_LINE)}…` : l}`)

/** The whole file as one unit: its numbered head (MAX_STATE) is the state. */
export function fileGroup(file: string, text: string): Group {
  const lines = numbered(text)
  return { file, code: lines.join('\n').slice(0, MAX_STATE), units: [{ kind: 'file', file, line: 1, end: lines.length, label: file }] }
}

/** A file's units in as few requests as fit: the whole file when it fits, else windows of whole unit bodies. */
export function funcGroups(file: string, text: string, units: Unit[]): Group[] {
  const lines = numbered(text)
  const whole = lines.join('\n')
  if (whole.length <= MAX_STATE) return [{ file, code: whole, units }]
  const out: Group[] = []
  let cur: Group | undefined
  let shownTo = 0 // last line already in cur.code: a nested unit's body is there already
  for (const u of units) {
    const body = lines.slice(u.line - 1, u.end).join('\n').slice(0, MAX_UNIT)
    if (!cur || (u.end > shownTo && cur.code.length + body.length > MAX_STATE)) {
      out.push(cur = { file, code: '', units: [] })
      shownTo = 0
    }
    if (u.end > shownTo) { cur.code += `${body}\n`; shownTo = u.end }
    cur.units.push(u)
  }
  return out
}
