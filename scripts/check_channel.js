// scripts/check_channel.js
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const CHANNEL_ID = "CH-02";

(async () => {
  try {
    // 실제 스키마 키: Channel.channel_id
    const c = await prisma.channel.findUnique({ where: { channel_id: CHANNEL_ID } });
    if (c) {
      console.log("FOUND", CHANNEL_ID);
      console.log(c);
    } else {
      console.log("MISS", CHANNEL_ID);
    }
  } catch (e) {
    console.error("ERR", e?.message || e);
  } finally {
    await prisma.$disconnect();
  }
})();
