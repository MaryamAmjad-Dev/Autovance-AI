// Persistence layer.
//
// One async interface with two backends, chosen from the environment:
//
//   - Postgres (Neon)  — production. Used when POSTGRES_URL (or DATABASE_URL)
//                        is set. This is the only persistent backend.
//   - In-memory        — tests and local development without a database. Data
//                        lives in a Map for the lifetime of the process.
//                        Never used in production (POSTGRES_URL is always set
//                        there via the Vercel Neon integration).
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
//     in-memory the lock is trivially held (single process). This is how
//     concurrent signups, single-use reset tokens and cron edits stay correct.
//   kind: "postgres" | "memory"

import pg from "pg";

const { Pool } = pg;

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

// ------------------------------------------------------------ memory backend

function memoryStore() {
  const data = new Map();
  return {
    kind: "memory",
    async get(name, fallback = null) {
      if (!data.has(name)) return fallback;
      const value = data.get(name);
      return value === null ? fallback : value;
    },
    async set(name, value) {
      data.set(name, value);
    },
    async update(name, fallback, fn) {
      const source = data.has(name) ? data.get(name) : fallback;
      // deep-clone so a throwing callback leaves the stored value untouched
      const current = structuredClone(source);
      const result = fn(current);
      data.set(name, current);
      return result;
    }
  };
}

/** Explicit memory store for tests that need isolation. */
export function createMemoryStore() {
  return memoryStore();
}

// ---------------------------------------------------------------- selection

const STORE_KEY = "__autovance_store__";

/** Default store: Postgres when POSTGRES_URL/DATABASE_URL is set, else in-memory. */
export function store() {
  const g = globalThis;
  if (!g[STORE_KEY]) {
    const url =
      (typeof process.env.POSTGRES_URL === "string" && process.env.POSTGRES_URL.trim()) ||
      (typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim()) ||
      "";
    if (!url && process.env.NODE_ENV === "production") {
      console.warn("[store] POSTGRES_URL is not set — using in-memory store. Data will NOT survive deploys.");
    }
    g[STORE_KEY] = url ? postgresStore(url) : memoryStore();
  }
  return g[STORE_KEY];
}
