import * as Joi from 'joi';

const schema = Joi.object({
  DATABASE_URL:                Joi.string().required(),
  HCM_API_KEY:                 Joi.string().min(32).required(),
  HCM_BASE_URL:                Joi.string().uri().required(),
  HCM_WEBHOOK_SECRET:          Joi.string().min(32).required(),
  HCM_TIMEOUT_MS:              Joi.number().integer().positive().default(5000),
  SERVICE_API_KEY:             Joi.string().min(32).required(),
  ADMIN_API_KEY:               Joi.string().min(32).required(),
  AUDIT_RETENTION_DAYS:        Joi.number().integer().positive().default(365),
  AUDIT_ARCHIVE_CRON:          Joi.string().default('0 3 * * *'),
  AUDIT_ACTIVE_DAYS:           Joi.number().integer().positive().default(90),
  LOG_LEVEL:                   Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').default('info'),
  CORS_ALLOWED_ORIGINS:        Joi.string().optional(),
  BODY_SIZE_LIMIT:             Joi.string().default('1mb'),
  JSON_MAX_DEPTH:              Joi.number().integer().positive().default(20),
  THROTTLE_BALANCE_READ_LIMIT: Joi.number().integer().positive().default(120),
  THROTTLE_SUBMIT_LIMIT:       Joi.number().integer().positive().default(30),
  THROTTLE_STATUS_QUERY_LIMIT: Joi.number().integer().positive().default(60),
  THROTTLE_AUDIT_QUERY_LIMIT:  Joi.number().integer().positive().default(20),
  THROTTLE_MANUAL_SYNC_LIMIT:  Joi.number().integer().positive().default(5),
  THROTTLE_MANUAL_RECON_LIMIT: Joi.number().integer().positive().default(10),
  SERVICE_VERSION:             Joi.string().optional(),
  PORT:                        Joi.number().integer().positive().default(3000),
}).custom((value, helpers) => {
  if (value.SERVICE_API_KEY && value.ADMIN_API_KEY && value.SERVICE_API_KEY === value.ADMIN_API_KEY) {
    return helpers.error('any.custom', {
      message: 'SERVICE_API_KEY and ADMIN_API_KEY must not be identical',
    });
  }
  return value;
});

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const { error, value } = schema.validate(config, { allowUnknown: true });
  if (error) {
    throw new Error(`Environment validation failed: ${error.message}`);
  }
  return value;
}
