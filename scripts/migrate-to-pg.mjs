// One-time migration: local ./data/*.json files -> the Postgres store.
//
// Used when moving a running deployment to Vercel, where the filesystem is
// read-only. Reads every JSON file in the data directory and upserts it under
// its key into store_entries (the same table lib/store.js uses).
//
// Usage:
//   POSTGRES_URL=postgres://... node scripts/migrate-to-pg.mjs [--dry-run]
//   (or `npm run migrate:pg -- --dry-run`; reads POSTGRES_URL from the env)
//
// Prints key names and counts only — never the stored values (they include
// password hashes and session records).

import fs from "fs";
import path from "path";
import pg from "pg";

const { Pool } = pg;

const dryRun = process.argv.includes("--dry-run");
const dataDir = path.join(process.cwd(), "data");

const connectionString =
  (typeof process.env.POSTGRES_URL === "string" && process.env.POSTGRES_URL.trim()) ||
  (typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim()) ||
  "";

if (!connectionString) {
  console.error("POSTGRES_URL (or DATABASE_URL) is not set — nothing to migrate to.");
  process.exit(1);
}

if (!fs.existsSync(dataDir)) {
  console.error(`No ${dataDir} directory — nothing to migrate.`);
  process.exit(0);
}

const files = fs
  .readdirSync(dataDir)
  .filter((f) => f.endsWith(".json"))
  .filter((f) => !f.includes(".corrupt-"))
  .sort();

if (files.length === 0) {
  console.log("data/ has no JSON files — nothing to migrate.");
  process.exit(0);
}

const url = new URL(connectionString);
if ((url.protocol === "postgres:" || url.protocol === "postgresql:") && !url.searchParams.has("sslmode")) {
  url.searchParams.set("sslmode", "require");
}

const pool = new Pool({ connectionString: url.toString(), max: 2 });

const entries = [];
for (const file of files) {
  const key = file.replace(/\.json$/, "");
  const raw = fs.readFileSync(path.join(dataDir, file), "utf8");
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    console.error(`skip  ${key} — invalid JSON (not migrated)`);
    continue;
  }
  entries.push({ key, value });
}

console.log(`${entries.length} file(s) to migrate from ${dataDir} (${dryRun ? "dry run" : "writing…"}):`);

if (dryRun) {
  for (const { key, value } of entries) {
    const count = Array.isArray(value)
      ? `${value.length} item(s)`
      : value && typeof value === "object"
        ? `${Object.keys(value).length} entr(ies)`
        : typeof value;
    console.log(`  would upsert "${key}" — ${count}`);
  }
  await pool.end();
  process.exit(0);
}

await pool.query(`
  CREATE TABLE IF NOT EXISTS store_entries (
    name       TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`);

let migrated = 0;
for (const { key, value } of entries) {
  await pool.query(
    `INSERT INTO store_entries (name, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value === undefined ? null : value)]
  );
  migrated++;
  console.log(`  upserted "${key}"`);
}

const { rows } = await pool.query("SELECT count(*)::int AS n FROM store_entries");
console.log(`done: ${migrated} key(s) migrated; store_entries now holds ${rows[0].n} row(s).`);

await pool.end();
