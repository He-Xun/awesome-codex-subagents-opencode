// Analyze converted agents to decide: skill vs subagent, and what to keep.
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? "./out/agents";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));

const rows = files.map((f) => {
  const s = fs.readFileSync(path.join(dir, f), "utf8");
  const fmEnd = s.indexOf("\n---", 4);
  const fm = s.slice(4, fmEnd);
  const body = s.slice(fmEnd + 4).trim();
  const desc = (fm.match(/^description: (.*)$/m) || [])[1] ?? "";
  const cleanDesc = desc.replace(/^"|"$/g, "").replace(/\\"/g, '"');
  return {
    name: f.replace(/\.md$/, ""),
    desc: cleanDesc,
    descLen: cleanDesc.length,
    len: body.length,
    readonly: /^\s*edit: deny/m.test(fm),
  };
});

// ---- 1. context cost of the description table -------------------------------
const totalDesc = rows.reduce((s, r) => s + r.name.length + r.descLen + 4, 0);
console.log("=== 常驻上下文成本 ===");
console.log(`agent 数: ${rows.length}`);
console.log(`description 合计: ${totalDesc} 字符 ≈ ${Math.round(totalDesc / 3.5)} tokens (中英混合粗估)`);

// ---- 2. description style: is it written to trigger, or to describe? --------
const startsWithUse = rows.filter((r) => /^(Use|use)\b/.test(r.desc));
console.log(`\n=== description 触发友好度 ===`);
console.log(`以 "Use when..." 开头 (触发导向): ${startsWithUse.length}/${rows.length}`);
console.log(`平均 description 长度: ${Math.round(rows.reduce((s, r) => s + r.descLen, 0) / rows.length)} 字符`);

// ---- 3. body size buckets: which ones are "read-heavy" (long procedure) ----
console.log(`\n=== prompt 长度分布 ===`);
const buckets = { "<1k": 0, "1-2k": 0, "2-3k": 0, "3-4k": 0, ">=4k": 0 };
for (const r of rows) {
  if (r.len < 1000) buckets["<1k"]++;
  else if (r.len < 2000) buckets["1-2k"]++;
  else if (r.len < 3000) buckets["2-3k"]++;
  else if (r.len < 4000) buckets["3-4k"]++;
  else buckets[">=4k"]++;
}
console.log(buckets);

// ---- 4. structural check: do they share a template? ------------------------
const sections = {};
for (const f of files) {
  const s = fs.readFileSync(path.join(dir, f), "utf8");
  for (const m of s.matchAll(/^(Working mode|Focus on|Quality checks|Return|When to use)[:]/gm)) {
    sections[m[1]] = (sections[m[1]] || 0) + 1;
  }
}
console.log(`\n=== 模板化程度（说明是同质化生成，个性有限） ===`);
console.log(sections);

// ---- 5. overlap: near-duplicate names that will compete for routing -------
console.log(`\n=== 名称近重复（自动路由会互相抢）===`);
const stems = new Map();
for (const r of rows) {
  const stem = r.name.replace(/-(pro|expert|specialist|engineer|developer|architect|admin)$/, "");
  if (!stems.has(stem)) stems.set(stem, []);
  stems.get(stem).push(r.name);
}
let dupCount = 0;
for (const [stem, list] of stems) {
  if (list.length > 1) {
    dupCount++;
    console.log(`  ${stem}: ${list.join(", ")}`);
  }
}
console.log(`近重复组数: ${dupCount}`);

// ---- 6. read-only agents: candidates for isolated-context subagents -------
const ro = rows.filter((r) => r.readonly).sort((a, b) => b.len - a.len);
console.log(`\n=== 只读类 (${ro.length} 个) 按 prompt 长度排序，前 12 个是「重读取」候选 ===`);
for (const r of ro.slice(0, 12)) {
  console.log(`  ${r.name.padEnd(28)} ${String(r.len).padStart(5)}  ${r.desc.slice(0, 70)}`);
}

fs.writeFileSync("./_analysis.json", JSON.stringify(rows, null, 2));
