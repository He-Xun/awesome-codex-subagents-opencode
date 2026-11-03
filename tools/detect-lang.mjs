#!/usr/bin/env node
/**
 * Detect the user's preferred language and map it to an available
 * description translation table.
 *
 * Resolution order:
 *   1. Explicit override (--lang=xx / OPENCODE_SUBAGENTS_LANG)
 *   2. Environment locale hints (LC_ALL, LC_MESSAGES, LANG, LANGUAGE)
 *   3. The OS locale via Intl
 *   4. Fallback to English
 *
 * Only languages that have a table in tools/i18n/ are selectable; anything
 * else resolves to the fallback, so a French user on a machine with only
 * en/zh tables gets English rather than a broken mix.
 */
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const I18N_DIR = path.join(HERE, "i18n");

export const FALLBACK = "en";

export function availableLanguages() {
  if (!fs.existsSync(I18N_DIR)) return [];
  return fs
    .readdirSync(I18N_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

/** Environment locale hints, in priority order. LANGUAGE may be a `:` list. */
function envLocaleHints() {
  const hints = [];
  for (const key of ["LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"]) {
    const v = process.env[key];
    if (!v) continue;
    for (const part of v.split(":")) if (part) hints.push(part);
  }
  return hints;
}

/** "zh-CN" -> ["zh-CN", "zh"]; "pt_BR.UTF-8" -> ["pt-BR", "pt"]. */
function normalize(code) {
  const cleaned = String(code)
    .trim()
    // Strip charset and modifier suffixes: "ko_KR.UTF-8@mod" -> "ko_KR"
    .replace(/\..*$/, "")
    .split("@")[0]
    .replace(/_/g, "-");
  if (!cleaned || cleaned.toUpperCase() === "C" || cleaned.toUpperCase() === "POSIX") return [];
  const base = cleaned.split("-")[0].toLowerCase();
  return [cleaned.toLowerCase(), base];
}

/**
 * Pick a language code for descriptions.
 * @param {string|undefined} override explicit lang (e.g. from --lang)
 * @param {string[]} [available] table names to choose from
 * @returns {{lang: string, reason: string, detected: string|null}}
 */
export function detectLanguage(override, available = availableLanguages()) {
  if (override) {
    const wanted = String(override).trim().toLowerCase();
    // Accept a regional form too (fr-FR -> fr) since users paste locales.
    for (const code of normalize(wanted)) {
      if (available.includes(code)) return { lang: code, reason: "explicit override", detected: override };
    }
    // An explicit request that cannot be honoured is an error, not a silent
    // fallback: the user asked for a specific language and would otherwise get
    // English without noticing.
    return {
      lang: FALLBACK,
      reason: `no table for "${override}"`,
      detected: override,
      invalidOverride: true,
    };
  }

  // Environment hints win over Intl: an explicit LANG/LC_ALL is the user telling
  // us what they want. If those are set but unsupported, we fall back to English
  // rather than silently re-deriving a different locale from Intl.
  const envHints = envLocaleHints();

  for (const raw of envHints) {
    for (const code of normalize(raw)) {
      if (available.includes(code)) return { lang: code, reason: `environment locale ${raw}`, detected: raw };
    }
  }

  let intl;
  try {
    intl = Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    intl = null;
  }

  if (envHints.length > 0) {
    return {
      lang: FALLBACK,
      reason: `no table for environment locale ${envHints[0]}`,
      detected: envHints[0],
    };
  }

  for (const code of normalize(intl ?? "")) {
    if (available.includes(code)) return { lang: code, reason: `system locale ${intl}`, detected: intl };
  }

  return {
    lang: FALLBACK,
    reason: intl ? `no table for system locale ${intl}` : "no locale detected",
    detected: intl ?? null,
  };
}

// CLI: print the resolved language, useful for the installer and for debugging.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const override = process.argv.find((a) => a.startsWith("--lang="))?.slice(7);
  const result = detectLanguage(override);
  console.log(`detected:  ${result.detected ?? "(unknown)"}`);
  console.log(`language:  ${result.lang}`);
  console.log(`reason:    ${result.reason}`);
  console.log(`available: ${availableLanguages().join(", ")}`);
}
