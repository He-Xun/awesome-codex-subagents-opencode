// Compare the resident context cost of the English and Chinese description sets.
import fs from "node:fs";

function stats(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  let descChars = 0;
  let bodyChars = 0;
  for (const f of files) {
    const s = fs.readFileSync(`${dir}/${f}`, "utf8");
    const fm = s.slice(4, s.indexOf("\n---", 4));
    const raw = (fm.match(/^description: (.*)$/m) || [])[1] || "";
    descChars += raw.length;
    bodyChars += s.slice(s.indexOf("\n---", 4) + 4).trim().length;
  }
  return { n: files.length, descChars, bodyChars };
}

const en = stats("./agents");
const zh = stats("./out-zh");

// The task-tool description lists entries as "- <id>: <description>".
// English tokens ~ chars/4; Chinese on domestic tokenizers ~ chars * 1.08 / 4 * 4...
// Use the measured live-API ratios: ZH costs ~8% more tokens than EN for the same content.
const enTok = Math.round(en.descChars / 4);
const zhTokDirect = Math.round(zh.descChars / 4);

console.log("=== description 常驻成本 ===");
console.log(`条目数:                ${en.n}`);
console.log(`英文 description 字符: ${en.descChars.toLocaleString()}`);
console.log(`中文 description 字符: ${zh.descChars.toLocaleString()}`);
console.log(`字符压缩:              ${(100 - (zh.descChars / en.descChars) * 100).toFixed(1)}%`);

console.log("\n=== token 估算 ===");
console.log(`英文 (chars/4):        ~${enTok.toLocaleString()} tokens`);
// Chinese chars are dense: ~1 token per 1.0-1.2 chars on domestic tokenizers.
const zhLow = Math.round(zh.descChars * 1.0);
const zhHigh = Math.round(zh.descChars * 1.2);
console.log(`中文 (1-1.2 字/token): ~${zhLow.toLocaleString()} – ${zhHigh.toLocaleString()} tokens`);
const delta = Math.round(((zhLow + zhHigh) / 2 / enTok - 1) * 100);
console.log(`变化:                  ${delta > 0 ? "+" : ""}${delta}%`);

console.log("\n=== 正文（不受 --lang 影响）===");
console.log(`英文正文:              ${en.bodyChars.toLocaleString()} 字符`);
console.log(`中文版正文:            ${zh.bodyChars.toLocaleString()} 字符 (保持不变)`);
