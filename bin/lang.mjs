#!/usr/bin/env node
/**
 * npm entry point: `npx awesome-codex-subagents-opencode-lang --to zh`.
 *
 * Forwards to the language switcher so the published package can change
 * descriptions without a checkout.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const switcher = path.join(here, "..", "tools", "switch-lang.mjs");

const result = spawnSync(process.execPath, [switcher, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
