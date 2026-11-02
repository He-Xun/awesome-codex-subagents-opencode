#!/usr/bin/env node
/**
 * Convert Codex subagent TOML files (awesome-codex-subagents) into OpenCode
 * markdown agent files.
 *
 * Usage:
 *   node tools/codex-subagents-to-opencode.mjs <srcDir> <outDir> [--category=01] [--dry]
 *   node tools/codex-subagents-to-opencode.mjs <srcDir> <outDir> --only=reviewer,security-auditor
 *
 * Field mapping (Codex -> OpenCode):
 *   name                      -> file name (x.md)
 *   description               -> frontmatter description
 *   model (+ reasoningEffort) -> frontmatter model + reasoningEffort (only if --model-map is used)
 *   sandbox_mode              -> frontmatter permission (edit/bash)
 *   developer_instructions    -> markdown body (the prompt itself)
 *   url / startup_timeout_sec -> reported as "needs MCP" in the manifest
 *
 * The TOML in this repo is flat `key = <string>` only; we parse it with a
 * small purpose-built reader rather than pulling in a dependency.
 */

import fs from "node:fs";
import path from "node:path";
import { detectLanguage } from "./detect-lang.mjs";

// ---------------------------------------------------------------------------
// Minimal TOML reader for the subset used by awesome-codex-subagents.
// Supports: bare keys, basic strings (with escapes), multi-line strings,
// integers, booleans. Comments and blank lines are ignored.
// ---------------------------------------------------------------------------

function parseToml(src) {
  const out = {};
  let i = 0;
  const n = src.length;

  const isBare = (c) => /[A-Za-z0-9_-]/.test(c);

  const skipWs = () => {
    while (i < n && (src[i] === " " || src[i] === "\t" || src[i] === "\r")) i++;
  };

  const skipWsAndComments = () => {
    for (;;) {
      skipWs();
      if (src[i] === "\n") {
        i++;
        continue;
      }
      if (src[i] === "#") {
        while (i < n && src[i] !== "\n") i++;
        continue;
      }
      break;
    }
  };

  const readBasicString = () => {
    // assumes src[i] === '"'
    i++;
    let s = "";
    while (i < n) {
      const c = src[i];
      if (c === "\\") {
        const nx = src[i + 1];
        const esc = { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\", b: "\b", f: "\f" };
        if (nx in esc) {
          s += esc[nx];
          i += 2;
        } else if (nx === "u") {
          s += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16));
          i += 6;
        } else if (nx === "U") {
          s += String.fromCodePoint(parseInt(src.slice(i + 2, i + 10), 16));
          i += 10;
        } else {
          s += nx;
          i += 2;
        }
        continue;
      }
      if (c === '"') {
        i++;
        return s;
      }
      s += c;
      i++;
    }
    throw new Error("Unterminated string");
  };

  const readMultilineString = () => {
    // assumes src.startsWith('"""', i)
    i += 3;
    if (src[i] === "\n") i++;
    else if (src[i] === "\r" && src[i + 1] === "\n") i += 2;
    const start = i;
    while (i < n) {
      if (src.startsWith('"""', i)) {
        // allow up to two extra quotes to be part of the content
        let end = i;
        while (src[end + 3] === '"' && end + 3 < n) end++;
        const raw = src.slice(start, end);
        i = end + 3;
        return unescapeLine(raw);
      }
      i++;
    }
    throw new Error("Unterminated multi-line string");
  };

  // TOML multi-line basic strings: a trailing backslash trims the newline.
  const unescapeLine = (raw) => {
    return raw
      .replace(/\\\r?\n[ \t]*/g, "")
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  };

  // Flat top-level keys live here; dotted table headers become nested objects.
  let table = out;

  for (;;) {
    skipWsAndComments();
    if (i >= n) break;

    if (src[i] === "[") {
      // [a.b.c] or [[a.b]] table header. We only care about capturing them.
      const isArray = src[i + 1] === "[";
      i += isArray ? 2 : 1;
      let header = "";
      while (i < n && src[i] !== "]") header += src[i++];
      i += isArray ? 2 : 1;
      const segs = header.trim().split(".").map((s) => s.trim().replace(/^"|"$/g, ""));
      let node = out;
      for (const seg of segs) {
        if (node[seg] == null || typeof node[seg] !== "object") node[seg] = {};
        node = node[seg];
      }
      table = node;
      continue;
    }

    let key = "";
    while (i < n && isBare(src[i])) key += src[i++];
    if (!key) throw new Error(`Expected key at offset ${i}: ${JSON.stringify(src.slice(i, i + 40))}`);

    skipWs();
    if (src[i] !== "=") throw new Error(`Expected '=' after key "${key}"`);
    i++;
    skipWs();

    let value;
    if (src.startsWith('"""', i)) {
      value = readMultilineString();
    } else if (src[i] === '"') {
      value = readBasicString();
    } else if (src[i] === "'") {
      i++;
      const s = i;
      while (i < n && src[i] !== "'") i++;
      value = src.slice(s, i);
      i++;
    } else if (src.startsWith("true", i)) {
      value = true;
      i += 4;
    } else if (src.startsWith("false", i)) {
      value = false;
      i += 5;
    } else {
      const s = i;
      while (i < n && !",\n\r]".includes(src[i])) i++;
      const raw = src.slice(s, i).trim();
      value = Number.isNaN(Number(raw)) ? raw : Number(raw);
    }

    out[key] = value;
    table[key] = value;

    skipWs();
    if (src[i] === "#") {
      while (i < n && src[i] !== "\n") i++;
    }
    if (src[i] === ",") i++;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/**
 * Model handling: nothing is hard-coded.
 *
 * By default we emit no `model` field at all, so a subagent inherits the model
 * of the agent that invoked it (OpenCode's documented default). That is the
 * portable choice: it works on any provider without knowing which models exist.
 *
 * Pass `--model-map=<codexModel>=<provider>/<model>` (repeatable or comma
 * separated) to pin specific source models instead.
 */
function resolveModel(codexModel, modelMap) {
  if (!codexModel || !modelMap) return undefined;
  return modelMap[codexModel];
}


/** Reasoning effort per source model, translated to a provider-agnostic hint. */
const REASONING_MAP = {
  low: "low",
  medium: "medium",
  high: "high",
};

/**
 * sandbox_mode -> OpenCode permissions.
 * read-only: no edits, no shell mutations, no external dirs.
 * workspace-write: edits allowed, shell allowed.
 */
function permissionFor(sandboxMode) {
  if (sandboxMode === "read-only") {
    return {
      edit: "deny",
      bash: "deny",
      webfetch: "allow",
      websearch: "allow",
      task: "allow",
    };
  }
  return {
    edit: "allow",
    bash: "allow",
    webfetch: "allow",
    websearch: "allow",
    task: "allow",
  };
}

const CATEGORY_COLORS = {
  "01-core-development": "info",
  "02-language-specialists": "accent",
  "03-infrastructure": "warning",
  "04-quality-security": "error",
  "05-data-ai": "success",
  "06-developer-experience": "secondary",
  "07-specialized-domains": "accent",
  "08-business-product": "primary",
  "09-meta-orchestration": "warning",
  "10-research-analysis": "info",
  "11-ai-governance-safety": "error",
  "12-platform-engineering-idp": "secondary",
  "13-llmops-evals-observability": "success",
};

function yamlScalar(v) {
  const s = String(v);
  if (/^[A-Za-z0-9 _.\-/]+$/.test(s) && !/^(true|false|null|yes|no|\d)/i.test(s)) return s;
  return JSON.stringify(s);
}

function frontmatter(meta) {
  const lines = ["---"];
  lines.push(`description: ${yamlScalar(meta.description)}`);
  lines.push(`mode: subagent`);
  if (meta.model) lines.push(`model: ${meta.model}`);
  if (meta.reasoningEffort) lines.push(`reasoningEffort: ${meta.reasoningEffort}`);
  if (meta.color) lines.push(`color: ${meta.color}`);
  lines.push("permission:");
  for (const [k, v] of Object.entries(meta.permission)) {
    lines.push(`  ${k}: ${v}`);
  }
  lines.push("---");
  return lines.join("\n");
}

/** Codex-specific agents whose purpose doesn't survive the port: they talk
 *  about Codex directories / Codex delegation mechanics, not about a kind of work. */
const DEFAULT_SKIP = ["agent-installer", "workflow-orchestrator", "subagent-delegator"];

/** Codex prompts reference "the parent agent"; OpenCode says "the parent agent"
 *  too, so wording mostly carries over. We only normalize the delegation hint. */
function normalizeBody(body) {
  return body
    .replace(/\r\n/g, "\n")
    .replace(/\bCodex\b/g, "the parent agent")
    .replace(/\bOpenAI's\b/g, "the provider's")
    .trim();
}

function normalizeDescription(desc) {
  return desc.replace(/\bCodex\b/g, "the parent agent");
}

const I18N_DIR = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "i18n");

/**
 * Load a description translation table, e.g. tools/i18n/zh.json.
 * The table keys on the agent name; values are full replacement descriptions.
 */
function loadTranslations(lang) {
  if (!lang || lang === "en") return null;
  const file = path.join(I18N_DIR, `${lang}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`No translation table for --lang=${lang} (expected ${file})`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}


/**
 * Rewrite a prompt that assumes a vendor-hosted MCP server into one that uses
 * tools the user actually has. Kept as targeted text substitution so the rest
 * of the prompt stays byte-for-byte identical.
 */
function applyMcpReplacements(body, mcpServers) {
  let out = body;
  for (const s of mcpServers) {
    if (s.kind !== "replace" || !s.name) continue;
    if (s.replacement === "webfetch") {
      out = out.replace(
        /^/,
        [
          "Tooling note: use the general `websearch` and `webfetch` tools to reach official documentation.",
          "Prefer each project's own documentation site over any single vendor's doc index,",
          "because this agent is not tied to one ecosystem.",
          "",
          "",
        ].join("\n"),
      );
    }
  }
  return out;
}

/**
 * Codex agents may pin an MCP server inline via [mcp_servers.NAME].
 * OpenCode declares MCP servers in opencode.json instead, so a pinned server
 * would silently be missing. Record the requirement here and, where the
 * original server is single-vendor or needs credentials, point at a
 * portable open-source equivalent the agent can use instead.
 */
const MCP_REPLACEMENTS = {
  // OpenAI's hosted docs server: no key, but only covers OpenAI's own
  // documentation. Any general web fetch reaches the same pages.
  openaiDeveloperDocs: {
    replacement: "webfetch",
    note: "OpenAI-hosted docs search, OpenAI docs only. webfetch covers the same pages for any vendor.",
  },
};

function classifyMcp(serverName) {
  const rule = MCP_REPLACEMENTS[serverName];
  if (rule) return { ...rule, kind: "replace" };
  return { kind: "external", note: "Must be configured in opencode.json before this agent is used." };
}

function convertOne(file, opts) {
  const src = fs.readFileSync(file, "utf8");
  const toml = parseToml(src);

  const name = toml.name || path.basename(file, ".toml");
  const category = path.basename(path.dirname(file));

  const codexModel = toml.model;
  const mappedModel = resolveModel(codexModel, opts.modelMap);
  // reasoningEffort is an OpenAI-style request parameter that domestic model
  // providers (GLM, DeepSeek, Qwen, MiMo) generally ignore. Emit it only when
  // the user asked to keep provider-specific options.
  const reasoningEffort =
    opts.keepReasoning && REASONING_MAP[toml.model_reasoning_effort]
      ? toml.model_reasoning_effort
      : undefined;

  const body = normalizeBody(toml.developer_instructions ?? "");

  // Codex allows an inline [mcp_servers.NAME] table. OpenCode declares MCP
  // servers in opencode.json, not in agent frontmatter, so we surface them.
  const mcpServers = [];
  if (toml.mcp_servers && typeof toml.mcp_servers === "object") {
    for (const [serverName, cfg] of Object.entries(toml.mcp_servers)) {
      if (cfg && typeof cfg === "object" && typeof cfg.url === "string") {
        mcpServers.push({
          name: serverName,
          url: cfg.url,
          startupTimeoutSec: cfg.startup_timeout_sec,
          ...classifyMcp(serverName),
        });
      }
    }
  }
  if (typeof toml.url === "string" && !mcpServers.some((s) => s.url === toml.url)) {
    mcpServers.push({ name: null, url: toml.url, kind: "external", note: "URL given without a server name." });
  }
  const needsMcp = mcpServers.some((s) => s.kind === "external");

  const meta = {
    description: opts.translations?.[name] ?? normalizeDescription(toml.description || `${name} subagent`),
    model: mappedModel,
    reasoningEffort,
    color: CATEGORY_COLORS[category] ?? undefined,
    permission: permissionFor(toml.sandbox_mode),
  };

  const md = `${frontmatter(meta)}\n\n${applyMcpReplacements(body, mcpServers)}\n`;

  return {
    name,
    category,
    file,
    outPath: path.join(opts.outDir, `${name}.md`),
    md,
    meta,
    needsMcp,
    mcpServers,
    collapsedModel: !mappedModel ? codexModel : undefined,
    bodyLength: body.length,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const positional = [];
  const flags = {
    only: null,
    categories: null,
    dry: false,
    skip: [...DEFAULT_SKIP],
    // Empty by default: no agent gets a hard-coded model. See resolveModel().
    modelMap: {},
    // null means "detect from the system locale, falling back to English".
    lang: null,
    keepReasoning: false,
  };
  for (const a of argv) {
    if (a.startsWith("--only=")) flags.only = a.slice(7).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--category=")) flags.categories = a.slice(11).split(",");
    else if (a === "--dry") flags.dry = true;
    else if (a === "--all") flags.skip = [];
    else if (a === "--keep-reasoning") flags.keepReasoning = true;
    else if (a.startsWith("--lang=")) flags.lang = a.slice(7).trim();
    else if (a.startsWith("--skip=")) flags.skip = a.slice(7).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--model-map=")) {
      // e.g. --model-map=gpt-6.1-sol=anthropic/claude-sonnet-5,gpt-6-luna=anthropic/claude-haiku-5
      const entries = a.slice(12).split(",");
      const map = {};
      for (const e of entries) {
        const [k, v] = e.split("=");
        if (k && v) map[k.trim()] = v.trim();
      }
      flags.modelMap = map;
    } else positional.push(a);
  }
  return { positional, flags };
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [srcDir, outDir] = positional;

  if (!srcDir || !outDir) {
    console.error(
      "Usage: node tools/codex-subagents-to-opencode.mjs <srcDir> <outDir> [--only=a,b] [--category=01] [--dry] [--model-map=k=v,...]",
    );
    process.exit(2);
  }

  const src = path.resolve(srcDir);
  if (!fs.existsSync(src)) {
    console.error(`Source not found: ${src}`);
    process.exit(2);
  }

  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".toml")) files.push(p);
    }
  };
  walk(src);

  // Resolve the description language: explicit --lang wins, otherwise follow the
  // system locale and fall back to English when no table matches.
  const lang = detectLanguage(flags.lang ?? process.env.OPENCODE_SUBAGENTS_LANG);

  const opts = {
    outDir: path.resolve(outDir),
    modelMap: flags.modelMap,
    keepReasoning: flags.keepReasoning,
    translations: loadTranslations(lang.lang),
  };

  const results = [];
  const errors = [];
  const skipped = [];

  for (const file of files) {
    const category = path.basename(path.dirname(file));
    if (flags.categories && !flags.categories.some((c) => category.startsWith(c))) continue;
    const base = path.basename(file, ".toml");
    if (flags.only && !flags.only.includes(base)) continue;
    if (flags.skip.includes(base)) {
      skipped.push(base);
      continue;
    }

    try {
      results.push(convertOne(file, opts));
    } catch (err) {
      errors.push({ file, error: err.message });
    }
  }

  if (!flags.dry) {
    fs.mkdirSync(opts.outDir, { recursive: true });
    for (const r of results) fs.writeFileSync(r.outPath, r.md, "utf8");
  }

  // ---- report -------------------------------------------------------------
  const needsMcp = results.filter((r) => r.needsMcp);
  const replacedMcp = results.filter((r) => r.mcpServers.some((s) => s.kind === "replace"));
  const collapsed = results.filter((r) => r.collapsedModel);

  console.log(`\nConverted: ${results.length}/${files.length}  (${flags.dry ? "dry run" : opts.outDir})`);
  if (skipped.length) {
    console.log(`\nSkipped as Codex-specific (${skipped.length}, use --all to include): ${skipped.join(", ")}`);
  }
  if (errors.length) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`  ${path.basename(e.file)}: ${e.error}`);
  }
  if (needsMcp.length) {
    console.log(`\nNeeds an MCP server configured in opencode.json (${needsMcp.length}):`);
    for (const r of needsMcp) {
      for (const s of r.mcpServers.filter((x) => x.kind === "external")) {
        console.log(`  ${r.name.padEnd(22)} ${s.name ? `[${s.name}] ` : ""}${s.url}`);
      }
    }
  }
  if (replacedMcp.length) {
    console.log(`\nVendor-specific MCP replaced by a portable tool (${replacedMcp.length}):`);
    for (const r of replacedMcp) {
      for (const s of r.mcpServers.filter((x) => x.kind === "replace")) {
        console.log(`  ${r.name.padEnd(22)} ${s.name} → ${s.replacement}`);
        console.log(`  ${"".padEnd(22)} ${s.note}`);
      }
    }
  }
  if (collapsed.length) {
    console.log(`\nInherits the invoking agent's model (no model field written, ${collapsed.length}):`);
    const bySource = {};
    for (const r of collapsed) bySource[r.collapsedModel] = (bySource[r.collapsedModel] || 0) + 1;
    for (const [m, n] of Object.entries(bySource)) console.log(`  ${String(n).padStart(3)} × source model "${m}"`);
    console.log("  Tip: pass --model-map=<sourceModel>=<provider>/<model> to pin one instead.");
  }

  if (lang.lang !== "en") {
    const translated = results.filter((r) => opts.translations?.[r.name]).length;
    console.log(`\nLocalized descriptions (${lang.lang}, ${lang.reason}): ${translated}/${results.length}`);
    if (translated < results.length) {
      const missing = results.filter((r) => !opts.translations?.[r.name]).map((r) => r.name);
      console.log(`  Untranslated (falling back to English): ${missing.join(", ")}`);
    }
  } else {
    console.log(`\nDescriptions: English (${lang.reason})`);
  }

  const byCategory = {};
  for (const r of results) byCategory[r.category] = (byCategory[r.category] || 0) + 1;
  console.log("\nBy category:");
  for (const [c, n] of Object.entries(byCategory).sort()) console.log(`  ${c}: ${n}`);

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: src,
    total: results.length,
    agents: results.map((r) => ({
      name: r.name,
      category: r.category,
      description: r.meta.description,
      needsMcp: r.needsMcp || undefined,
      mcpServers: r.needsMcp ? r.mcpServers : undefined,
      model: r.meta.model || null,
      sourceModel: r.collapsedModel || null,
      permission: r.meta.permission,
      bodyLength: r.bodyLength,
    })),
    errors,
    skipped,
  };
  if (!flags.dry) {
    fs.writeFileSync(path.join(opts.outDir, "_manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  }
}

main();
