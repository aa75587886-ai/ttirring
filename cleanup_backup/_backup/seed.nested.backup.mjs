New-Item -ItemType Directory -Force prisma | Out-Null
@'
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const jobs = [
  { jobId: "J1100", channelId: "CH-01", status: "PENDING" },
  { jobId: "J1101", channelId: "CH-01", status: "DISPATCHED" },
  { jobId: "J1102", channelId: "CH-01", status: "COMPLETED" },
  { jobId: "J1103", channelId: "CH-02", status: "PENDING" },
  { jobId: "J1104", channelId: "CH-02", status: "PENDING" },
];

const reservations = [
  {
    jobId: "J1100",
    channelId: "CH-01",
    passengerName: "김철수",
    pickupAddr: "서울역",
    dropoffAddr: "강남역",
  },
  {
    jobId: "J1101",
    channelId: "CH-01",
    passengerName: "이영희",
    pickupAddr: "판교역",
    dropoffAddr: "양재역",
  },
];

async function main() {
  console.log("Seeding jobs...");
  for (const j of jobs) {
    await prisma.job.upsert({
      where: { jobId: j.jobId },
      update: { status: j.status, channelId: j.channelId },
      create: j,
    });
  }

  console.log("Seeding reservations...");
  for (const r of reservations) {
    const exists = await prisma.reservation.findUnique({ where: { jobId: r.jobId } });
    if (!exists) {
      await prisma.reservation.create({ data: { ...r, status: "PENDING" } });
    }
    // ✅ 이 줄부터가 아까 빠졌던 부분
    await prisma.job.upsert({
      where: { jobId: r.jobId },
      update: {},
      create: { jobId: r.jobId, channelId: r.channelId, status: "PENDING" },
    });
  }

  const countJobs = await prisma.job.count();
  const countResv = await prisma.reservation.count();
  console.log(`Done. jobs=${countJobs}, reservations=${countResv}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
'@ | Set-Content -Encoding UTF8 prisma\seed.mjs
