// Symbol ranges from ast-grep (tree-sitter, native). WASM is barred in the hook sandbox, so it runs as a process.
import type { Sym } from './stub'

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

/** argv for `ast-grep scan` on `path`, or undefined when the language has no rules (caller falls back). */
export function astGrepArgv(path: string): string[] | undefined {
  const language = EXT[path.split('.').pop() ?? '']
  const rules = language && RULES[language]
  if (!rules) return
  const rule = JSON.stringify({ id: 'sym', language, severity: 'info', rule: { any: rules } }) // JSON is YAML
  return ['ast-grep', 'scan', '--inline-rules', rule, '--json=compact', path]
}

type Match = { lines: string; range: { start: { line: number }; end: { line: number } } }

/** Matches → askable symbols: sorted, nested ones dropped (the outer decision covers them), tiny ones dropped. */
export function toSyms(stdout: string, minSaved: number): Sym[] {
  const all = (JSON.parse(stdout) as Match[])
    .map(m => ({ label: (m.lines.split('\n')[0] ?? '').trim().slice(0, 70), start: m.range.start.line, end: m.range.end.line }))
    .sort((a, b) => a.start - b.start || b.end - a.end)
  const out: Sym[] = []
  for (const s of all) {
    const last = out[out.length - 1]
    if (last && s.start >= last.start && s.end <= last.end) continue
    out.push(s)
  }
  return out.filter(s => s.end - s.start >= minSaved)
}
