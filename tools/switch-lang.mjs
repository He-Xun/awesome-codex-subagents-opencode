#!/usr/bin/env node
/**
 * Switch the description language of installed agents in place.
 *
 * The agents' prompt bodies stay English; only the YAML `description` field is
 * swapped. That keeps switching cheap (a description is one line) and makes
 * the @-menu readable in whatever language you prefer.
 *
 *   node tools/switch-lang.mjs --to=zh                    # .opencode/agents
 *   node tools/switch-lang.mjs --to=en --dir=~/.config/opencode/agents
 *   node tools/switch-lang.mjs --list                     # available languages
 *   node tools/switch-lang.mjs --to=zh --dry
 *
 * Translations live in tools/i18n/<lang>.json keyed by agent name.
 * `en` is not a table: it uses the original descriptions stored alongside
 * the translations in tools/i18n/en.json.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const I18N_DIR = path.join(HERE, "i18n");

function expandHome(p) {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function parseArgs(argv) {
  const flags = {};
  for (const a of argv) {
    if (a.startsWith("--to=")) flags.to = a.slice(5).trim();
    else if (a.startsWith("--dir=")) flags.dir = a.slice(6).trim();
    else if (a === "--dry") flags.dry = true;
    else if (a === "--list") flags.list = true;
    else if (a.startsWith("--i18n=")) flags.i18n = a.slice(7).trim();
  }
  return flags;
}

function availableLanguages() {
  if (!fs.existsSync(I18N_DIR)) return [];
  return fs
    .readdirSync(I18N_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

function loadTable(lang) {
  const file = path.join(I18N_DIR, `${lang}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`No translation table for "${lang}". Available: ${availableLanguages().join(", ")}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Replace only the `description:` line inside the YAML frontmatter.
 * Everything else in the file is left byte-for-byte untouched.
 *
 * The original quoting style is preserved: if the old value was unquoted we
 * keep it unquoted when that is still valid YAML, so switching languages and
 * back produces no gratuitous diff.
 */
function replaceDescription(content, newDesc) {
  const fmStart = content.indexOf("---");
  if (fmStart !== 0) return null;
  const fmEnd = content.indexOf("\n---", 3);
  if (fmEnd === -1) return null;

  const head = content.slice(0, fmEnd);
  const tail = content.slice(fmEnd);
  const m = head.match(/^description: (.*)$/m);
  if (!m) return null;

  const wasQuoted = m[1].startsWith('"');
  // A plain scalar is only safe without quotes if it has no YAML-significant
  // leading/trailing characters and no ": " sequence.
  const plainSafe = !/^[\s"'&*!|>%@`#\-?:,\[\]{}]|[\s:]$|: |#/.test(newDesc);
  const value = wasQuoted || !plainSafe ? JSON.stringify(newDesc) : newDesc;

  return head.replace(/^description: .*$/m, `description: ${value}`) + tail;
}

function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.list) {
    const langs = availableLanguages();
    if (!langs.length) {
      console.log("No translation tables found in tools/i18n/");
      return;
    }
    console.log("Available description languages:");
    for (const l of langs) {
      const table = loadTable(l);
      console.log(`  ${l.padEnd(4)} ${Object.keys(table).length} entries`);
    }
    return;
  }

  if (!flags.to) {
    console.error("Usage: node tools/switch-lang.mjs --to=<lang> [--dir=<agents dir>] [--dry] [--list]");
    process.exit(2);
  }

  const dir = path.resolve(expandHome(flags.dir ?? ".opencode/agents"));
  if (!fs.existsSync(dir)) {
    console.error(`Agents directory not found: ${dir}`);
    process.exit(2);
  }

  const table = loadTable(flags.to);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));

  let changed = 0;
  let unchanged = 0;
  const missing = [];

  for (const f of files) {
    const name = f.replace(/\.md$/, "");
    const file = path.join(dir, f);
    const desc = table[name];

    if (desc === undefined) {
      missing.push(name);
      continue;
    }

    const before = fs.readFileSync(file, "utf8");
    const after = replaceDescription(before, desc);
    if (after === null) {
      missing.push(`${name} (no description field)`);
      continue;
    }

    if (after === before) {
      unchanged++;
      continue;
    }

    if (!flags.dry) fs.writeFileSync(file, after, "utf8");
    changed++;
  }

  console.log(`Language: ${flags.to}${flags.dry ? " (dry run)" : ""}`);
  console.log(`Directory: ${dir}`);
  console.log(`Files: ${files.length} | changed: ${changed} | already current: ${unchanged}`);
  if (missing.length) {
    console.log(`No entry for ${missing.length} agent(s): ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? " …" : ""}`);
  }
}

main();
