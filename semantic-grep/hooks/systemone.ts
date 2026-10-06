// System One wire format (TypeSafe /v1/systemone): Jev, or the open-source decider served locally.
// One request per group: shared state (the file's source), parallel Noul decisions (one per unit).
import type { Group, Unit } from './units'

export function s1Request(query: string, g: Group): string {
  return JSON.stringify({
    state: { query, file: g.file, code: g.code },
    questions: Object.fromEntries(g.units.map((u, i) => [`c${i}`, { type: 'noul', instructions: question(query, u) }])),
  })
}

// wording measured on decider-4b: naming the code in the question beats an opaque reference
const question = (query: string, u: Unit): string => u.kind === 'file'
  ? `Does \`file\` contain code that does this: ${query}?`
  : `Does the code \`${u.label}\` (line ${u.line} of \`file\`) do this: ${query}?`

/** p(yes) per unit, in order; throws on a malformed answer. */
export function s1Probs(body: string, n: number): number[] {
  const { answers } = JSON.parse(body) as { answers: Record<string, { noul?: number }> }
  return Array.from({ length: n }, (_, i) => {
    const p = answers[`c${i}`]?.noul
    if (typeof p !== 'number') throw new Error(`systemone: no answer for c${i}`)
    return p
  })
}

/** Runs fn over items with at most `par` in flight. */
export async function pool<T>(items: readonly T[], par: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(Array.from({ length: Math.max(1, par) }, async () => {
    while (next < items.length) await fn(items[next++] as T)
  }))
}

export const chunk = <T>(xs: readonly T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))
