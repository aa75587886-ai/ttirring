// server/routes/wallet.js
const express = require("express");
const router = express.Router();
const prisma = require("../prisma");
const {
  validateUser,
  validateJob,
  validateChannel,
} = require("../middleware/validators");

// 지갑 출금 (DEBIT)
router.post(
  "/debit",
  validateUser,
  validateJob,
  validateChannel,
  async (req, res) => {
    try {
      const { userId, amount, reason, jobId, channelId } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ ok: false, error: "Invalid amount" });
      }

      const tx = await prisma.walletTx.create({
        data: {
          userId,
          jobId,
          channelId,
          amount,
          reason,
          type: "DEBIT",
        },
      });

      return res.status(201).json({ ok: true, tx });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  }
);

// 지갑 충전 (CREDIT)
router.post(
  "/credit",
  validateUser,
  validateChannel,
  async (req, res) => {
    try {
      const { userId, amount, reason, channelId } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ ok: false, error: "Invalid amount" });
      }

      const tx = await prisma.walletTx.create({
        data: {
          userId,
          channelId,
          amount,
          reason,
          type: "CREDIT",
        },
      });

      return res.status(201).json({ ok: true, tx });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  }
);

module.exports = router;
