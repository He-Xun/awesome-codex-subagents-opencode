// Run `opencode debug agents` and verify the converted agents load correctly.
// Spawning directly avoids PowerShell's stdout redirection re-encoding UTF-8.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const dir = process.argv[2] ?? "./out-zh";

const raw = execFileSync("opencode", ["debug", "agents"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  shell: true,
});

const agents = JSON.parse(raw.slice(raw.indexOf("[")));
const mine = agents.filter((a) => fs.existsSync(`${dir}/${a.id}.md`));

console.log("loaded:", mine.length, "/ 174");
console.log("wrong mode:", mine.filter((a) => a.mode !== "subagent").length);
console.log("no description:", mine.filter((a) => !a.description).length);
console.log("pinned model:", mine.filter((a) => a.model).length);

const r = mine.find((a) => a.id === "reviewer");
console.log("reviewer.description:", r?.description);
