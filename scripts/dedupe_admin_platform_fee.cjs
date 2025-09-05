const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'data', 'wallet_tx.json');
if (!fs.existsSync(file)) { console.error('No wallet_tx.json at', file); process.exit(1); }

const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
const items = Array.isArray(data.tx) ? data.tx : [];

const isAdminFee = (t) =>
  String(t.userId).toUpperCase() === 'ADMIN' &&
  String(t.type).toUpperCase() === 'CREDIT' &&
  String(t.reason).toUpperCase() === 'PLATFORM_FEE' &&
  t.channelId === 'CH-02' &&
  t.jobId;

const groups = new Map(); // key: jobId|channelId -> [records...]
for (const t of items) {
  if (!isAdminFee(t)) continue;
  const key = `${t.jobId}|${t.channelId}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(t);
}

// 중복 제거: 가장 이른 createdAt 만 남김
const toRemove = new Set();
for (const [key, arr] of groups) {
  if (arr.length <= 1) continue;
  arr.sort((a,b) => (a.createdAt || '') < (b.createdAt || '') ? -1 : 1);
  // keep first, remove others
  for (let i = 1; i < arr.length; i++) {
    toRemove.add(arr[i].txId);
  }
}

const before = items.length;
const removed = [];
const afterItems = items.filter(t => {
  const del = toRemove.has(t.txId);
  if (del) removed.push({ txId: t.txId, jobId: t.jobId, channelId: t.channelId, amount: t.amount, createdAt: t.createdAt });
  return !del;
});

data.tx = afterItems;
fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log(JSON.stringify({ ok:true, removedCount: removed.length, removed }, null, 2));
