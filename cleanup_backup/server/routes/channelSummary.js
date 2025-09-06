const { Router } = require("express");
const { PrismaClient } = require("@prisma/client");
const router = Router();
const prisma = new PrismaClient();

function toDate(s){ try{ const d=new Date(s); return isNaN(d)?null:d; }catch{ return null; } }

router.get("/channel-summary", async (req,res)=>{
  try{
    const { channelId, from, to, adjustFilter } = req.query;
    const manual = String(adjustFilter||"").toLowerCase()==="manual";

    let fromDate = toDate(from);
    let toDateV  = toDate(to);
    if(!manual){
      const now = new Date();
      toDateV = toDateV || now;
      fromDate = fromDate || new Date(now.getTime()-30*24*3600*1000);
    }

    const where = {};
    if(channelId) where.channel_id = String(channelId);
    if(fromDate || toDateV){
      where.updated_at = {};
      if(fromDate) where.updated_at.gte = fromDate;
      if(toDateV)  where.updated_at.lte = toDateV;
    }

    const jobs = await prisma.job.count({ where });

    res.json({
      ok:true,
      channelId: channelId||null,
      range: {
        from: fromDate? fromDate.toISOString(): null,
        to:   toDateV?  toDateV.toISOString() : null,
        mode: manual? "manual":"auto"
      },
      totals: { jobs }
    });
  }catch(e){
    console.error(e);
    res.status(500).json({ ok:false, error:{ code:"SUMMARY_ERROR", message:String(e.message||e) }});
  }
});

module.exports = router;
