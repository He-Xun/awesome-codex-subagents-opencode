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

function parseArgs(argv) {
  const flags = {};
  for (const a of argv) {
    if (a === "--global" || a === "-g") flags.global = true;
    else if (a === "--dry") flags.dry = true;
    else if (a.startsWith("--lang=")) flags.lang = a.slice(7).trim();
    else if (a.startsWith("--dir=")) flags.dir = a.slice(6).trim();
    else if (a.startsWith("--only=")) flags.only = a.slice(7).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--skip=")) flags.skip = a.slice(7).split(",").map((s) => s.trim()).filter(Boolean);
  }
  return flags;
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
  const table = lang.lang === "en" ? {} : JSON.parse(fs.readFileSync(path.join(I18N, `${lang.lang}.json`), "utf8"));

  const skip = new Set(flags.skip ?? []);
  let files = fs.readdirSync(SRC).filter((f) => f.endsWith(".md")).sort();
  if (flags.only) files = files.filter((f) => flags.only.includes(f.replace(/\.md$/, "")));
  files = files.filter((f) => !skip.has(f.replace(/\.md$/, "")));

  console.log(`Source:    ${SRC}`);
  console.log(`Target:    ${target}`);
  console.log(`Language:  ${lang.lang} (${lang.reason}${lang.detected ? `, detected "${lang.detected}"` : ""})`);
  console.log(`Agents:    ${files.length}${flags.only ? " (filtered)" : ""}`);
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
  console.log(`Switch language later:  node tools/switch-lang.mjs --to=<lang> --dir=${path.relative(process.cwd(), target) || "."}`);
  console.log("Restart OpenCode to pick up the change.");
}

main();
