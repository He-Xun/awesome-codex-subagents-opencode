#!/usr/bin/env node
/**
 * One-shot installer: clone-free entry point for people who already have the
 * repository checked out somewhere and want a single command from any shell.
 *
 *   node /path/to/repo/install.mjs              # into ./.opencode/agents
 *   node /path/to/repo/install.mjs --global     # into ~/.config/opencode/agents
 *
 * This is a thin forwarder so the documented command does not depend on the
 * current working directory being the repository root.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, "tools", "install.mjs");

const result = spawnSync(process.execPath, [target, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
