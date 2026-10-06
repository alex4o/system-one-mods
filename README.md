# system-one-mods

Claude Code plugins built on a **System One** decision model: TypeSafe AI's Jev, or the open-source [decider](https://github.com/Mapika/decider) served locally. Both speak the same `POST /v1/systemone` wire format, so you switch between them with the `base_url` setting.

| plugin | what it does |
|---|---|
| [read-stub](read-stub/) | When Claude reads a big source file whole, functions irrelevant to your task come back as one-line stubs |
| [semantic-grep](semantic-grep/) | A `search` tool: "where do we do X?" by meaning, as parallel per-file decisions, with no embeddings or index |

## Install

```sh
/plugin marketplace add alex4o/system-one-mods
/plugin install read-stub@system-one-mods
/plugin install semantic-grep@system-one-mods
```

Or for development: `claude --plugin-dir ./read-stub --plugin-dir ./semantic-grep`.

## Backend

Local decider (CUDA or Apple MPS):

```sh
DECIDER_MODEL=Mapika/decider-4b uvicorn decider.serve:app --host 127.0.0.1 --port 8000
```

For Jev, set each plugin's `base_url` and `api_key` in `/config`.

Both plugins use [ast-grep](https://ast-grep.github.io) when it is installed (`brew install ast-grep`). semantic-grep needs `rg`.
