const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'data', 'settlements.json');
if (!fs.existsSync(file)) { console.error('No settlements.json at', file); process.exit(1); }

const data = JSON.parse(fs.readFileSync(file,'utf-8'));
const items = Array.isArray(data.items) ? data.items : [];

const pickEarliest = new Map(); // key: jobId|channelId|driverId -> earliest record
for (const it of items) {
  const key = [it.jobId, it.channelId, it.driverId].join('|');
  const cur = pickEarliest.get(key);
  if (!cur) { pickEarliest.set(key, it); }
  else {
    const a = Date.parse(cur.settledAt);
    const b = Date.parse(it.settledAt);
    // 더 이른 settledAt 을 남긴다
    if (!Number.isNaN(b) && (Number.isNaN(a) || b < a)) pickEarliest.set(key, it);
  }
}

// 최신순(내림차순) 정렬로 보기 좋게
const deduped = Array.from(pickEarliest.values())
  .sort((a,b) => a.settledAt < b.settledAt ? 1 : -1);

const removed = items.length - deduped.length;
data.items = deduped;

fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log(JSON.stringify({ ok:true, before: items.length, after: deduped.length, removed }, null, 2));
