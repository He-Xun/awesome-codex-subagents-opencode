// Verify that the agents in a directory are actually loaded by OpenCode.
// Spawning directly avoids PowerShell's stdout redirection re-encoding UTF-8.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? "./agents");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
const names = new Set(files.map((f) => f.replace(/\.md$/, "")));

const raw = execFileSync("opencode", ["debug", "agents"], {
  encoding: "buffer",
  maxBuffer: 64 * 1024 * 1024,
  shell: true,
}).toString("utf8");

const agents = JSON.parse(raw.slice(raw.indexOf("[")));
const loaded = agents.filter((a) => names.has(a.id));

console.log(`directory:      ${dir}`);
console.log(`files on disk:  ${files.length}`);
console.log(`loaded by opencode: ${loaded.length}`);
console.log(`wrong mode:     ${loaded.filter((a) => a.mode !== "subagent").length}`);
console.log(`no description: ${loaded.filter((a) => !a.description).length}`);
console.log(`pinned model:   ${loaded.filter((a) => a.model).length}`);

const notLoaded = [...names].filter((n) => !loaded.some((a) => a.id === n));
if (notLoaded.length) console.log(`NOT loaded:     ${notLoaded.slice(0, 10).join(", ")}${notLoaded.length > 10 ? " …" : ""}`);

const sample = loaded.find((a) => a.id === "reviewer");
if (sample) console.log(`\nreviewer.description:\n  ${sample.description}`);
