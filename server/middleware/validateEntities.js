// server/middleware/validateEntities.js
const prisma = require("../prisma/client");

async function validateUser(req, res, next) {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "USER_ID_REQUIRED" });

  const user = await prisma.user.findUnique({ where: { userId } });
  if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

  next();
}

async function validateJob(req, res, next) {
  const { jobId } = req.body;
  if (!jobId) return res.status(400).json({ error: "JOB_ID_REQUIRED" });

  const job = await prisma.job.findUnique({ where: { jobId } });
  if (!job) return res.status(404).json({ error: "JOB_NOT_FOUND" });

  next();
}

async function validateChannel(req, res, next) {
  const channelId = req.body.channelId || req.query.channelId;
  if (!channelId) return res.status(400).json({ error: "CHANNEL_ID_REQUIRED" });

  const channel = await prisma.channel.findUnique({ where: { channelId } });
  if (!channel) return res.status(404).json({ error: "CHANNEL_NOT_FOUND" });

  next();
}

module.exports = { validateUser, validateJob, validateChannel };
