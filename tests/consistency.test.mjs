// Release-consistency checks. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = f => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const swVersion = read("sw.js").match(/homegym-shell-v([\d.]+)/)?.[1];

test("service worker cache version matches app version label", () => {
  assert.ok(swVersion, "CACHE_NAME version not found");
  assert.match(read("app-redesign.js"), new RegExp(`APP_VERSION = "v${swVersion.replace(/\./g, "\\.")}"`));
});

test("index.html asset query strings match the release version", () => {
  const versions = [...read("index.html").matchAll(/\?v=([\d.]+)/g)].map(m => m[1]);
  assert.ok(versions.length > 0);
  for (const v of versions) assert.equal(v, swVersion);
  const gate = read("auth-gate.js");
  for (const v of [...gate.matchAll(/\?v=([\d.]+)/g)].map(m => m[1])) assert.equal(v, swVersion);
});

test("every local file in the service worker shell exists", () => {
  const shell = read("sw.js").match(/REQUIRED_SHELL = \[([\s\S]*?)\]/)[1];
  const files = [...shell.matchAll(/"\.\/([^"]*)"/g)].map(m => m[1]).filter(Boolean);
  for (const f of files) assert.ok(fs.existsSync(new URL(`../${f}`, import.meta.url)), `${f} missing`);
});

test("database rules are valid JSON and not open to the public", () => {
  const rules = JSON.parse(read("database.rules.json")).rules;
  assert.equal(rules[".read"], false);
  assert.equal(rules[".write"], false);
  assert.ok(!JSON.stringify(rules).includes(": true"));
});

test("auth allow-list matches the database rules", () => {
  const emails = [...read("auth-gate.js").match(/ALLOWED_EMAILS = \[([^\]]*)\]/)[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
  const rules = read("database.rules.json");
  assert.ok(emails.length > 0);
  for (const e of emails) assert.ok(rules.includes(e), `${e} missing from database.rules.json`);
});

test("Firestore stays disabled until a database exists", () => {
  assert.match(read("firebase-config.js"), /HG_ENABLE_FIRESTORE = false/);
});

test("household pin default is configured for automated sync", () => {
  assert.match(read("firebase-config.js"), /HOUSEHOLD_PIN_DEFAULT = "[a-f0-9]{32}"/);
});
