import { registerAs } from '@nestjs/config';

export const hcmConfig = registerAs('hcm', () => ({
  apiKey:        process.env.HCM_API_KEY!,
  baseUrl:       process.env.HCM_BASE_URL!,
  webhookSecret: process.env.HCM_WEBHOOK_SECRET!,
  timeoutMs:     parseInt(process.env.HCM_TIMEOUT_MS ?? '5000', 10),
  serviceApiKey: process.env.SERVICE_API_KEY!,
  adminApiKey:   process.env.ADMIN_API_KEY!,
}));
