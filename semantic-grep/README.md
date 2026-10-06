# semantic-grep

A Claude Code plugin that adds a `search` tool (`mcp__semantic-grep__search`). It answers "where do we do X?" by meaning, without embeddings or an index: a System One model reads the code each time you search.

```
search(query: "capture CUDA graphs at server start-up", glob: "*.py")

0.97  serve_v1.py:130   async def _start():
0.92  serve.py:398      async def _start():
0.87  engine_v2.py:191  def warmup(self, shapes=None, log=None):
```

## How it works

1. `rg --files -g <glob>` lists the files (`.gitignore` respected, files over 1 MB skipped).
2. [ast-grep](https://ast-grep.github.io) splits each file into functions, methods and top-level consts (TS/TSX/JS, Python, Go, Rust). Other languages become one unit per file.
3. **One request per file.** The file's numbered source is the shared state, with one Noul (yes/no) decision per function: "Does the code `…` (line N of `file`) do this: <query>?" The model makes all of a file's decisions in parallel over the same state. Files over 24k characters are split into windows of whole function bodies.
4. Requests for different files run in parallel. Results come back as one ranked list, `p  file:line  signature`.

`by: "file"` asks one question per file instead.

## Trade-off

There's no index to build, embed or keep in sync, so results are always fresh and judged against your exact question. The cost is that every search reads everything again. On a local decider-4b (Apple MPS), 639 functions take a few minutes, so narrow `glob`/`path` on big trees. A fast backend (Jev) with higher `batch`/`parallel` is the intended setup.

## Options

| option | default | meaning |
|---|---|---|
| `base_url` | `http://127.0.0.1:8000` | server for `POST /v1/systemone` (local decider, or Jev) |
| `api_key` | empty | sent as `Authorization: Bearer <key>` when set; stored as a secret |
| `batch` | `64` | max decisions per request; a file with more is split (same state) |
| `parallel` | `4` | requests in flight |

Limits: at most 3,000 files and 20,000 units per search; the result says when a cap applied. An HTTP 413 halves the questions and retries.
