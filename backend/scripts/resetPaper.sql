DELETE FROM alerts;
DELETE FROM paper_positions;
UPDATE wallets
SET
  balance = 1000,
  "totalPnl" = 0,
  wins = 0,
  losses = 0,
  "totalBets" = 0,
  "brierScores" = '[]';
