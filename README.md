# awesome-codex-subagents → OpenCode

> **174 个专家 agent，一条命令装进 OpenCode。**

OpenCode 自带的 subagent 只有 `general` 和 `explore` 两个。当你需要一次真正到位的
PR 级代码审查、一份能落地的威胁建模、一次跨文件的架构重构规划，往往只能靠主 agent
一边读上下文一边现编——既占上下文，质量也不稳定。

这个仓库把它变成了开箱即用的东西：

```bash
node tools/install.mjs
```

装完重启 OpenCode，敲 `@reviewer` 就能让一个只读的审查者独立跑完整个 diff，只把结论
带回你的对话。它不会污染主上下文，也不会顺手改你的文件。

## 它解决什么问题

| 痛点 | 这个仓库的做法 |
| --- | --- |
| 长任务把主上下文塞满 | 每个 agent 在独立子会话里跑，只回传结论 |
| 审查类工作容易越界改代码 | 99 个只读 agent 用 `permission` 硬性限制，连写文件都不允许 |
| 换模型就得改一堆配置 | **一个模型都不写死**，subagent 自动继承你当前的模型 |
| `@` 菜单全是英文看不懂 | 中文系统自动装中文描述，也可随时切换 |
| 不知道自己该用哪个 | 按领域分组，从 `debugger` 到 `hipaa-compliance` 都有 |

## 覆盖范围

174 个 agent，覆盖 13 个领域：

| 领域 | 代表 agent |
| --- | --- |
| 核心开发 | `backend-developer` `frontend-developer` `code-mapper` |
| 语言与框架 | `python-pro` `typescript-pro` `golang-pro` `rust-engineer` …31 个 |
| 基础设施 | `kubernetes-specialist` `terraform-engineer` `docker-expert` |
| 质量与安全 | `reviewer` `security-auditor` `debugger` `test-automator` |
| 数据与 AI | `data-engineer` `ml-engineer` `eval-engineer` |
| LLM 工程 | `llm-architect` `prompt-engineer` `mcp-developer` |
| 设计与产品 | `ui-designer` `product-manager` `ux-researcher` |
| 专项领域 | `fintech-engineer` `payment-integration` `blockchain-developer` |
| 合规法务 | `hipaa-compliance` `gdpr-ccpa-compliance` `license-engineer` |

完整清单见 [`agents/`](./agents)。

---

## 快速开始

```bash
git clone https://github.com/He-Xun/awesome-codex-subagents-opencode.git
cd awesome-codex-subagents-opencode

# 安装到当前项目（会自动按系统语言选择 description 语言）
node tools/install.mjs

# 或安装到全局
node tools/install.mjs --global
```

重启 OpenCode 后即可用 `@agent名` 调用。零依赖，只需 Node 18+。

## 三个设计取舍

这三点决定了它和"直接把文件复制过来"的差别：

**1. 不写死模型。** 源仓库每个 agent 都绑定了 `gpt-6.1-sol`，这个模型在你的 provider
上大概率不存在，硬套过去等于 174 个 agent 全部不可用。本仓库**完全不输出 `model` 字段**，
让 subagent 继承调用方的模型——换 provider、换模型都不用重新生成。

**2. MCP 依赖去厂商化。** 源仓库有 agent 绑定 OpenAI 自家的文档服务。这里替换成通用的
`websearch` + `webfetch`，任何厂商的文档都能查。

**3. 语言只翻描述，不翻正文。** 详见下方[为什么](#为什么只翻译-description)——中文
反而更费 token，全量汉化是负优化。

---

## 项目来源

本仓库是 [VoltAgent/awesome-codex-subagents](https://github.com/VoltAgent/awesome-codex-subagents)
（6.4k star）的 OpenCode 移植版。上游提供的是 Codex 格式的 `.toml` 定义，本项目将其
转换为 OpenCode 的 Markdown agent 格式，并解决了上述三个移植问题。

**只做格式适配，不改写 prompt 语义**：正文原文照搬，便于上游更新时重新生成。

上游更新后重新生成：

```bash
git clone --depth 1 https://github.com/VoltAgent/awesome-codex-subagents.git ../src
node tools/codex-subagents-to-opencode.mjs ../src/categories agents
```

---

## 描述语言：随系统自动选择，可随时切换

**prompt 正文始终是英文**，只有 `description`（也就是 `@` 菜单里显示的那一行）会跟着语言变化。

### 安装时自动检测

`tools/install.mjs` 按以下顺序决定语言，**没有匹配译表时回退到英语**：

1. `--lang=xx` 或环境变量 `OPENCODE_SUBAGENTS_LANG`
2. `LC_ALL` / `LC_MESSAGES` / `LANG` / `LANGUAGE`
3. `Intl` 报告的系统 locale
4. 回退 → 英语

```bash
node tools/install.mjs                    # 中文系统装 zh，其他装 en
node tools/install.mjs --lang=en          # 强制英文
node tools/install.mjs --only=reviewer,debugger   # 只装部分
```

实测行为：`zh-CN` → zh；`en_US` → en；`ko_KR`（无译表）→ en。

### 随时切换

```bash
node tools/switch-lang.mjs --list                              # 查看可用语言
node tools/switch-lang.mjs --to=zh                             # 切中文
node tools/switch-lang.mjs --to=en                             # 切回英文
node tools/switch-lang.mjs --to=zh --dir=~/.config/opencode/agents   # 指定目录
node tools/switch-lang.mjs --to=zh --dry                       # 预演
```

切换器**只改写 frontmatter 里的 description 那一行**，正文和权限原样保留，并保持原有的引号风格，
因此中英来回切换不会产生多余 diff（已验证 174 个文件往返 0 差异）。

### 添加新语言

在 `tools/i18n/` 下新建 `<语言码>.json`，键为 agent 名：

```json
{
  "reviewer": "需要 PR 式评审，聚焦正确性、安全性、行为回归与测试缺失时使用。",
  "debugger": "需要做深度缺陷定位时使用。"
}
```

无需改代码，`install.mjs` / `switch-lang.mjs` 会自动发现。缺条目时该 agent 保留英文。

---

## 为什么只翻译 description

先看实测数据。同一份内容的中英对照：

| 分词器 | 英文 | 中文 | 差值 |
| --- | --- | --- | --- |
| GPT-4o (o200k) | 1196 | 1479 | +23.7% |
| DeepSeek-V2 | 1324 | 1427 | +7.8% |
| GLM-4 | 1202 | 1307 | +8.7% |
| Qwen 2.5 | 1203 | 1351 | +12.3% |

来源：[Chinese vs. English Tokens](https://markhuang.ai/blog/chinese-token-myth)。

国产模型分词器对中文友好得多（从 +24% 降到 +8%），但**方向从未逆转：中文更费 token**。
英文可以整词压成单个 token，汉字基本一字一 token 或更多。

换算到本仓库：中文 description 字符数少 66%，但 token 数**增加约 50%**。全量汉化正文会让
327k 字符的 prompt 再涨约 8%。

所以：**语言的价值是可读性和触发准确性，不是省 token。** 想省 token 应该精简 agent 数量，
而不是换语言。

---

## 设计细节

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
| `--lang=zh` | 把 `description` 本地化成中文，正文保持英文（默认自动检测，见上） |
| `--keep-reasoning` | 保留 `reasoningEffort` 字段 |

默认跳过 `agent-installer`、`workflow-orchestrator`：它们的 prompt 讲的是
"往 `~/.codex/agents/` 里装文件"，移植到 OpenCode 后语义为空。

---

## 对国产模型的额外调整

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
│   ├── install.mjs                       # 安装（按系统语言选 description 语言）
│   ├── switch-lang.mjs                   # 随时切换 description 语言
│   ├── detect-lang.mjs                   # 语言检测（含回退到英语）
│   ├── i18n/{en,zh}.json                 # description 译表，加语言只需加文件
│   ├── codex-subagents-to-opencode.mjs   # 从上游 TOML 重新生成 agents/
│   ├── analyze-subagents.mjs             # 产物分析
│   ├── compare-lang.mjs                  # 中英文 token 成本对比
│   └── verify-load.mjs                   # 验证 OpenCode 能否正确加载
├── agents/                                # 174 个 OpenCode agent（英文 description）
├── README.md
└── LICENSE
```

`agents/` 目录可以直接复制到任意 OpenCode 项目使用，无需运行转换器。

---

## 许可证

本仓库的转换脚本与 README 以 MIT 发布。
`agents/` 下的内容派生自 [VoltAgent/awesome-codex-subagents](https://github.com/VoltAgent/awesome-codex-subagents)，
同样为 MIT，版权归原作者及贡献者所有。
