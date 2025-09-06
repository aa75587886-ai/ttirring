// scripts/backup.js
/**
 * 띠링 데이터베이스 백업 스크립트
 * - SQLite: prisma/dev.db -> backups/dev_YYYYMMDD_HHmmss.db
 * - PostgreSQL: pg_dump 이용 (환경변수 DATABASE_URL 필요)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const now = new Date();
const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 15);
const backupDir = path.join(__dirname, "../backups");
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

// SQLite 경로
const sqlitePath = path.join(__dirname, "../prisma/dev.db");
if (fs.existsSync(sqlitePath)) {
  const dest = path.join(backupDir, `dev_${stamp}.db`);
  fs.copyFileSync(sqlitePath, dest);
  console.log(`✅ SQLite 백업 완료: ${dest}`);
} else {
  console.log("ℹ️ SQLite DB 없음, PostgreSQL 백업 시도");

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("❌ DATABASE_URL 환경변수 없음");
    process.exit(1);
  }

  const dest = path.join(backupDir, `pg_${stamp}.sql`);
  try {
    execSync(`pg_dump "${url}" > "${dest}"`, { stdio: "inherit", shell: true });
    console.log(`✅ PostgreSQL 백업 완료: ${dest}`);
  } catch (err) {
    console.error("❌ PostgreSQL 백업 실패", err.message);
    process.exit(1);
  }
}
