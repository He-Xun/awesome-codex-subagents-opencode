# awesome-codex-subagents → OpenCode

**English** | [简体中文](./README.zh-CN.md)

> **174 expert agents, installed into OpenCode with one command.**

![The OpenCode @ menu showing reviewer, debugger and other agents with their permissions](./docs/menu-preview.svg)

OpenCode ships with only two built-in subagents: `general` and `explore`. When you need a
thorough PR-level code review, a threat model that holds up, or a cross-file refactoring
plan, you are left improvising inside the main agent — burning context and producing
inconsistent results.

This repository turns that into something you can just install:

```bash
npx awesome-codex-subagents-opencode --global
```

Restart OpenCode, type `@reviewer`, and a read-only reviewer works through the entire diff
in its own session and brings back only the conclusions. It won't fill your context, and it
can't touch your files. No clone, no dependencies to install first.

## What it solves

| Pain point | What this repo does |
| --- | --- |
| Long tasks flood the main context | Every agent runs in an isolated child session and returns only its findings |
| Review work tends to edit code | 99 read-only agents are hard-limited by `permission` — they cannot write files at all |
| Switching models means editing configs | **Not one model is hard-coded**; subagents inherit whatever model you are using |
| The `@` menu is unreadable in your language | Descriptions are localized automatically, and you can switch languages at any time |
| You don't know which agent to pick | Grouped by domain, from `debugger` to `hipaa-compliance` |

## Coverage

174 agents across 13 domains:

| Domain | Representative agents |
| --- | --- |
| Core development | `backend-developer` `frontend-developer` `code-mapper` |
| Languages & frameworks | `python-pro` `typescript-pro` `golang-pro` `rust-engineer` … 31 total |
| Infrastructure | `kubernetes-specialist` `terraform-engineer` `docker-expert` |
| Quality & security | `reviewer` `security-auditor` `debugger` `test-automator` |
| Data & AI | `data-engineer` `ml-engineer` `eval-engineer` |
| LLM engineering | `llm-architect` `prompt-engineer` `mcp-developer` |
| Design & product | `ui-designer` `product-manager` `ux-researcher` |
| Specialized | `fintech-engineer` `payment-integration` `blockchain-developer` |
| Compliance & legal | `hipaa-compliance` `gdpr-ccpa-compliance` `license-engineer` |

See [`agents/`](./agents) for the full list.

---

## Quick start

The fastest way needs no checkout:

```bash
npx awesome-codex-subagents-opencode --global
```

That installs all 174 agents into `~/.config/opencode/agents`. Restart OpenCode, then invoke
them with `@agent-name`.

> The package name is the command. Shortcuts such as `npx ocagents` do **not** work — npm
> would look for a package with that name and fail. Always use the full package name above.

Prefer a focused subset? 174 agents make the `@` menu long and dilute automated selection:

```bash
npx awesome-codex-subagents-opencode --global --preset minimal
```

### Or from the repository

Useful if you want to read the source or customise it. Every command below assumes you are
**inside the cloned repository**:

```bash
git clone https://github.com/He-Xun/awesome-codex-subagents-opencode.git
cd awesome-codex-subagents-opencode

node install.mjs            # -> ./.opencode/agents in the project you run it from
node install.mjs --global   # -> ~/.config/opencode/agents (all projects)
```

Zero dependencies, Node 18+.

> The scripts resolve their own paths, so `node /path/to/repo/install.mjs --global` also works
> from any directory without `cd`.

### Options

```
-g, --global          install into ~/.config/opencode/agents
    --dir <path>      install into a specific directory
    --lang <code>     description language (default: from system locale)
    --preset <name>   install a curated subset (minimal, web, backend)
    --only <a,b>      install only the named agents
    --skip <a,b>      exclude the named agents
    --list-presets    show available presets
    --dry             show what would happen, write nothing
-h, --help            show help
```

Both `--flag value` and `--flag=value` work.

### Using npm scripts (from the repository)

```bash
npm run install:global      # install globally
npm run install:local       # install into the current project
npm run verify              # validate all generated artifacts
npm run switch -- --to=en   # switch description language
npm run presets             # list available presets
```

### Presets

| Preset | Count | Contents |
| --- | --- | --- |
| `minimal` | 10 | review, debug, edit, test — a sensible default |
| `web` | 15 | frontend, UI, accessibility |
| `backend` | 17 | server, database, infrastructure |
| `data-ai` | 11 | ETL, analysis, modelling, MLOps, experiment design |
| `llm-ai` | 11 | prompts, evals, observability, agent orchestration |
| `security` | 10 | security audit, compliance, licensing, QA |
| `devops` | 10 | CI/CD, Kubernetes, IaC, incident response |
| `mobile` | 7 | iOS, Android, Flutter, React Native |
| `docs` | 6 | technical writing, API docs, README, prose quality |
| `product` | 8 | requirements, backlog, planning, market analysis |

Presets are plain text lists under `presets/` — edit them or add your own. A name in a
preset that no longer exists fails `npm run verify`.

## Three design decisions

These are what separate this repo from simply copying the files over:

**1. No hard-coded models.** Every upstream agent pins `gpt-6.1-sol`, a model that almost
certainly does not exist on your provider — binding to it would make all 174 agents unusable.
This repo emits **no `model` field at all**, so subagents inherit the caller's model. Change
provider or model without regenerating anything.

**2. Vendor-neutral MCP.** Upstream, one agent is tied to OpenAI's own documentation service.
Here it uses the generic `websearch` + `webfetch` tools, so documentation from any vendor is
reachable.

**3. Only descriptions are translated, never the prompt body.** See
[why](#why-only-descriptions-are-translated) — Chinese actually costs *more* tokens than
English, so translating the full prompts would be a pessimization.

---

## Provenance

This is an OpenCode port of [VoltAgent/awesome-codex-subagents](https://github.com/VoltAgent/awesome-codex-subagents)
(6.4k stars). Upstream ships Codex-format `.toml` definitions; this project converts them to
OpenCode's Markdown agent format and resolves the three porting problems above.

**Format adaptation only — prompt semantics are untouched**: bodies are copied verbatim so
they can be regenerated cleanly when upstream changes.

To regenerate after an upstream update:

```bash
cd awesome-codex-subagents-opencode      # repository root
git clone --depth 1 https://github.com/VoltAgent/awesome-codex-subagents.git ../src
node tools/codex-subagents-to-opencode.mjs ../src/categories agents
```

---

## Description language: detected automatically, switchable at any time

**Prompt bodies are always English.** Only the `description` — the line shown in the `@` menu —
follows the language setting.

### Detected at install time

`tools/install.mjs` resolves the language in this order, **falling back to English when no
translation table matches**:

1. `--lang=xx` or the `OPENCODE_SUBAGENTS_LANG` environment variable
2. `LC_ALL` / `LC_MESSAGES` / `LANG` / `LANGUAGE`
3. The locale reported by `Intl`
4. Fallback → English

Available out of the box: **English (en) · 简体中文 (zh) · 日本語 (ja) · Português (pt) · Español (es) · Русский (ru) · 한국어 (ko)**.

`--lang` takes a **language code** — the short ISO 639-1 tag (`zh`, `ja`, `pt`, `es`, `ru`, `ko`, `en`).
That is also the name of the translation table in `tools/i18n/`, so the two never drift apart.
Full system locales (`zh-CN`, `es_ES`, `pt_BR`) are only ever *input* to detection, never a
value you pass to `--lang`.

> When `LANG` or `LC_ALL` is set but has no table, the result is English — not a second-guessed
> locale derived from `Intl`. An explicit environment hint is treated as intent.

```bash
node install.mjs                          # follows your system locale
node install.mjs --lang=en                # force English
node install.mjs --lang=zh                # force Chinese
node install.mjs --only=reviewer,debugger # install a subset
```

How a system locale maps to a language code — the regional part is dropped, then matched
against the available tables:

| System locale | Resolves to | Why |
| --- | --- | --- |
| `zh-CN`, `zh-TW` | `zh` | base `zh` has a table |
| `ja-JP` | `ja` | base `ja` has a table |
| `pt-BR`, `pt-PT` | `pt` | base `pt` has a table |
| `es_ES`, `es-MX` | `es` | base `es` has a table |
| `ru_RU` | `ru` | base `ru` has a table |
| `ko_KR` | `ko` | base `ko` has a table |
| `en_US` | `en` | base `en` has a table |
| `de_DE` | `en` | no `de` table → fall back to English |

### Switching later

`--dir` defaults to `./.opencode/agents`:

```bash
cd awesome-codex-subagents-opencode      # repository root
node tools/switch-lang.mjs --list                                   # available languages
node tools/switch-lang.mjs --to=zh                                  # switch to Chinese
node tools/switch-lang.mjs --to=en                                  # switch back
node tools/switch-lang.mjs --to=zh --dir=~/.config/opencode/agents  # explicit directory
node tools/switch-lang.mjs --to=zh --dry                            # preview
```

The switcher **rewrites only the frontmatter `description` line**. Bodies and permissions are
untouched, and the original quoting style is preserved — so switching en → zh → en produces
no spurious diff (verified: 174 files, zero differences).

### Adding a language

Create `tools/i18n/<lang>.json`, where `<lang>` is the ISO 639-1 code — the same value you
would pass to `--lang` (e.g. `fr.json` for French, `de.json` for German). Keyed by agent name:

```json
{
  "reviewer": "需要 PR 式评审，聚焦正确性、安全性、行为回归与测试缺失时使用。",
  "debugger": "需要做深度缺陷定位时使用。"
}
```

No code changes needed — `install.mjs` and `switch-lang.mjs` pick it up automatically, and it
becomes selectable with `--lang=fr`. Agents missing an entry keep their English description.
Use the base code only, not a regional variant: the file must be `fr.json`, not `fr-FR.json`,
because detection strips the region before matching.

Translation conventions used by the bundled tables (keep them if you contribute one):

| Language | Form | Pattern |
| --- | --- | --- |
| `ja` | polite `です・ます`, never plain `だ・である` | `…ときに使用します。` |
| `pt` | neutral professional, `você` only — never `tu` or slang | `Use quando …` |
| `es` | formal `usted` only — never `tú`/`vosotros` | `Úselo cuando …` |
| `ru` | formal `вы` — never `ты` | `Используйте, когда …` |
| `ko` | formal `-십시오` / `-합니다`, never `반말` | `…할 때 사용하십시오.` |

`validate.mjs` enforces these registers, so a contribution that slips into informal
speech fails CI rather than shipping.

---

## Why only descriptions are translated

Measured on the same content, English versus Chinese:

| Tokenizer | English | Chinese | Difference |
| --- | --- | --- | --- |
| GPT-4o (o200k) | 1196 | 1479 | +23.7% |
| DeepSeek-V2 | 1324 | 1427 | +7.8% |
| GLM-4 | 1202 | 1307 | +8.7% |
| Qwen 2.5 | 1203 | 1351 | +12.3% |

Source: [Chinese vs. English Tokens](https://markhuang.ai/blog/chinese-token-myth).

Chinese-origin tokenizers handle Chinese far better (from +24% down to +8%), but **the
direction never reverses: Chinese costs more tokens**. English words collapse into single
tokens; Chinese characters generally cost one token each, sometimes more.

Scaled to this repo: Chinese descriptions use 66% fewer characters but **about 50% more
tokens**. Translating the prompt bodies would add roughly another 8% on top of 327k
characters.

So: **the value of localization is readability and selection accuracy, not saving tokens.**
To save tokens, install fewer agents — don't switch language.

---

## Design details

### 1. No hard-coded models

Upstream's `model = "gpt-6.1-sol"` is a Codex-specific model that most OpenCode providers
don't expose. The converter **emits no `model` field**, letting the subagent inherit the
calling agent's model — documented OpenCode behavior, and provider-agnostic.

To pin a model for specific agents:

```bash
cd awesome-codex-subagents-opencode      # repository root
node tools/codex-subagents-to-opencode.mjs <src> agents \
  --model-map=gpt-6.1-sol=anthropic/claude-sonnet-5,gpt-6-luna=anthropic/claude-haiku-5
```

### 2. Vendor-neutral MCP

Codex allows an inline `[mcp_servers.NAME]` table in an agent file; OpenCode requires MCP
servers in `opencode.json` instead. The two upstream dependencies:

| Upstream MCP | Handling | Reason |
| --- | --- | --- |
| `openaiDeveloperDocs` (docs-researcher) | Replaced with `websearch` + `webfetch` | Needs no API key, but only indexes OpenAI's own docs, which defeats the purpose of a general port |
| `chrome_devtools` (browser-debugger) | Dependency kept | Open source, and there is no general substitute |

Rules live in the `MCP_REPLACEMENTS` constant and are easy to extend.

### 3. Permission mapping

Codex's `sandbox_mode` is sandbox-level enforcement; OpenCode's `permission` is allow/ask/deny:

| Codex | OpenCode |
| --- | --- |
| `read-only` | `edit: deny`, `bash: deny` |
| `workspace-write` | `edit: allow`, `bash: allow` |

99 of the 174 agents are read-only, 75 can write.

**Exception**: three read-only agents cannot do their job without running commands —
`debugger` needs stack traces and failing tests, `performance-engineer` needs measurements,
`security-auditor` needs reproduction. They get `bash: ask` (every command still requires
your approval), which keeps the read-only guarantee while making them usable. The list is
the `READ_ONLY_NEEDS_SHELL` constant.

---

## Field mapping

| Codex (`.toml`) | OpenCode (`.md`) |
| --- | --- |
| `name` | File name `xxx.md` (also the agent id) |
| `description` | Frontmatter `description` |
| `model` | **Not emitted**, inherits the parent agent (override with `--model-map`) |
| `model_reasoning_effort` | Frontmatter `reasoningEffort` |
| `developer_instructions` | Body (prompt, copied verbatim) |
| `sandbox_mode` | Frontmatter `permission` |
| `[mcp_servers.*]` | Not written to the file; listed in the conversion report |
| Category directory | Frontmatter `color` (visual differentiation only) |

`Codex` in prompt bodies is replaced with `the parent agent` so prompts don't point at
another product.

---

## CLI reference

| Flag | Description |
| --- | --- |
| `--only=reviewer,debugger` | Convert only the named agents |
| `--category=04,05` | Filter by category directory prefix |
| `--skip=a,b` | Additional agents to skip |
| `--all` | Include Codex-specific agents too |
| `--dry` | Print the report without writing files |
| `--model-map=k=v,...` | Override model mapping |
| `--lang=zh` | Localize `description` (auto-detected by default, see above) |
| `--keep-reasoning` | Keep the `reasoningEffort` field |

`agent-installer` and `workflow-orchestrator` are skipped by default: their prompts describe
copying files into `~/.codex/agents/`, which is meaningless after the port.

---

## Notes for non-GPT and open models

- **`reasoningEffort` is GPT-specific.** It only means something to OpenAI-style endpoints;
  Claude, Llama, Mistral, Gemma, GLM, DeepSeek, Qwen and most open-weight models ignore it.
  It is **no longer emitted by default**; restore it with `--keep-reasoning` if your provider
  understands it.
- To pin a model for specific agents, use `--model-map`. The value is always
  `provider/model-id`, with the provider prefix coming from your own `opencode.json`:
  `--model-map=gpt-6.1-sol=<provider>/<model-id>`.

---

## Known limitations

1. **Automatic triggering is weak (platform behavior).** OpenCode appends the subagent list
   to the task tool's description as `id: description` lines, leaving the model to decide on
   text alone. The built-in `explore` agent has concrete examples in its description and
   therefore wins more often. 174 candidates dilute the signal — this is OpenCode's behavior,
   not a conversion problem. Either install a smaller subset, or invoke agents explicitly
   with `@agent-name`.

2. **Resident context cost.** Installing everything adds roughly 7.5k tokens to the task tool
   description.

3. **Homogeneous prompts.** The 174 upstream prompts share one template
   (`Working mode / Focus on / Quality checks / Return`), and 129 of 174 fall between 1–2k
   characters. Differences are mostly domain vocabulary. Don't expect fine-grained
   separation between them.

4. **`browser-debugger` needs the chrome-devtools MCP** (default `localhost:3000/mcp`).
   Without it the agent still loads, but lacks tools.

---

## Repository layout

```
.
├── bin/{cli,lang}.mjs                    # npm entry points (ocagents / ocagents-lang)
├── tools/
│   ├── install.mjs                       # install (locale + presets)
│   ├── switch-lang.mjs                   # switch description language on demand
│   ├── detect-lang.mjs                   # locale detection with English fallback
│   ├── validate.mjs                      # validate artifacts, tables, presets (CI)
│   ├── i18n/{en,zh}.json                 # description tables; add a file to add a language
│   ├── codex-subagents-to-opencode.mjs   # regenerate agents/ from upstream TOML
│   ├── analyze-subagents.mjs             # artifact analysis
│   ├── compare-lang.mjs                  # English vs. Chinese token cost
│   └── verify-load.mjs                   # check that OpenCode loads the agents
├── presets/{minimal,web,backend}.txt     # which agents to install
├── agents/                                # 174 OpenCode agents (English baseline)
├── .github/workflows/validate.yml         # CI
├── package.json
├── README.md                              # this file (English)├── README.zh-CN.md                        # 简体中文
└── LICENSE
```

`agents/` is the English baseline and can be copied into any OpenCode project directly.
To change description language, use `switch-lang.mjs` rather than editing files by hand.

## Validation

```bash
npm run verify
```

Checks frontmatter validity, `mode: subagent`, absence of hard-coded models, valid permission
keys, intact prompts with no leftover `Codex` wording, one-to-one coverage between translation
tables and agents, and that every preset references existing agents.

CI runs on Node 18 / 20 / 22 and additionally verifies that regenerating from upstream
reproduces the committed tree exactly, so artifacts cannot drift silently.

---

## License

The conversion scripts and README are released under MIT.
The contents of `agents/` are derived from [VoltAgent/awesome-codex-subagents](https://github.com/VoltAgent/awesome-codex-subagents),
also MIT-licensed; copyright belongs to its original authors and contributors.
