// scripts/seed_job.js
// 스키마 자동 인식: Job/Jobs/Reservation/Reservations 중 존재하는 모델에 J-COMP-1 upsert
import { PrismaClient, Prisma } from "@prisma/client";
const prisma = new PrismaClient();
const { dmmf } = Prisma;

function findModel(cands) {
  const lower = cands.map(s => s.toLowerCase());
  return dmmf.datamodel.models.find(m => lower.includes(m.name.toLowerCase())) || null;
}
function delegate(name) {
  const key = name[0].toLowerCase() + name.slice(1);
  if (!prisma[key]) throw new Error(`delegate not found: ${name} (${key})`);
  return prisma[key];
}
function pickUniqueKey(model, pref = ["job_id","jobId","id"]) {
  // 선호 키 우선
  for (const p of pref) {
    const f = model.fields.find(f => f.name === p && (f.isId || f.isUnique));
    if (f) return f.name;
  }
  // PK
  const idf = model.fields.find(f => f.isId);
  if (idf) return idf.name;
  // 단일 unique
  const uf = model.fields.find(f => f.isUnique);
  if (uf) return uf.name;
  // 복합 unique 중 첫 필드
  if (model.uniqueFields?.length && model.uniqueFields[0].length) {
    return model.uniqueFields[0][0];
  }
  throw new Error(`no id/unique on model: ${model.name}`);
}
function buildCreate(model, base) {
  const fields = new Set(model.fields.map(f => f.name));
  const out = {};
  for (const [k,v] of Object.entries(base)) if (fields.has(k)) out[k]=v;
  return out;
}

async function main() {
  const jobModel =
    findModel(["Job","Jobs"]) ||
    findModel(["Reservation","Reservations"]);
  if (!jobModel) throw new Error("Job/Reservation 계열 모델을 찾지 못함");

  const jobKey = pickUniqueKey(jobModel);
  const Job = delegate(jobModel.name);

  const JOB_ID = "J-COMP-1";
  // 채널/상태 필드는 있으면 자동 채움
  const createBase = {
    [jobKey]: JOB_ID,
    job_id: JOB_ID,
    jobId: JOB_ID,
    channel_id: "CH-02",
    channelId: "CH-02",
    status: "PENDING",
    passengerName: "홍길동",
    pickupAddr: "서울역",
    dropoffAddr: "성남시"
  };
  const createData = buildCreate(jobModel, createBase);

  await Job.upsert({
    where: { [jobKey]: JOB_ID },
    create: createData,
    update: {}
  });

  console.log(`✅ Job seed ok => Model:${jobModel.name} key:${jobKey} value:${JOB_ID}`);
  console.log("createData:", createData);
}
main()
  .then(()=>prisma.$disconnect())
  .catch(e=>{
    console.error("❌ seed job error:", e?.message || e);
    prisma.$disconnect().then(()=>process.exit(1));
  });
