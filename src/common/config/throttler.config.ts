import { registerAs } from '@nestjs/config';

export const throttlerConfig = registerAs('throttler', () => ({
  balanceReadLimit: parseInt(process.env.THROTTLE_BALANCE_READ_LIMIT ?? '120', 10),
  submitLimit:      parseInt(process.env.THROTTLE_SUBMIT_LIMIT ?? '30', 10),
  statusQueryLimit: parseInt(process.env.THROTTLE_STATUS_QUERY_LIMIT ?? '60', 10),
  auditQueryLimit:  parseInt(process.env.THROTTLE_AUDIT_QUERY_LIMIT ?? '20', 10),
  manualSyncLimit:  parseInt(process.env.THROTTLE_MANUAL_SYNC_LIMIT ?? '5', 10),
  manualReconLimit: parseInt(process.env.THROTTLE_MANUAL_RECON_LIMIT ?? '10', 10),
  ttlMs:            60_000,
}));
