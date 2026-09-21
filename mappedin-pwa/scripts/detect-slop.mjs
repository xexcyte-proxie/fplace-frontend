#!/usr/bin/env node
/**
 * Report copy-paste and UI-layer IO slop. Does not rewrite files.
 * Usage: npm run slop
 * Exit 1 only for UI files that parse JSON, fetch, or import datasources.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

/** @typedef {{ kind: 'error' | 'warning'; file: string; line: number; message: string }} Finding */

/** @type {Finding[]} */
const findings = [];

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * @param {string} file
 * @returns {boolean}
 */
function isTestFile(file) {
  return /\.test\.ts$/.test(file);
}

/**
 * @param {string} file
 * @returns {boolean}
 */
function isUiFile(file) {
  return file.includes(`${path.sep}src${path.sep}ui${path.sep}`);
}

/**
 * @param {string} file
 * @returns {string}
 */
function rel(file) {
  return path.relative(path.join(srcRoot, '..'), file);
}

const files = walk(srcRoot);
/** @type {Map<string, { file: string; line: number }[]>} */
const escapeHtmlDefs = new Map();
/** @type {Map<string, { file: string; line: number }[]>} */
const initialsDefs = new Map();

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    if (/function\s+escapeHtml\s*\(/.test(line)) {
      const bucket = escapeHtmlDefs.get('escapeHtml') ?? [];
      bucket.push({ file, line: lineNo });
      escapeHtmlDefs.set('escapeHtml', bucket);
    }
    if (/function\s+initialsFromName\s*\(/.test(line)) {
      const bucket = initialsDefs.get('initialsFromName') ?? [];
      bucket.push({ file, line: lineNo });
      initialsDefs.set('initialsFromName', bucket);
    }
    if (/function\s+escapeNotNeeded\s*\(/.test(line)) {
      findings.push({
        kind: 'warning',
        file: rel(file),
        line: lineNo,
        message: 'no-op escape helper (escapeNotNeeded)',
      });
    }

    if (!isUiFile(file) || isTestFile(file)) return;

    if (/\bJSON\.parse\s*\(/.test(line)) {
      findings.push({
        kind: 'error',
        file: rel(file),
        line: lineNo,
        message: 'UI file parses JSON — move to a datasource/mapper',
      });
    }
    if (/\bfetch\s*\(/.test(line)) {
      findings.push({
        kind: 'error',
        file: rel(file),
        line: lineNo,
        message: 'UI file calls fetch — go through a repository',
      });
    }
    if (/\blocalStorage\b/.test(line)) {
      findings.push({
        kind: 'error',
        file: rel(file),
        line: lineNo,
        message: 'UI file uses localStorage — go through a local datasource',
      });
    }
    if (/from\s+['"][^'"]*\/datasources\/[^'"]+['"]/.test(line)) {
      findings.push({
        kind: 'error',
        file: rel(file),
        line: lineNo,
        message: 'UI file imports a datasource',
      });
    }
  });
}

const CANONICAL_ESCAPE = `${path.sep}ui${path.sep}escape-html.ts`;
const escapeCopies = (escapeHtmlDefs.get('escapeHtml') ?? []).filter(
  (copy) => !copy.file.endsWith(CANONICAL_ESCAPE),
);
if (escapeCopies.length) {
  for (const copy of escapeCopies) {
    findings.push({
      kind: 'warning',
      file: rel(copy.file),
      line: copy.line,
      message: `duplicate escapeHtml (${escapeCopies.length} local copies) — import from ui/escape-html.ts after that screen is locked`,
    });
  }
}

const CANONICAL_INITIALS = `${path.sep}auth${path.sep}domain${path.sep}display-initials.ts`;
const initialsCopies = (initialsDefs.get('initialsFromName') ?? []).filter(
  (copy) => !copy.file.endsWith(CANONICAL_INITIALS),
);
if (initialsCopies.length) {
  for (const copy of initialsCopies) {
    findings.push({
      kind: 'warning',
      file: rel(copy.file),
      line: copy.line,
      message: `duplicate initialsFromName (${initialsCopies.length} other copies) — do not unify fallbacks without tests`,
    });
  }
}

findings.sort((a, b) => {
  if (a.kind !== b.kind) return a.kind === 'error' ? -1 : 1;
  return a.file.localeCompare(b.file) || a.line - b.line;
});

const errors = findings.filter((item) => item.kind === 'error');
const warnings = findings.filter((item) => item.kind === 'warning');

function printGroup(title, items) {
  if (!items.length) return;
  console.log(`${title} (${items.length})`);
  for (const item of items) {
    console.log(`  ${item.file}:${item.line}  ${item.message}`);
  }
  console.log('');
}

printGroup('Errors', errors);
printGroup('Warnings', warnings);

if (!findings.length) {
  console.log('No slop findings.');
} else {
  console.log(
    `${errors.length} error(s), ${warnings.length} warning(s). Fix one locked slice at a time.`,
  );
}

process.exit(errors.length ? 1 : 0);
