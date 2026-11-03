#!/usr/bin/env node
/**
 * Install the agents into an OpenCode config directory, choosing the
 * description language from the user's system locale.
 *
 *   node tools/install.mjs                        # -> .opencode/agents (project)
 *   node tools/install.mjs --global               # -> ~/.config/opencode/agents
 *   node tools/install.mjs --lang=en              # force a language
 *   node tools/install.mjs --only=reviewer,debugger
 *   node tools/install.mjs --dry
 *
 * English is the fallback whenever the detected locale has no translation
 * table, so a machine with only en/zh tables never gets a broken mix.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectLanguage, availableLanguages } from "./detect-lang.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const REPO = path.resolve(HERE, "..");
const SRC = path.join(REPO, "agents");
const I18N = path.join(HERE, "i18n");

function expandHome(p) {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/**
 * Parse CLI arguments. Accepts both `--flag=value` and `--flag value`, since
 * people type both and a silently ignored flag is worse than an error.
 */
function parseArgs(argv) {
  const flags = {};
  const VALUE_FLAGS = new Set(["--lang", "--dir", "--preset", "--only", "--skip"]);

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    // `--flag value` form: only when the flag takes a value and one follows.
    if (VALUE_FLAGS.has(a)) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("-")) {
        console.error(`Missing value for ${a}`);
        process.exit(2);
      }
      i++;
      applyValueFlag(flags, a, next);
      continue;
    }

    if (a === "--global" || a === "-g") flags.global = true;
    else if (a === "--dry") flags.dry = true;
    else if (a === "--list-presets") flags.listPresets = true;
    else if (a === "--help" || a === "-h") flags.help = true;
    else if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq === -1) {
        console.error(`Unknown option: ${a}`);
        process.exit(2);
      }
      const name = a.slice(0, eq);
      if (!VALUE_FLAGS.has(name)) {
        console.error(`Unknown option: ${name}`);
        process.exit(2);
      }
      applyValueFlag(flags, name, a.slice(eq + 1));
    }
  }
  return flags;
}

function applyValueFlag(flags, name, value) {
  const v = String(value).trim();
  if (name === "--lang") flags.lang = v;
  else if (name === "--dir") flags.dir = v;
  else if (name === "--preset") flags.preset = v;
  else if (name === "--only") flags.only = v.split(",").map((s) => s.trim()).filter(Boolean);
  else if (name === "--skip") flags.skip = v.split(",").map((s) => s.trim()).filter(Boolean);
}

const PRESET_DIR = path.join(REPO, "presets");

/**
 * Read a preset file: one agent name per line, `#` starts a comment.
 * Returns undefined when no preset was requested.
 */
function loadPreset(name) {
  const file = path.join(PRESET_DIR, `${name}.txt`);
  if (!fs.existsSync(file)) {
    const available = fs.existsSync(PRESET_DIR)
      ? fs
          .readdirSync(PRESET_DIR)
          .filter((f) => f.endsWith(".txt"))
          .map((f) => f.replace(/\.txt$/, ""))
          .join(", ")
      : "(none)";
    throw new Error(`Unknown preset "${name}". Available: ${available}`);
  }
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter(Boolean);
}

function listPresets() {
  if (!fs.existsSync(PRESET_DIR)) return [];
  return fs
    .readdirSync(PRESET_DIR)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((f) => {
      const names = loadPreset(f.replace(/\.txt$/, ""));
      return { name: f.replace(/\.txt$/, ""), count: names.length };
    });
}

const USAGE = `Install OpenCode subagents.

Usage:
  ocagents [options]

Options:
  -g, --global          Install into ~/.config/opencode/agents (all projects)
      --dir <path>      Install into a specific directory
      --lang <code>     Description language (default: from system locale)
      --preset <name>   Install a curated subset instead of all 174
      --only <a,b>      Install only the named agents
      --skip <a,b>      Exclude the named agents
      --list-presets    Show available presets and exit
      --dry             Show what would happen without writing files
  -h, --help            Show this help

Examples:
  ocagents --global
  ocagents --preset minimal
  ocagents --global --lang en
  ocagents --dir ./.opencode/agents --only reviewer,debugger`;

function printUsage() {
  console.log(USAGE);
}

/** Only the description line differs between languages; everything else is copied. */
function applyDescription(content, desc) {
  if (desc === undefined) return content;
  const fmEnd = content.indexOf("\n---", 3);
  if (fmEnd === -1) return content;
  const head = content.slice(0, fmEnd);
  const tail = content.slice(fmEnd);
  const m = head.match(/^description: (.*)$/m);
  if (!m) return content;

  const wasQuoted = m[1].startsWith('"');
  const plainSafe = !/^[\s"'&*!|>%@`#\-?:,\[\]{}]|[\s:]$|: |#/.test(desc);
  const value = wasQuoted || !plainSafe ? JSON.stringify(desc) : desc;
  return head.replace(/^description: .*$/m, `description: ${value}`) + tail;
}

function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help) {
    printUsage();
    return;
  }

  if (flags.listPresets) {
    const presets = listPresets();
    if (!presets.length) {
      console.log("No presets found in presets/");
      return;
    }
    console.log("Available presets:");
    for (const p of presets) console.log(`  ${p.name.padEnd(10)} ${p.count} agents`);
    return;
  }

  if (!fs.existsSync(SRC)) {
    console.error(`Agents directory missing: ${SRC}`);
    console.error("Run tools/codex-subagents-to-opencode.mjs first to generate it.");
    process.exit(2);
  }

  const target = flags.dir
    ? path.resolve(expandHome(flags.dir))
    : flags.global
      ? path.join(os.homedir(), ".config", "opencode", "agents")
      : path.resolve(".opencode", "agents");

  const lang = detectLanguage(flags.lang ?? process.env.OPENCODE_SUBAGENTS_LANG, availableLanguages());
  if (lang.invalidOverride) {
    console.error(`No translation table for "${lang.detected}".`);
    console.error(`Available languages: ${availableLanguages().join(", ")}`);
    console.error(`Use --lang=<code> with one of the above, or omit it to follow your system locale.`);
    process.exit(2);
  }
  const table = lang.lang === "en" ? {} : JSON.parse(fs.readFileSync(path.join(I18N, `${lang.lang}.json`), "utf8"));

  const skip = new Set(flags.skip ?? []);
  let files = fs.readdirSync(SRC).filter((f) => f.endsWith(".md")).sort();

  // A preset and --only are both allow-lists; --only wins if both are given.
  let allow = flags.only ?? null;
  if (!allow && flags.preset) {
    try {
      allow = loadPreset(flags.preset);
    } catch (err) {
      console.error(err.message);
      process.exit(2);
    }
  }
  if (allow) files = files.filter((f) => allow.includes(f.replace(/\.md$/, "")));
  files = files.filter((f) => !skip.has(f.replace(/\.md$/, "")));

  if (allow && files.length === 0) {
    console.error("Selection matched no agents. Check the names in the preset.");
    process.exit(2);
  }

  const known = new Set(fs.readdirSync(SRC).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")));
  const unknown = (allow ?? []).filter((n) => !known.has(n));
  if (unknown.length) console.log(`Warning: unknown agent name(s) in selection: ${unknown.join(", ")}`);

  console.log(`Source:    ${SRC}`);
  console.log(`Target:    ${target}`);
  console.log(`Language:  ${lang.lang} (${lang.reason}${lang.detected ? `, detected "${lang.detected}"` : ""})`);
  console.log(
    `Agents:    ${files.length}${flags.preset ? ` (preset "${flags.preset}")` : flags.only ? " (filtered)" : ""}`,
  );
  console.log(`Available: ${availableLanguages().join(", ")}`);

  if (flags.dry) {
    console.log("\n(dry run — nothing written)");
    return;
  }

  fs.mkdirSync(target, { recursive: true });
  let written = 0;
  for (const f of files) {
    const content = fs.readFileSync(path.join(SRC, f), "utf8");
    const name = f.replace(/\.md$/, "");
    fs.writeFileSync(path.join(target, f), applyDescription(content, table[name]), "utf8");
    written++;
  }

  console.log(`\nInstalled ${written} agent(s).`);

  // The right follow-up command depends on how this script was reached. Only a
  // checkout has tools/ on disk; an installed copy (node_modules, or the npx
  // cache) must be driven through its bin instead. Detect that by walking up
  // for a node_modules directory rather than matching the path as a string,
  // which differs between npm versions and platforms.
  let inPackage = false;
  for (let dir = REPO; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "node_modules"))) {
      inPackage = true;
      break;
    }
    if (path.dirname(dir) === dir) break;
  }

  // Prefer a path that still works after the user changes directory. A relative
  // path is only valid from where the install ran, so use ~ for anything under
  // the home directory and an absolute path otherwise.
  const home = os.homedir();
  const inHome = target === home || target.startsWith(home + path.sep);
  const printable = inHome
    ? "~" + target.slice(home.length).split(path.sep).join("/")
    : target.split(path.sep).join("/");
  const dirArg = `--dir=${printable}`;

  const switchCmd = inPackage
    ? `npx --package awesome-codex-subagents-opencode awesome-codex-subagents-opencode-lang --to=<lang> ${dirArg}`
    : `node tools/switch-lang.mjs --to=<lang> ${dirArg}`;

  console.log("");
  console.log("Next steps:");
  console.log("  1. Restart OpenCode so it picks up the new agents.");
  console.log("  2. In a session, type @ and pick an agent, e.g. @reviewer or @debugger.");
  console.log("");
  console.log(`To change the description language later:  ${switchCmd}`);
}

main();
