// Small JSON-file persistence layer.
//
// This project has no database (and may not add one), so features that need
// to remember things — users, sessions, cron jobs, form schemas/submissions —
// store them as JSON files under ./data (git-ignored). Writes are atomic
// (temp file + rename) so a crash mid-write cannot corrupt an existing file.
//
// createStore(dir) is injectable so tests can use a temp directory.

import fs from "fs";
import path from "path";

export function createStore(dataDir) {
  const fileFor = (name) => {
    const safe = String(name).replace(/[^a-z0-9_-]/gi, "_");
    return path.join(dataDir, `${safe}.json`);
  };

  const read = (name, fallback = null) => {
    const file = fileFor(name);
    try {
      const raw = fs.readFileSync(file, "utf8");
      try {
        const parsed = JSON.parse(raw);
        return parsed === null || parsed === undefined ? fallback : parsed;
      } catch (parseErr) {
        // Corrupt or truncated JSON: preserve the original under a backup name
        // so the NEXT WRITE cannot silently destroy whatever was inside, then
        // start from the fallback. The backup keeps the data recoverable.
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

  const write = (name, data) => {
    fs.mkdirSync(dataDir, { recursive: true });
    const target = fileFor(name);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, target);
  };

  return { read, write, dir: dataDir };
}

let defaultStore = null;

/** Default store rooted at <cwd>/data. */
export function store() {
  if (!defaultStore) {
    defaultStore = createStore(path.join(process.cwd(), "data"));
  }
  return defaultStore;
}
