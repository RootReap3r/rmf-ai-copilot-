// index.js
// ─────────────────────────────────────────────────────────────────
// Backend for the NIST 800-53 Rev4 -> Rev5 AI migration pipeline.
//
//   POST /api/chat            -> proxies to configured LLM provider
//   GET  /api/storage?prefix= -> list keys
//   GET  /api/storage/:key    -> get value
//   POST /api/storage         -> set { key, value }
//   DELETE /api/storage/:key  -> delete key
//   POST /api/storage/clear   -> { prefix } delete all keys with prefix
//   GET  /api/health          -> provider config sanity check
//
// Serves the built frontend from ../client/dist if present.
// ─────────────────────────────────────────────────────────────────

import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { callLLM, config as llmConfig } from "./llm.js";
import * as store from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "25mb" }));

// ── NIST SP 800-53 Rev 5 control catalog (official text + discussion) ────
// Loaded once at startup. Source: NIST SP 800-53 Rev 5 control catalog xlsx
// (https://csrc.nist.gov/files/pubs/sp/800/53/r5/upd1/final/docs/sp800-53r5-control-catalog.xlsx)
let CATALOG = {};
try {
  const catalogPath = path.join(__dirname, "data", "nist-catalog.json");
  CATALOG = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
  console.log(`  Loaded NIST control catalog: ${Object.keys(CATALOG).length} controls/enhancements`);
} catch (e) {
  console.warn("  WARNING: could not load nist-catalog.json — guidance/grounding will be unavailable:", e.message);
}

// ── CCI mapping (Control Correlation Identifiers) ─────────────────────────
// Starter mapping for demo families (AT, MP, PS, PL, MA). For production,
// replace server/data/cci-mapping.json with output from
// server/scripts/parse_cci_xml.py run against the official DISA
// U_CCI_List.xml (https://public.cyber.mil -> STIGs -> CCI).
let CCI_MAP = {};
try {
  const cciPath = path.join(__dirname, "data", "cci-mapping.json");
  CCI_MAP = JSON.parse(fs.readFileSync(cciPath, "utf-8"));
  console.log(`  Loaded CCI mapping: ${Object.keys(CCI_MAP).length} controls`);
} catch (e) {
  console.warn("  No cci-mapping.json found — CCI column in eMASS export will be blank.");
}

app.get("/api/catalog/:id", (req, res) => {
  const id = req.params.id.toUpperCase();
  const entry = CATALOG[id];
  if (!entry) return res.status(404).json({ error: "Control not found in catalog", id });
  res.json({ id, ...entry, ccis: CCI_MAP[id] || [] });
});


// ── Health / config check ────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    provider: llmConfig.PROVIDER,
    baseUrl: llmConfig.BASE_URL,
    model: llmConfig.MODEL,
    apiKeyConfigured: llmConfig.hasKey,
  });
});

// ── LLM proxy ─────────────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { system, user, maxTokens } = req.body || {};
  if (!user) return res.status(400).json({ error: "Missing 'user' field." });
  try {
    const text = await callLLM(system || "", user, maxTokens || 900);
    res.json({ text });
  } catch (err) {
    console.error("LLM call failed:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── Storage: list keys by prefix ─────────────────────────────────
app.get("/api/storage", (req, res) => {
  const prefix = req.query.prefix || "";
  res.json({ keys: store.listKeys(prefix) });
});

// ── Storage: get single key ──────────────────────────────────────
app.get("/api/storage/:key", (req, res) => {
  const value = store.get(req.params.key);
  if (value === null) return res.status(404).json({ error: "Not found" });
  res.json({ key: req.params.key, value });
});

// ── Storage: set key ──────────────────────────────────────────────
app.post("/api/storage", (req, res) => {
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ error: "Missing 'key'." });
  store.set(key, value);
  res.json({ key, value, ok: true });
});

// ── Storage: delete single key ────────────────────────────────────
app.delete("/api/storage/:key", (req, res) => {
  const ok = store.del(req.params.key);
  res.json({ key: req.params.key, deleted: ok });
});

// ── Storage: bulk clear by prefix ─────────────────────────────────
app.post("/api/storage/clear", (req, res) => {
  const { prefix } = req.body || {};
  if (!prefix) return res.status(400).json({ error: "Missing 'prefix'." });
  const count = store.clearPrefix(prefix);
  res.json({ prefix, deleted: count });
});

// ── Serve built frontend (if present) ─────────────────────────────
const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) res.status(200).send(
      "Frontend not built yet. Run `npm run build` in /client, " +
      "or run the client dev server separately (see README)."
    );
  });
});

app.listen(PORT, () => {
  console.log(`\n  NIST Migration Pipeline backend running on http://localhost:${PORT}`);
  console.log(`  LLM provider: ${llmConfig.PROVIDER}  |  model: ${llmConfig.MODEL}`);
  console.log(`  Base URL:     ${llmConfig.BASE_URL}`);
  console.log(`  API key set:  ${llmConfig.hasKey ? "yes" : "NO -- set LLM_API_KEY in .env"}\n`);
});
