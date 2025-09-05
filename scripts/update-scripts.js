const fs = require('fs');
const file = 'package.json';

let raw = fs.readFileSync(file, 'utf8');
const i = raw.indexOf('{');
if (i > 0) raw = raw.slice(i);

let pkg;
try {
  pkg = JSON.parse(raw);
} catch (e) {
  console.error('package.json parse failed:', e.message);
  process.exit(1);
}

pkg.scripts = pkg.scripts || {};
pkg.scripts['db:backup'] = 'powershell -ExecutionPolicy Bypass -File scripts/backup/db-backup.ps1';
pkg.scripts['db:migrate:deploy'] = 'powershell -ExecutionPolicy Bypass -File scripts/migrate/deploy.ps1';
pkg.scripts['db:migrate:reset']  = 'powershell -ExecutionPolicy Bypass -File scripts/migrate/reset.ps1';

fs.writeFileSync(file, JSON.stringify(pkg, null, 2));
console.log('OK: scripts updated');
