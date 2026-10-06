// Indentation-based symbol finder: no parser, works across brace and indent languages.
// ponytail: heuristic, breaks on column-0 multiline strings; swap for LSP documentSymbol if that bites.
export type Sym = { label: string; start: number; end: number } // 0-based, inclusive

const CLOSER = /^\s*[}\])]/
const SKIP = /^\s*(\/\/|#(?!\[)|\/\*|\*|@|--|import\b|from\b|use\b|package\b|#include)/
const CONTAINER = /\b(class|impl|trait|interface|object|module|namespace)\b/
export const MIN_SAVED = 3 // stubbing fewer lines isn't worth a question

const indentOf = (l: string) => l.length - l.trimStart().length

function units(lines: string[], from: number, to: number, indent: number): Sym[] {
  const out: Sym[] = []
  let cur: Sym | undefined
  for (let i = from; i <= to; i++) {
    const l = lines[i] ?? ""
    if (!l.trim()) continue
    const ind = indentOf(l)
    if (ind > indent) { if (cur) cur.end = i; continue }
    if (ind < indent) continue
    if (CLOSER.test(l)) { if (cur) cur.end = i; continue }
    if (cur) out.push(cur)
    cur = SKIP.test(l) ? undefined : { label: l.trim().slice(0, 70), start: i, end: i }
  }
  if (cur) out.push(cur)
  return out
}

export function symbols(lines: string[], from = 0, to = lines.length - 1, indent = 0): Sym[] {
  return units(lines, from, to, indent).flatMap(u => {
    if (CONTAINER.test(lines[u.start] ?? "") && u.end > u.start) {
      const inner = lines.slice(u.start + 1, u.end + 1).find(l => l.trim() && indentOf(l) > indent)
      if (inner) return symbols(lines, u.start + 1, u.end, indentOf(inner))
    }
    return u.end - u.start >= MIN_SAVED ? [u] : []
  })
}

// Keep each stubbed symbol's first line (+ closing brace), replace the body with a marker.
export function stub(lines: string[], drop: Sym[]): string {
  const out = [...lines] as (string | null)[]
  for (const s of drop) {
    const last = CLOSER.test(lines[s.end] ?? "") ? s.end - 1 : s.end
    if (last <= s.start) continue
    const pad = ' '.repeat(indentOf(lines[s.start + 1] ?? '') || indentOf(lines[s.start] ?? "") + 2)
    out[s.start + 1] = `${pad}⋯ stubbed L${s.start + 2}-${last + 1} (Read offset=${s.start + 2} limit=${last - s.start})`
    for (let i = s.start + 2; i <= last; i++) out[i] = null
  }
  return out.filter(l => l !== null).join('\n')
}
