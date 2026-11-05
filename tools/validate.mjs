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
for (const name of agents) {  const s = fs.readFileSync(path.join(AGENTS_DIR, `${name}.md`), "utf8");

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

    // Formality guard: bundled tables must stay in the formal register, since
    // mixing in informal forms makes the agent descriptions inconsistent.
    //
    // Word boundaries are written with Unicode-aware lookarounds because \b is
    // ASCII-only in JS and fails on Cyrillic/Hangul. The words are interpolated
    // from a plain literal so exactly one backslash reaches the regex source.
    const word = (alts) => new RegExp(String.raw`(?<!\p{L})(?:${alts})(?!\p{L})`, "iu");
    const INFORMAL = {
      es: [
        [word("tú|vosotros|vosotras"), "informal pronoun"],
        [word("puedes|debes|haz|usa|utiliza|necesitas|tienes"), "informal verb form"],
      ],
      ru: [
        [word("ты|тебе|твой|твоя|твоё|твои|тебя"), "informal pronoun"],
        // Only imperatives addressing the reader directly. Impersonal "нужно"
        // and third-person "должен" are legitimate and must not match.
        [word("можешь|сделай|используй|проверь|попробуй"), "informal verb form"],
      ],
      ko: [
        // Korean is agglutinative: endings attach directly to the stem with no
        // space, so word-boundary matching does not work here. Match known
        // informal endings as substrings instead. "너" is checked with a
        // boundary because it also appears inside words like "컨테이너".
        [/(해라|하자|해줘|할래|할게)/, "informal verb ending"],
        [/(?<!컨테이)너(?![가-힣])/, "informal pronoun"],
        [/(한다|이다)\.\s*$/, "plain form ending"],
      ],
      ja: [
        // Japanese descriptions use です・ます. Plain (だ/である) endings and
        // casual sentence-final particles read as inconsistent in a menu.
        // Matching fixed phrases alone missed forms like 「〜けるよ」, so the
        // sentence ending itself is what gets checked.
        [/(だ|である)。\s*$/, "plain form ending"],
        [/[よねぞわ]。(?:\s*$)/, "casual sentence ending"],
        [/(だよ|だぞ|じゃん|してね)/, "casual speech"],
      ],
      pt: [
        // Brazilian Portuguese with "você" and neutral, professional address.
        // Lookarounds replace \b here: in JS \b is ASCII-only, so \btá\b can
        // never match a word containing an accented letter.
        [/(?<!\p{L})(tu|te|ti|contigo|vós)(?!\p{L})/u, "second-person pronoun"],
        [/(?<!\p{L})(né|pra|tá|vc|beleza)(?!\p{L})/iu, "colloquial form"],
      ],
    };
    for (const [re, label] of INFORMAL[lang] ?? []) {
      const hits = Object.entries(table).filter(([, v]) => re.test(v));
      if (hits.length) {
        add("error", `${file}: ${hits.length} entr(ies) use ${label}, e.g. "${hits[0][0]}"`);
      }
    }
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

// --- permission policy -----------------------------------------------------
// Agents whose deliverable is advice or a document must not run shell commands
// without approval; agents that change code may. This encodes the intent so a
// regenerated or hand-edited file cannot silently widen its permissions.
const MUST_ASK_SHELL = new Set([
  // read-only agents that still need to execute commands to gather evidence
  "debugger",
  "performance-engineer",
  "security-auditor",
  // writers and reviewers whose output is text, not code
  "technical-writer",
  "documentation-engineer",
  "api-documenter",
  "readme-generator",
  "resume-refiner",
  "design-bridge",
  "ai-writing-auditor",
  "content-quality-editor",
  // architects and language experts that mostly advise
  "angular-architect",
  "java-architect",
  "powershell-5.1-expert",
  "powershell-7-expert",
]);

for (const name of agents) {
  const s = fs.readFileSync(path.join(AGENTS_DIR, `${name}.md`), "utf8");
  const fm = s.slice(4, s.indexOf("\n---", 4));
  const bash = (fm.match(/^ {2}bash: (\w+)/m) ?? [])[1];
  if (MUST_ASK_SHELL.has(name) && bash !== "ask") {
    add("error", `${name}: must use "bash: ask" (got "${bash}")`);
  }
  if (!MUST_ASK_SHELL.has(name) && bash === "deny" && /^ {2}edit: allow/m.test(fm)) {
    add("warn", `${name}: writable agent with "bash: deny" cannot run any command`);
  }
}

// --- documented language behaviour matches the detector ------------------
// The README publishes a locale table. Parse that table and check each row
// against the real detector, so documentation cannot lie about behaviour.
{
  const { execFileSync } = await import("node:child_process");

  for (const f of ["README.md", "README.zh-CN.md"].filter((x) => fs.existsSync(x))) {
    const src = fs.readFileSync(f, "utf8");
    // Table rows look like: | `zh-CN`, `zh-TW` | `zh` | reason |
    // Split on pipes so no regex can accidentally span several rows.
    let checked = 0;
    for (const line of src.split("\n")) {
      if (!line.startsWith("|")) continue;
      const cells = line.split("|").map((c) => c.trim());
      // cells[0] is empty (leading pipe); need at least 3 populated columns.
      if (cells.length < 4) continue;
      const localeCell = cells[1];
      const targetCell = cells[2];
      // Accept one or more backticked locale codes separated by ", " or "、".
      // Codes may contain a hyphen or underscore (zh-CN, es_ES), so the
      // character class must include both; omitting "_" silently skipped rows.
      const locales = [...localeCell.matchAll(/`([A-Za-z_-]+)`/g)].map((m) => m[1]);
      if (locales.length === 0) continue;
      // Require the cell to contain nothing but the codes and separators.
      const residue = localeCell.replace(/`[A-Za-z_-]+`/g, "").replace(/[,、\s]/g, "");
      if (residue !== "") continue;
      const expected = (targetCell.match(/^`([a-zA-Z-]+)`$/) ?? [])[1];
      if (!expected) continue;

      for (const locale of locales) {
        // Only regional codes are testable; bare language codes are the outputs.
        if (!/^[a-z]{2}[-_][A-Z]{2}$/.test(locale)) continue;
        checked++;
        let got;
        try {
          const out = execFileSync(process.execPath, ["tools/detect-lang.mjs"], {
            encoding: "utf8",
            env: { ...process.env, LANG: locale, LC_ALL: "", LC_MESSAGES: "", LANGUAGE: "" },
          });
          got = (out.match(/language:\s+(\S+)/) ?? [])[1];
        } catch (err) {
          add("error", `${f}: detect-lang failed for ${locale}: ${err.message}`);
          continue;
        }
        if (got !== expected) add("error", `${f}: documents ${locale} -> ${expected}, but it resolves to ${got}`);
      }
    }
    if (checked === 0) add("warn", `${f}: no locale mapping table found to verify`);
    else if (!quiet) console.log(`${f}: verified ${checked} locale mapping(s)`);
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

  // Images must exist on disk and be referenced by every README.
  for (const f of existingReadmes) {
    const s = fs.readFileSync(f, "utf8");
    for (const m of s.matchAll(/!\[[^\]]*\]\((\.\/[^)]+)\)/g)) {
      if (!fs.existsSync(m[1])) add("error", `${f}: image not found: ${m[1]}`);
    }
  }
  const images = existingReadmes.map((f) => ({
    file: f,
    src: [...fs.readFileSync(f, "utf8").matchAll(/!\[[^\]]*\]\((\.\/[^)]+)\)/g)].map((m) => m[1]).join(","),
  }));
  for (const i of images.slice(1)) {
    if (i.src !== images[0].src) {
      add("error", `${i.file}: images differ from ${images[0].file}`);
    }
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
