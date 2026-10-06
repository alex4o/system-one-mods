// System One wire format (TypeSafe /v1/systemone): Jev itself, or the open-source decider (Mapika/decider-*) served locally.
// One Noul per symbol, all in one request.
import type { Sym } from './stub'

const SNIPPET = 30 // lines of each symbol the model sees

export function s1Request(task: string, file: string, syms: Sym[], lines: string[]): string {
  const id = (i: number) => `s${i}`
  return JSON.stringify({
    state: {
      task: task || '(unknown)',
      file,
      symbols: Object.fromEntries(syms.map((s, i) => [id(i), lines.slice(s.start, Math.min(s.end + 1, s.start + SNIPPET)).join('\n')])),
    },
    questions: Object.fromEntries(syms.map((s, i) => [id(i), {
      type: 'noul',
      // wording measured on decider-4b: naming the code in the question beat referencing symbols.sN (0.70 vs 0.29 on the target)
      instructions: `Is the code \`${s.label}\` relevant to \`task\`?`,
    }])),
  })
}

/** p(yes) per symbol, in order; throws on a malformed answer (caller fails open). */
export function s1Probs(body: string, n: number): number[] {
  const { answers } = JSON.parse(body) as { answers: Record<string, { noul?: number }> }
  return Array.from({ length: n }, (_, i) => {
    const p = answers[`s${i}`]?.noul
    if (typeof p !== 'number') throw new Error(`systemone: no answer for s${i}`)
    return p
  })
}
