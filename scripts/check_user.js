// scripts/check_user.js
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const USER_ID = "DR-01";

(async () => {
  try {
    // 실제 스키마 키: User.user_id
    const u = await prisma.user.findUnique({ where: { user_id: USER_ID } });
    if (u) {
      console.log("FOUND", USER_ID);
      console.log(u);
    } else {
      console.log("MISS", USER_ID);
    }
  } catch (e) {
    console.error("ERR", e?.message || e);
  } finally {
    await prisma.$disconnect();
  }
})();
