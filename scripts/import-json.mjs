// scripts/import-json.mjs  (JSON → DB restore, PG/SQLite 지원)
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const MODEL_ORDER = ["Channel", "User", "Job", "Reservation", "WalletTx", "Settlement"]; // FK 고려 삽입 순서
const DELETE_ORDER = [...MODEL_ORDER].reverse();
const MAP = Object.fromEntries(
  MODEL_ORDER.map((n) => [n, n.charAt(0).toLowerCase() + n.slice(1)])
);

function latestBackupJson() {
  const dir = path.join(process.cwd(), "backups");
  if (!fs.existsSync(dir)) throw new Error("backups/ 폴더 없음");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  if (!files.length) throw new Error("백업 JSON 없음");
  files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
  return path.join(dir, files[0]);
}

async function detectDialect() {
  try { await prisma.$queryRaw`select current_database()`; return "pg"; } catch {}
  try { await prisma.$queryRawUnsafe(`select name from sqlite_master limit 1;`); return "sqlite"; } catch {}
  return "unknown";
}

function normKey(k) {
  return k.includes(".") ? k.split(".").pop() : k;
}

async function clearTable(name, dialect) {
  if (dialect === "pg") {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${name}" RESTART IDENTITY CASCADE;`);
  } else if (dialect === "sqlite") {
    await prisma.$executeRawUnsafe(`DELETE FROM "${name}";`);
    try { await prisma.$executeRawUnsafe(`DELETE FROM sqlite_sequence WHERE name='${name}';`); } catch {}
  } else {
    throw new Error("unknown DB dialect");
  }
}

async function insertMany(modelName, rows) {
  if (!rows?.length) return;
  const delegate = prisma[MAP[modelName]];
  if (!delegate?.createMany) throw new Error(`prisma delegate not found: ${modelName}`);
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await delegate.createMany({ data: rows.slice(i, i + CHUNK), skipDuplicates: true });
  }
}

async function main() {
  const file = process.argv[2] ? path.resolve(process.argv[2]) : latestBackupJson();
  const dump = JSON.parse(fs.readFileSync(file, "utf8"));
  const tablesObj = dump.tables || {};
  const dialect = await detectDialect();

  // 사용 가능한 테이블 맵 (키 정규화)
  const available = {};
  for (const k of Object.keys(tablesObj)) {
    const nk = normKey(k);
    available[nk] = tablesObj[k];
  }

  // 삭제(역순)
  for (const name of DELETE_ORDER) {
    if (available[name]) {
      await clearTable(name, dialect);
    }
  }

  // 삽입(정순)
  for (const name of MODEL_ORDER) {
    if (available[name]) {
      await insertMany(name, available[name]);
      console.log(`ok import ${name}: ${available[name].length}`);
    }
  }

  console.log(`✅ restore done from ${path.basename(file)}`);
}

main()
  .catch((e) => { console.error("import failed:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
