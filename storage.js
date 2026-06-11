// storage.js
// ─────────────────────────────────────────────────────────────────
// Simple file-backed key-value store. Replaces Claude.ai's
// window.storage API so progress persists across runs/restarts.
//
// For multi-user / team deployments, swap this module for a real
// database (Postgres, DynamoDB, etc.) — the get/set/list/del
// function signatures are the only contract the rest of the app
// depends on.
// ─────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

const STORAGE_FILE = process.env.STORAGE_FILE || "./data/storage.json";

function ensureFile() {
  const dir = path.dirname(STORAGE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORAGE_FILE)) fs.writeFileSync(STORAGE_FILE, "{}");
}

function readAll() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(STORAGE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeAll(obj) {
  ensureFile();
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(obj, null, 2));
}

export function get(key) {
  const all = readAll();
  return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : null;
}

export function set(key, value) {
  const all = readAll();
  all[key] = value;
  writeAll(all);
  return true;
}

export function del(key) {
  const all = readAll();
  if (Object.prototype.hasOwnProperty.call(all, key)) {
    delete all[key];
    writeAll(all);
    return true;
  }
  return false;
}

export function listKeys(prefix = "") {
  const all = readAll();
  return Object.keys(all).filter(k => k.startsWith(prefix));
}

export function clearPrefix(prefix) {
  const all = readAll();
  let count = 0;
  for (const k of Object.keys(all)) {
    if (k.startsWith(prefix)) { delete all[k]; count++; }
  }
  writeAll(all);
  return count;
}
