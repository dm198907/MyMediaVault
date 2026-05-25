import express from "express";
import Database from "better-sqlite3";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = 3001;
const DB_PATH = path.join(__dirname, "vault.db");

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ── Init DB ──────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS omdb_cache (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    cached_at  INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS season_cache (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    cached_at  INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS overrides (
    key        TEXT PRIMARY KEY,
    imdb_id    TEXT NOT NULL,
    saved_at   INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL
  );
`);

// ── Helpers ───────────────────────────────────────────────────────────────────
const getAll  = (tbl)       => db.prepare(`SELECT * FROM ${tbl}`).all();
const getOne  = (tbl, id)   => db.prepare(`SELECT * FROM ${tbl} WHERE id=?`).get(id);
const upsert  = (tbl, id, data) =>
  db.prepare(`INSERT INTO ${tbl}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, cached_at=strftime('%s','now')`)
    .run(id, JSON.stringify(data));
const del     = (tbl, id)   => db.prepare(`DELETE FROM ${tbl} WHERE id=?`).run(id);
const delAll  = (tbl)       => db.prepare(`DELETE FROM ${tbl}`).run();

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get("/api/stats", (req, res) => {
  const stat = (tbl) => db.prepare(`SELECT COUNT(*) as n FROM ${tbl}`).get().n;
  const size = (() => { try { return require("fs").statSync(DB_PATH).size; } catch { return 0; } })();
  res.json({
    cache:     stat("omdb_cache"),
    seasons:   stat("season_cache"),
    overrides: stat("overrides"),
    dbPath:    DB_PATH,
    dbSize:    size,
  });
});

// ── OMDb Cache ────────────────────────────────────────────────────────────────
app.get("/api/cache", (req, res) => {
  const rows = getAll("omdb_cache");
  const out = {};
  rows.forEach(r => { try { out[r.id] = { ...JSON.parse(r.data), _cachedAt: r.cached_at }; } catch {} });
  res.json(out);
});

app.get("/api/cache/:id", (req, res) => {
  const row = getOne("omdb_cache", req.params.id);
  if (!row) return res.json(null);
  try { res.json({ ...JSON.parse(row.data), _cachedAt: row.cached_at }); }
  catch { res.json(null); }
});

app.post("/api/cache", (req, res) => {
  const { id, data } = req.body;
  if (!id || !data) return res.status(400).json({ error: "id and data required" });
  upsert("omdb_cache", id, data);
  res.json({ ok: true });
});

app.delete("/api/cache/:id", (req, res) => {
  del("omdb_cache", req.params.id);
  res.json({ ok: true });
});

// ── Season Cache ──────────────────────────────────────────────────────────────
app.get("/api/seasons", (req, res) => {
  const rows = getAll("season_cache");
  const out = {};
  rows.forEach(r => { try { out[r.id] = JSON.parse(r.data); } catch {} });
  res.json(out);
});

app.get("/api/seasons/:id", (req, res) => {
  const row = getOne("season_cache", req.params.id);
  if (!row) return res.json(null);
  try { res.json(JSON.parse(row.data)); } catch { res.json(null); }
});

app.post("/api/seasons", (req, res) => {
  const { id, data } = req.body;
  if (!id || !data) return res.status(400).json({ error: "id and data required" });
  upsert("season_cache", id, data);
  res.json({ ok: true });
});

app.delete("/api/seasons/:id", (req, res) => {
  del("season_cache", req.params.id);
  res.json({ ok: true });
});

// ── Overrides ─────────────────────────────────────────────────────────────────
app.get("/api/overrides", (req, res) => {
  const rows = db.prepare("SELECT * FROM overrides").all();
  const out = {};
  rows.forEach(r => { out[r.key] = { imdbId: r.imdb_id, savedAt: r.saved_at * 1000 }; });
  res.json(out);
});

app.post("/api/overrides", (req, res) => {
  const { key, imdbId } = req.body;
  if (!key || !imdbId) return res.status(400).json({ error: "key and imdbId required" });
  db.prepare("INSERT INTO overrides(key,imdb_id) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET imdb_id=excluded.imdb_id, saved_at=strftime('%s','now')").run(key, imdbId);
  res.json({ ok: true });
});

app.delete("/api/overrides/:key", (req, res) => {
  db.prepare("DELETE FROM overrides WHERE key=?").run(decodeURIComponent(req.params.key));
  res.json({ ok: true });
});

// ── Settings (API key etc) ────────────────────────────────────────────────────
app.get("/api/settings/:key", (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(req.params.key);
  res.json(row ? row.value : null);
});

app.post("/api/settings", (req, res) => {
  const { key, value } = req.body;
  db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
  res.json({ ok: true });
});

// ── Export / Import ───────────────────────────────────────────────────────────
app.get("/api/export", (req, res) => {
  const cache     = {};
  const seasons   = {};
  const overrides = {};
  getAll("omdb_cache").forEach(r   => { try { cache[r.id]     = JSON.parse(r.data); } catch {} });
  getAll("season_cache").forEach(r => { try { seasons[r.id]   = JSON.parse(r.data); } catch {} });
  db.prepare("SELECT * FROM overrides").all().forEach(r => {
    overrides[r.key] = { imdbId: r.imdb_id, savedAt: r.saved_at * 1000 };
  });
  res.setHeader("Content-Disposition", "attachment; filename=rvault-db.json");
  res.json({ cache, seasons, overrides, exportedAt: new Date().toISOString() });
});

app.post("/api/import", (req, res) => {
  const { cache={}, seasons={}, overrides={} } = req.body;
  const importMany = db.transaction(() => {
    Object.entries(cache).forEach(([id, data])     => upsert("omdb_cache",    id, data));
    Object.entries(seasons).forEach(([id, data])   => upsert("season_cache",  id, data));
    Object.entries(overrides).forEach(([key, val]) => {
      db.prepare("INSERT INTO overrides(key,imdb_id) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET imdb_id=excluded.imdb_id").run(key, val.imdbId);
    });
  });
  importMany();
  res.json({ ok: true, imported: { cache: Object.keys(cache).length, seasons: Object.keys(seasons).length, overrides: Object.keys(overrides).length }});
});

app.delete("/api/clear", (req, res) => {
  delAll("omdb_cache"); delAll("season_cache"); delAll("overrides");
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  🗄  Vault DB server running`);
  console.log(`  ➜  API:  http://0.0.0.0:${PORT}/api`);
  console.log(`  ➜  DB:   ${DB_PATH}\n`);
});
