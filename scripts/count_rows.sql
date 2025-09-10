SELECT 'Channel'   AS table, COUNT(*) FROM public."Channel"
UNION ALL SELECT 'Job',        COUNT(*) FROM public."Job"
UNION ALL SELECT 'Settlement', COUNT(*) FROM public."Settlement"
UNION ALL SELECT 'User',       COUNT(*) FROM public."User"
UNION ALL SELECT 'WalletTx',   COUNT(*) FROM public."WalletTx";
