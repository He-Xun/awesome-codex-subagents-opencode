#!/usr/bin/env node
/**
 * Validate the generated agents and translation tables.
 *
 *   node tools/validate.mjs          # report and exit 1 on errors
 *   node tools/validate.mjs --quiet  # summary line only
 *
 * Checks:
 *   - every agent has well-formed frontmatter with mode: subagent
 *   - no agent hard-codes a model
 *   - permission keys are ones OpenCode actually understands
 *   - prompt bodies are intact and free of Codex-specific wording
 *   - translation tables cover exactly the agent set
 *   - presets reference only existing agents
 *   - the manifest matches the agent directory
 */
import fs from "node:fs";
import path from "node:path";

const quiet = process.argv.includes("--quiet");
const problems = [];
const add = (level, msg) => problems.push({ level, msg });

const VALID_PERMISSIONS = new Set([
  "read", "edit", "glob", "grep", "list", "bash", "task", "todowrite",
  "external_directory", "webfetch", "websearch", "lsp", "skill", "question",
  "doom_loop",
]);

const AGENTS_DIR = "agents";
const I18N_DIR = "tools/i18n";
const PRESET_DIR = "presets";

// --- agents ---------------------------------------------------------------
if (!fs.existsSync(AGENTS_DIR)) {
  console.error(`Missing ${AGENTS_DIR}/ — run the converter first.`);
  process.exit(1);
}

const agents = fs
  .readdirSync(AGENTS_DIR)
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.replace(/\.md$/, ""))
  .sort();

if (agents.length === 0) add("error", "no agent files found");

const MIN_BODY = 200;
for (const name of agents) {
  const s = fs.readFileSync(path.join(AGENTS_DIR, `${name}.md`), "utf8");

  if (!s.startsWith("---\n")) {
    add("error", `${name}: file does not start with YAML frontmatter`);
    continue;
  }
  const end = s.indexOf("\n---", 3);
  if (end === -1) {
    add("error", `${name}: unterminated frontmatter`);
    continue;
  }

  const fm = s.slice(4, end);
  const body = s.slice(end + 4).trim();

  if (!/^description: \S/m.test(fm)) add("error", `${name}: missing or empty description`);
  if (!/^mode: subagent$/m.test(fm)) add("error", `${name}: mode must be subagent`);
  if (/^model:/m.test(fm)) add("error", `${name}: must not hard-code a model`);

  const permIndex = fm.indexOf("permission:");
  if (permIndex === -1) {
    add("warn", `${name}: no permission block`);
  } else {
    for (const line of fm.slice(permIndex).split("\n").slice(1)) {
      const m = line.match(/^ {2}([a-z_]+):\s*(\S+)/);
      if (!m) continue;
      const [, key, value] = m;
      if (!VALID_PERMISSIONS.has(key)) add("error", `${name}: unknown permission "${key}"`);
      if (!["allow", "ask", "deny"].includes(value)) add("error", `${name}: permission "${key}" = "${value}"`);
    }
  }

  if (body.length < MIN_BODY) add("warn", `${name}: prompt body is only ${body.length} chars`);
  if (/\bCodex\b/.test(body)) add("error", `${name}: prompt still mentions Codex`);
  if (/openaiDeveloperDocs/.test(body)) add("error", `${name}: prompt references a removed MCP server`);
}

// --- translation tables ---------------------------------------------------
if (fs.existsSync(I18N_DIR)) {
  for (const file of fs.readdirSync(I18N_DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"))) {
    const lang = file.replace(/\.json$/, "");
    let table;
    try {
      table = JSON.parse(fs.readFileSync(path.join(I18N_DIR, file), "utf8"));
    } catch (err) {
      add("error", `${file}: invalid JSON (${err.message})`);
      continue;
    }
    const missing = agents.filter((a) => !(a in table));
    const extra = Object.keys(table).filter((k) => !agents.includes(k));
    if (missing.length) add("error", `${file}: missing ${missing.length} agent(s), e.g. ${missing.slice(0, 3).join(", ")}`);
    if (extra.length) add("error", `${file}: ${extra.length} stale key(s), e.g. ${extra.slice(0, 3).join(", ")}`);
    for (const [k, v] of Object.entries(table)) {
      if (typeof v !== "string" || !v.trim()) add("error", `${file}: empty translation for "${k}"`);
    }
    if (!quiet) console.log(`translation ${lang}: ${Object.keys(table).length} entries`);
  }
}

// --- presets --------------------------------------------------------------
if (fs.existsSync(PRESET_DIR)) {
  for (const file of fs.readdirSync(PRESET_DIR).filter((f) => f.endsWith(".txt"))) {
    const names = fs
      .readFileSync(path.join(PRESET_DIR, file), "utf8")
      .split(/\r?\n/)
      .map((l) => l.replace(/#.*$/, "").trim())
      .filter(Boolean);
    const unknown = names.filter((n) => !agents.includes(n));
    if (unknown.length) add("error", `${file}: unknown agent(s) ${unknown.join(", ")}`);
    if (names.length === 0) add("error", `${file}: preset is empty`);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length) add("warn", `${file}: duplicate entries ${[...new Set(dupes)].join(", ")}`);
  }
}

// --- README translations stay structurally aligned -----------------------
const READMES = ["README.md", "README.zh-CN.md"];
const existingReadmes = READMES.filter((f) => fs.existsSync(f));
if (existingReadmes.length > 1) {
  const stats = existingReadmes.map((f) => {
    const s = fs.readFileSync(f, "utf8");
    return {
      file: f,
      headings: (s.match(/^#+ .*$/gm) ?? []).length,
      depth: (s.match(/^#+/gm) ?? []).map((x) => x.length).join(","),
      tables: (s.match(/^\| *---/gm) ?? []).length,
      fences: (s.match(/^```/gm) ?? []).length,
    };
  });
  const base = stats[0];
  for (const s of stats.slice(1)) {
    if (s.headings !== base.headings) {
      add("error", `${s.file}: ${s.headings} headings but ${base.file} has ${base.headings}`);
    }
    if (s.depth !== base.depth) add("error", `${s.file}: heading structure differs from ${base.file}`);
    if (s.tables !== base.tables) add("error", `${s.file}: ${s.tables} tables but ${base.file} has ${base.tables}`);
    if (s.fences !== base.fences) add("error", `${s.file}: ${s.fences} code fences but ${base.file} has ${base.fences}`);
  }
  // Every README must link to the others.
  for (const f of existingReadmes) {
    const s = fs.readFileSync(f, "utf8");
    for (const other of existingReadmes) {
      if (other === f) continue;
      if (!s.includes(`(${other.startsWith("./") ? other : `./${other}`})`)) {
        add("error", `${f}: does not link to ${other}`);
      }
    }
    // A bare `node tools/...` line reads like a standalone command, but it only
    // works from the repository root. Flag blocks that never establish it.
    for (const block of s.split(/^```/m).filter((_, i) => i % 2 === 1)) {
      if (/^cd /m.test(block)) continue;
      for (const line of block.split("\n")) {
        if (/^\s*node tools\//.test(line)) {
          add("warn", `${f}: "node tools/..." without a preceding cd in the same block: ${line.trim()}`);
        }
      }
    }
  }
  if (!quiet) console.log(`readmes: ${existingReadmes.join(", ")} (structure aligned)`);
}

// --- manifest -------------------------------------------------------------
const manifestPath = path.join(AGENTS_DIR, "_manifest.json");
if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.total !== agents.length) {
      add("error", `_manifest.json says ${manifest.total} agents but ${agents.length} are on disk`);
    }
  } catch (err) {
    add("error", `_manifest.json: invalid JSON (${err.message})`);
  }
} else {
  add("warn", "_manifest.json is missing");
}

// --- report ---------------------------------------------------------------
const errors = problems.filter((p) => p.level === "error");
const warns = problems.filter((p) => p.level === "warn");

if (!quiet) {
  const presets = fs.existsSync(PRESET_DIR) ? fs.readdirSync(PRESET_DIR).filter((f) => f.endsWith(".txt")).length : 0;
  console.log(`agents: ${agents.length} | presets: ${presets}`);
  for (const p of [...errors, ...warns]) console.log(`[${p.level}] ${p.msg}`);
}

console.log(`\n${errors.length === 0 ? "PASS" : "FAIL"} — ${errors.length} error(s), ${warns.length} warning(s)`);
process.exit(errors.length === 0 ? 0 : 1);
