# read-stub

A Claude Code plugin. When Claude reads a whole source file of 150 lines or more, a System One model decides which functions, methods and constants are relevant to your current task. Each irrelevant body is replaced with a one-line stub, so Claude doesn't spend context on the whole file:

```ts
export function render(input: string): string {
  ⋯ stubbed L101-141 (Read offset=101 limit=41)
}
```

Claude can read a stubbed body later with that offset/limit. A Read with an offset or limit is never stubbed.

## How it works

1. A `prompt.submit` hook remembers your last message as the task.
2. A `tool.call` hook on Read lets the real read run first, so Edit's "file must be read first" check still passes. Then it finds the symbols:
   - with [ast-grep](https://ast-grep.github.io) (native tree-sitter) for TS/TSX/JS, Python, Go and Rust;
   - with an indentation heuristic for other languages, or when ast-grep is missing.
3. One `POST /v1/systemone` request asks one Noul (yes/no) question per symbol: "Is the code `…` relevant to `task`?"
4. Symbols with p(yes) ≥ `keep_at` stay in full. The rest become stubs, and Claude gets a note that the line numbers shown are shifted.
5. If the endpoint is down or answers badly, Claude gets the full file.

## Backends

Any server that speaks TypeSafe's System One wire format:

- **[decider](https://github.com/Mapika/decider)**, the open-source alternative, served locally:
  `DECIDER_MODEL=Mapika/decider-4b uvicorn decider.serve:app --port 8000` (runs on CUDA or Apple MPS).
- **Jev** (TypeSafe AI): set `base_url` to the API base and `api_key` to your key.

## Options

Set them in `/config`, or in `settings.json` under `pluginConfigs["read-stub"].options`.

| option | default | meaning |
|---|---|---|
| `base_url` | `http://127.0.0.1:8000` | server for `POST /v1/systemone` |
| `api_key` | empty | sent as `Authorization: Bearer <key>` when set; stored as a secret |
| `keep_at` | `0.5` | p(relevant) at or above this keeps the full body |

## Install / develop

```sh
claude --plugin-dir /path/to/read-stub
claude plugin validate /path/to/read-stub
claude plugin test /path/to/read-stub
```

## Limits

- The question wording was tuned on decider-4b over a small sample (the target symbol scored 0.70–0.98, the others ≤ 0.21 on 3 tasks). Re-check it if you use Jev.
- The task is your latest message, so "continue" or "yes" gives the model nothing to judge against.
- Write is not guarded: Claude is told not to Write a stubbed file whole, but nothing enforces it.
- The indentation fallback is a heuristic and can be confused by multi-line strings that start at column 0.
