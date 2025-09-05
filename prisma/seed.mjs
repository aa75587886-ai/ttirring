// prisma/seed.mjs
import pkg from "@prisma/client";
const { PrismaClient } = pkg;

const JobStatus = { PENDING: "PENDING", DISPATCHED: "DISPATCHED", IN_PROGRESS: "IN_PROGRESS" };

const prisma = new PrismaClient();

const jobs = [
  { jobId: "J1100", status: JobStatus.PENDING },
  { jobId: "J1101", status: JobStatus.DISPATCHED },
  { jobId: "J1102", status: JobStatus.IN_PROGRESS }, // 'COMPLETED' 대신 안전한 enum 값
  { jobId: "J1103", status: JobStatus.PENDING },
  { jobId: "J1104", status: JobStatus.PENDING },
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
    try {
      await prisma.job.upsert({
        where: { jobId: j.jobId },
        update: { status: j.status },
        create: { jobId: j.jobId, status: j.status, channelId: "CH-01" },
      });
    } catch (e) {
      console.warn(`[jobs] upsert 실패 jobId=${j.jobId}`, e?.message ?? e);
    }
  }

  console.log("Seeding reservations...");
  for (const r of reservations) {
    try {
      // Reservation에서 jobId가 unique가 아닐 수 있으므로 findFirst 사용
      const exists = await prisma.reservation.findFirst({ where: { jobId: r.jobId } });
      if (!exists) {
        await prisma.reservation.create({
          data: { ...r, status: "PENDING" },
        });
      }
      // 대응되는 Job이 없을 수도 있으니 안전하게 보강
      await prisma.job.upsert({
        where: { jobId: r.jobId },
        update: {},
        create: { jobId: r.jobId, status: JobStatus.PENDING, channelId: r.channelId },
      });
    } catch (e) {
      console.warn(`[reservations] 처리 실패 jobId=${r.jobId}`, e?.message ?? e);
    }
  }

  const countJobs = await prisma.job.count();
  const countResv = await prisma.reservation.count();
  console.log(`Done. jobs=${countJobs}, reservations=${countResv}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
