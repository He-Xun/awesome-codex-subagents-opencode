#!/usr/bin/env node
/**
 * npm entry point: `npx awesome-codex-subagents-opencode`.
 *
 * Forwards to the installer so that the published package works from any
 * directory without a checkout.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const installer = path.join(here, "..", "tools", "install.mjs");

const result = spawnSync(process.execPath, [installer, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
