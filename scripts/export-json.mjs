// scripts/export-json.mjs  (works with Postgres or SQLite)
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const IGNORES = new Set(["_prisma_migrations","prisma_migrations"]);

function ts() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${z(d.getMonth()+1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

async function detectDialect() {
  try { await prisma.$queryRaw`select current_database()`; return "pg"; } catch {}
  try { await prisma.$queryRawUnsafe(`select name from sqlite_master limit 1;`); return "sqlite"; } catch {}
  return "unknown";
}

async function listTablesPg() {
  const rows = await prisma.$queryRawUnsafe(
    `select table_schema, table_name
     from information_schema.tables
     where table_type='BASE TABLE'
       and table_schema not in ('pg_catalog','information_schema');`
  );
  return rows
    .map(r => ({ schema: r.table_schema, name: r.table_name }))
    .filter(t => !IGNORES.has(t.name));
}

async function dumpTablePg(schema, name) {
  const q = `select * from "${schema}"."${name}";`;
  return await prisma.$queryRawUnsafe(q);
}

async function listTablesSqlite() {
  const rows = await prisma.$queryRawUnsafe(
    `select name from sqlite_master where type='table' and name not like 'sqlite_%';`
  );
  return rows.map(r => ({ schema: null, name: r.name }))
             .filter(t => !IGNORES.has(t.name));
}

async function dumpTableSqlite(name) {
  const q = `select * from "${name}";`;
  return await prisma.$queryRawUnsafe(q);
}

async function main() {
  const dialect = await detectDialect();
  const outDir = path.join(process.cwd(), "backups");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  let tables = [];
  if (dialect === "pg") tables = await listTablesPg();
  else if (dialect === "sqlite") tables = await listTablesSqlite();
  else throw new Error("unknown DB dialect (not Postgres/SQLite)");

  const dump = { exportedAt: new Date().toISOString(), dialect, tables: {} };
  for (const t of tables) {
    dump.tables[t.schema ? `${t.schema}.${t.name}` : t.name] =
      dialect === "pg" ? await dumpTablePg(t.schema, t.name)
                       : await dumpTableSqlite(t.name);
  }

  const file = path.join(outDir, `db_${ts()}.json`);
  fs.writeFileSync(file, JSON.stringify(dump, null, 2), "utf8");
  console.log(`ok json backup -> ${file} (tables: ${tables.map(t=>t.name).join(", ") || "none"})`);
}

main()
  .catch(e => { console.error("export failed:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
