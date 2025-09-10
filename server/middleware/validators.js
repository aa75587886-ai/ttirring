// server/middleware/validators.js
const prisma = require("../prisma");

// 존재 여부 검증 미들웨어
async function validateUser(req, res, next) {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ ok: false, error: "userId required" });

  const user = await prisma.user.findUnique({ where: { userId } });
  if (!user) return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });

  next();
}

async function validateJob(req, res, next) {
  const { jobId } = req.body;
  if (!jobId) return res.status(400).json({ ok: false, error: "jobId required" });

  const job = await prisma.job.findUnique({ where: { jobId } });
  if (!job) return res.status(404).json({ ok: false, error: "JOB_NOT_FOUND" });

  next();
}

async function validateChannel(req, res, next) {
  const channelId = req.body.channelId || req.query.channelId;
  if (!channelId) return res.status(400).json({ ok: false, error: "channelId required" });

  const channel = await prisma.channel.findUnique({ where: { channelId } });
  if (!channel) return res.status(404).json({ ok: false, error: "CHANNEL_NOT_FOUND" });

  next();
}

module.exports = { validateUser, validateJob, validateChannel };
