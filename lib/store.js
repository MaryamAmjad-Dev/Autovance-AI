// Persistence layer.
//
// One async interface with two interchangeable backends, chosen from the
// environment on first use:
//
//   - JSON files under ./data  — local dev and tests, no configuration.
//   - Postgres (Neon)          — Vercel/serverless, where the filesystem is
//                                read-only. Used when POSTGRES_URL (or
//                                DATABASE_URL) is set.
//
// Interface (all operations return promises):
//
//   get(name, fallback)                -> Promise<value>
//   set(name, value)                   -> Promise<void>
//   update(name, fallback, fn)         -> Promise<fn's return value>
//     Locks the single entry for the duration of fn: fn receives the current
//     value, mutates it in place, and may return anything the caller needs.
//     The mutated value is persisted before the lock is released; if fn
//     throws, nothing is written and the error rethrows. On Postgres the lock
//     is a row lock inside a transaction (safe across serverless instances);
//     on files the whole read/mutate/write runs synchronously (safe within
//     the process). This is how concurrent signups, single-use reset tokens
//     and cron edits stay correct.
//   kind: "file" | "postgres"
//   dir:  data directory (file backend only)
//
// createStore(dir) stays injectable so tests can use a temp directory.

import fs from "fs";
import path from "path";
import pg from "pg";

const { Pool } = pg;

// ------------------------------------------------------------- file backend

function fileStore(dataDir) {
  const fileFor = (name) => {
    const safe = String(name).replace(/[^a-z0-9_-]/gi, "_");
    return path.join(dataDir, `${safe}.json`);
  };

  const readSync = (name, fallback = null) => {
    const file = fileFor(name);
    try {
      const raw = fs.readFileSync(file, "utf8");
      try {
        const parsed = JSON.parse(raw);
        return parsed === null || parsed === undefined ? fallback : parsed;
      } catch (parseErr) {
        // Corrupt or truncated JSON: preserve the original under a backup name
        // so the NEXT WRITE cannot silently destroy whatever was inside, then
        // start with the fallback. The backup keeps the data recoverable.
        try {
          fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
          console.error(`[store] "${name}" contained invalid JSON; a backup was kept and the store starts empty.`);
        } catch {
          console.error(`[store] "${name}" contained invalid JSON and could not be backed up.`);
        }
        return fallback;
      }
    } catch (err) {
      if (err.code === "ENOENT") return fallback; // missing file -> no data yet
      // Permission/IO error: throwing is deliberate. Returning the fallback
      // here would let the next write overwrite real data we could not read.
      console.error(`[store] could not read "${name}": ${err.code || err.message}`);
      throw err;
    }
  };

  const writeSync = (name, data) => {
    fs.mkdirSync(dataDir, { recursive: true });
    const target = fileFor(name);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, target);
  };

  return {
    kind: "file",
    dir: dataDir,
    async get(name, fallback = null) {
      return readSync(name, fallback);
    },
    async set(name, value) {
      writeSync(name, value);
    },
    async update(name, fallback, fn) {
      // Synchronous read/mutate/write: no await can interleave inside this
      // process, so the same atomicity the original sync store had.
      const current = readSync(name, fallback);
      const result = fn(current);
      writeSync(name, current);
      return result;
    }
  };
}

// ---------------------------------------------------------- postgres backend

function postgresStore(connectionString) {
  const url = new URL(connectionString);
  if ((url.protocol === "postgres:" || url.protocol === "postgresql:") && !url.searchParams.has("sslmode")) {
    url.searchParams.set("sslmode", "require");
  }
  const pool = new Pool({ connectionString: url.toString(), max: 5 });

  let ready = null;
  const ensureTable = () => {
    if (!ready) {
      ready = pool.query(`
        CREATE TABLE IF NOT EXISTS store_entries (
          name       TEXT PRIMARY KEY,
          value      JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      ready.catch(() => {
        ready = null; // retry on the next call after a transient failure
      });
    }
    return ready;
  };

  const jsonb = (value) => JSON.stringify(value === undefined ? null : value);

  return {
    kind: "postgres",
    async get(name, fallback = null) {
      await ensureTable();
      const { rows } = await pool.query(
        "SELECT value FROM store_entries WHERE name = $1",
        [name]
      );
      if (!rows.length) return fallback;
      const value = rows[0].value;
      return value === null || value === undefined ? fallback : value;
    },
    async set(name, value) {
      await ensureTable();
      await pool.query(
        `INSERT INTO store_entries (name, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [name, jsonb(value)]
      );
    },
    async update(name, fallback, fn) {
      await ensureTable();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Insert the fallback row if the key does not exist yet so the
        // FOR UPDATE lock below always has a row to lock.
        await client.query(
          "INSERT INTO store_entries (name, value) VALUES ($1, $2::jsonb) ON CONFLICT (name) DO NOTHING",
          [name, jsonb(fallback)]
        );
        const { rows } = await client.query(
          "SELECT value FROM store_entries WHERE name = $1 FOR UPDATE",
          [name]
        );
        const current = rows.length && rows[0].value !== null ? rows[0].value : fallback;
        const result = fn(current);
        await client.query(
          "UPDATE store_entries SET value = $2::jsonb, updated_at = now() WHERE name = $1",
          [name, jsonb(current)]
        );
        await client.query("COMMIT");
        return result;
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* connection already broken; the pool discards it */
        }
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    }
  };
}

// ---------------------------------------------------------------- selection

export function createStore(dataDir) {
  return fileStore(dataDir);
}

const STORE_KEY = "__autovance_store__";

/** Default store: Postgres when POSTGRES_URL/DATABASE_URL is set, else files. */
export function store() {
  const g = globalThis;
  if (!g[STORE_KEY]) {
    const url =
      (typeof process.env.POSTGRES_URL === "string" && process.env.POSTGRES_URL.trim()) ||
      (typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim()) ||
      "";
    g[STORE_KEY] = url
      ? postgresStore(url)
      : fileStore(path.join(process.cwd(), "data"));
  }
  return g[STORE_KEY];
}
