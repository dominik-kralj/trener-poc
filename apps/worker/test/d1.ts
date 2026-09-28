import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";

const ROOT = join(import.meta.dirname, "..");
const MIGRATIONS = join(ROOT, "migrations");
const TABLES = ["hold", "slot", "client", "processed_message"];

/** A real local D1 (SQLite in workerd) from wrangler.toml, in memory only. */
export async function startTestDb() {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: join(ROOT, "wrangler.toml"),
    persist: false,
    envFiles: [],
    remoteBindings: false,
  });
  return { db: proxy.env.DB, dispose: proxy.dispose };
}

/** Drops everything and re-applies the migrations, so each test starts clean. */
export async function resetDb(db: D1Database) {
  for (const table of TABLES) await db.prepare(`DROP TABLE IF EXISTS ${table}`).run();

  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8").replace(/--.*$/gm, "");
    for (const statement of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await db.prepare(statement).run();
    }
  }
}
