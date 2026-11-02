// Compare the resident context cost of the description tables.
//
// English baseline comes from agents/; other languages come from
// tools/i18n/<lang>.json. No second output directory is needed.
import fs from "node:fs";

const agents = fs.readdirSync("./agents").filter((f) => f.endsWith(".md"));

function englishStats() {
  let descChars = 0;
  let bodyChars = 0;
  for (const f of agents) {
    const s = fs.readFileSync(`./agents/${f}`, "utf8");
    const fm = s.slice(4, s.indexOf("\n---", 4));
    descChars += (fm.match(/^description: (.*)$/m) || [])[1].length;
    bodyChars += s.slice(s.indexOf("\n---", 4) + 4).trim().length;
  }
  return { descChars, bodyChars };
}

function tableStats(lang) {
  const table = JSON.parse(fs.readFileSync(`./tools/i18n/${lang}.json`, "utf8"));
  const values = Object.values(table);
  return {
    descChars: values.reduce((a, v) => a + JSON.stringify(v).length, 0),
    count: values.length,
  };
}

const en = englishStats();
console.log("=== description 常驻成本 ===");
console.log(`条目数:              ${agents.length}`);
console.log(`英文 description:    ${en.descChars.toLocaleString()} 字符`);

const enTok = Math.round(en.descChars / 4);
console.log(`英文 token (÷4):     ~${enTok.toLocaleString()}`);

const langs = fs
  .readdirSync("./tools/i18n")
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => f.replace(/\.json$/, ""))
  .filter((l) => l !== "en")
  .sort();

if (langs.length) {
  console.log("\n=== 其他语言 vs 英文 ===");
  for (const lang of langs) {
    const zh = tableStats(lang);
    // Chinese chars are dense: ~1.0-1.2 tokens each on domestic tokenizers.
    const lo = Math.round(zh.descChars * 1.0);
    const hi = Math.round(zh.descChars * 1.2);
    const mid = (lo + hi) / 2;
    const delta = Math.round((mid / enTok - 1) * 100);
    console.log(
      `${lang}:  ${zh.descChars.toLocaleString()} 字符 ` +
        `(${(100 - (zh.descChars / en.descChars) * 100).toFixed(0)}% fewer than en), ` +
        `~${lo.toLocaleString()}-${hi.toLocaleString()} tokens, ${delta > 0 ? "+" : ""}${delta}%`,
    );
  }
}

console.log("\n=== prompt 正文（不随语言变化）===");
console.log(`字符数:              ${en.bodyChars.toLocaleString()}`);
