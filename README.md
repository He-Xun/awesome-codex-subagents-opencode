# awesome-codex-subagents → OpenCode

把 [VoltAgent/awesome-codex-subagents](https://github.com/VoltAgent/awesome-codex-subagents)
的 176 个 Codex subagent 定义，转换成可直接用于
[OpenCode](https://opencode.ai) 的 Markdown agent 文件。

**只做格式适配，不做语义改写**：prompt 原文照搬，不写死任何模型。

---

## 快速开始

```bash
# 克隆源仓库
git clone --depth 1 https://github.com/VoltAgent/awesome-codex-subagents.git ../awesome-codex-subagents

# 转换（零依赖，Node 18+）
node tools/codex-subagents-to-opencode.mjs ../awesome-codex-subagents/categories agents

# 装到项目（或 ~/.config/opencode/agents/ 全局生效）
cp agents/*.md .opencode/agents/
```

转换完成后重启 OpenCode，即可用 `@agent名` 调用，例如 `@reviewer`、`@code-mapper`。

---

## 设计取舍

### 1. 不写死模型

源文件里的 `model = "gpt-6.1-sol"` 是 Codex 专用模型，换到 OpenCode 上大概率不存在。
转换器**完全不输出 `model` 字段**，让 subagent 继承调用方 agent 的模型 —— 这是 OpenCode
的文档行为，好处是与 provider 无关，换模型不用重跑转换。

需要给特定 agent 钉死模型时：

```bash
node tools/codex-subagents-to-opencode.mjs <src> agents \
  --model-map=gpt-6.1-sol=anthropic/claude-sonnet-5,gpt-6-luna=anthropic/claude-haiku-5
```

### 2. MCP 依赖去厂商化

Codex 允许在 agent 文件内联 `[mcp_servers.NAME]`，OpenCode 不允许（必须写在
`opencode.json`）。仓库里的两个依赖处理如下：

| 源 MCP | 处理 | 原因 |
| --- | --- | --- |
| `openaiDeveloperDocs`（docs-researcher） | 替换为 `websearch` + `webfetch` | 无需 API key，但只索引 OpenAI 自家文档，与通用适配相悖 |
| `chrome_devtools`（browser-debugger） | 保留依赖 | 本身开源，且无通用替代品 |

替换规则集中在 `MCP_REPLACEMENTS` 常量，需要时可扩展。

### 3. 权限映射

Codex 的 `sandbox_mode` 是沙箱级强制，OpenCode 的 `permission` 是 allow/ask/deny 三级：

| Codex | OpenCode |
| --- | --- |
| `read-only` | `edit: deny`, `bash: deny` |
| `workspace-write` | `edit: allow`, `bash: allow` |

当前 174 个 agent 中 99 个只读、75 个可写。**注意**：只读 agent 被设为 `bash: deny`，
连 `git diff`、`rg` 都无法执行。若希望它们能跑只读命令，改 `bash: ask` 更实用。

---

## 字段映射

| Codex (`.toml`) | OpenCode (`.md`) |
| --- | --- |
| `name` | 文件名 `xxx.md`（同时是 agent id） |
| `description` | frontmatter `description` |
| `model` | **不输出**，继承父 agent（可用 `--model-map` 覆盖） |
| `model_reasoning_effort` | frontmatter `reasoningEffort` |
| `developer_instructions` | 正文（prompt，原文保留） |
| `sandbox_mode` | frontmatter `permission` |
| `[mcp_servers.*]` | 不进入文件，转换报告里列出 |
| 分类目录 | frontmatter `color`（仅视觉区分） |

正文中的 `Codex` 会被替换为 `the parent agent`，避免提示词指向另一个产品。

---

## CLI 参数

| 参数 | 说明 |
| --- | --- |
| `--only=reviewer,debugger` | 只转换指定 agent |
| `--category=04,05` | 按分类目录前缀过滤 |
| `--skip=a,b` | 追加要跳过的 agent |
| `--all` | 连 Codex 专用 agent 也一并转换 |
| `--dry` | 只打印报告，不写文件 |
| `--model-map=k=v,...` | 覆盖模型映射 |
| `--lang=zh` | 把 `description` 本地化成中文，正文保持英文 |
| `--keep-reasoning` | 保留 `reasoningEffort` 字段 |

默认跳过 `agent-installer`、`workflow-orchestrator`：它们的 prompt 讲的是
"往 `~/.codex/agents/` 里装文件"，移植到 OpenCode 后语义为空。

---

## 中文本地化（`--lang=zh`）

```bash
node tools/codex-subagents-to-opencode.mjs <src> agents-zh --lang=zh
```

**只翻译 `description`，不翻译 prompt 正文。** 译表在 `tools/i18n/zh.json`，
按 agent 名索引，可直接编辑增补。

### 为什么不全量汉化

先看实测数据。同一份内容的中英对照测试：

| 分词器 | 英文 | 中文 | 差值 |
| --- | --- | --- | --- |
| GPT-4o (o200k) | 1196 | 1479 | +23.7% |
| DeepSeek-V2 | 1324 | 1427 | +7.8% |
| GLM-4 | 1202 | 1307 | +8.7% |
| Qwen 2.5 | 1203 | 1351 | +12.3% |

来源：[Chinese vs. English Tokens](https://markhuang.ai/blog/chinese-token-myth)。

国产模型的分词器对中文友好得多（从 +24% 降到 +8%），但**方向从未逆转：中文更费 token**。
原因是英文可以整词压成单个 token，而汉字基本一字一 token 或更多。

换算到本仓库：中文 description 字符数少 66%，但 token 数**增加约 50%**（字符密度高）。
全量汉化正文会让 327k 字符的 prompt 再涨约 8%。

所以：**汉化的价值是可读性和触发准确性，不是省 token。** 想省 token 应该精简数量，
而不是换语言。

### 对国产模型的额外调整

- `reasoningEffort` 是 OpenAI 系请求参数，GLM / DeepSeek / Qwen / MiMo 通常忽略。
  **默认不再输出**，需要时用 `--keep-reasoning` 恢复。
- 若给特定 agent 钉模型，用 `--model-map`，例如
  `--model-map=gpt-6.1-sol=<provider>/<model-id>`。

---

## 已知限制

1. **自动触发很弱（平台机制）**。OpenCode 把 subagent 列表以 `id: description` 拼进 task
   工具的 description，只靠文本让模型自行判断。内置 `explore` 的 description 带具体例句，
   更容易被选中。174 个候选会稀释信号 —— 这是 OpenCode 的行为，不是转换问题。
   建议要么用 `--only` 只装常用子集，要么始终 `@agent名` 手动调用。

2. **常驻上下文成本**。全量安装会让 task 工具描述增加约 7.5k token。

3. **prompt 同质化**。源仓库 174 份 prompt 共用一个模板
  （`Working mode / Focus on / Quality checks / Return`），长度 129/174 落在 1–2k 字符区间，
   差异主要在领域词汇。不要期待它们之间有精细分工。

4. **`browser-debugger` 需要 chrome-devtools MCP**（默认 `localhost:3000/mcp`）。
   未配置时该 agent 会被加载但缺少工具。

---

## 仓库结构

```
.
├── tools/
│   ├── codex-subagents-to-opencode.mjs   # 转换器（零依赖）
│   ├── i18n/zh.json                      # description 中文译表
│   ├── analyze-subagents.mjs             # 产物分析
│   ├── compare-lang.mjs                  # 中英文 token 成本对比
│   └── verify-load.mjs                   # 验证 OpenCode 能否正确加载
├── agents/                                # 生成的 174 个 OpenCode agent（英文 description）
├── README.md
└── LICENSE
```

`agents/` 目录可以直接复制到任意 OpenCode 项目使用，无需运行转换器。

---

## 许可证

本仓库的转换脚本与 README 以 MIT 发布。
`agents/` 下的内容派生自 [VoltAgent/awesome-codex-subagents](https://github.com/VoltAgent/awesome-codex-subagents)，
同样为 MIT，版权归原作者及贡献者所有。
