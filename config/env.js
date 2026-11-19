import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    USER_FRONTEND_URL: z.string().url().default('http://localhost:3000'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    DB_HOST: z.string().min(1).default('127.0.0.1'),
    DB_PORT: z.coerce.number().int().positive().default(3306),
    DB_NAME: z.string().min(1).default('japaika_ecommerce'),
    DB_USER: z.string().min(1).default('root'),
    DB_PASSWORD: z.string().default(''),
    DB_LOGGING: z
      .enum(['true', 'false'])
      .default('false')
      .transform((val) => val === 'true'),

    TEST_DB_NAME: z.string().min(1).default('japaika_ecommerce_test'),

    USER_JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'USER_JWT_ACCESS_SECRET must be at least 32 characters')
      .default('dev_only_user_jwt_access_secret_replace_in_prod_32'),
    USER_JWT_REFRESH_SECRET: z
      .string()
      .min(32, 'USER_JWT_REFRESH_SECRET must be at least 32 characters')
      .default('dev_only_user_jwt_refresh_secret_replace_in_prod_32'),
    USER_JWT_ACCESS_EXPIRES_IN: z.string().min(1).default('15m'),
    USER_JWT_REFRESH_EXPIRES_IN: z.string().min(1).default('30d'),
    OTP_HMAC_SECRET: z
      .string()
      .min(32, 'OTP_HMAC_SECRET must be at least 32 characters')
      .default('dev_only_otp_hmac_secret_replace_in_production_32'),

    OTP_EXPIRY_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),

    COOKIE_DOMAIN: z.string().optional().default(''),

    EMAIL_TRANSPORT: z.enum(['console', 'smtp']).default('console'),
    EMAIL_FROM: z.string().min(1).default('Japaika <no-reply@japaika.example>'),
    SMTP_HOST: z.string().optional().default(''),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((val) => val === 'true'),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASS: z.string().optional().default(''),
  })
  .superRefine((data, ctx) => {
    if (data.USER_JWT_ACCESS_SECRET === data.USER_JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['USER_JWT_REFRESH_SECRET'],
        message: 'USER_JWT_REFRESH_SECRET must differ from USER_JWT_ACCESS_SECRET',
      });
    }

    if (data.NODE_ENV === 'production') {
      if (data.EMAIL_TRANSPORT !== 'smtp') {
        ctx.addIssue({
          code: 'custom',
          path: ['EMAIL_TRANSPORT'],
          message: 'EMAIL_TRANSPORT must be "smtp" in production',
        });
      }

      const devDefaults = [
        'dev_only_user_jwt_access_secret_replace_in_prod_32',
        'dev_only_user_jwt_refresh_secret_replace_in_prod_32',
        'dev_only_otp_hmac_secret_replace_in_production_32',
      ];
      if (devDefaults.includes(data.USER_JWT_ACCESS_SECRET)) {
        ctx.addIssue({
          code: 'custom',
          path: ['USER_JWT_ACCESS_SECRET'],
          message: 'Production requires a custom USER_JWT_ACCESS_SECRET',
        });
      }
      if (devDefaults.includes(data.USER_JWT_REFRESH_SECRET)) {
        ctx.addIssue({
          code: 'custom',
          path: ['USER_JWT_REFRESH_SECRET'],
          message: 'Production requires a custom USER_JWT_REFRESH_SECRET',
        });
      }
      if (devDefaults.includes(data.OTP_HMAC_SECRET)) {
        ctx.addIssue({
          code: 'custom',
          path: ['OTP_HMAC_SECRET'],
          message: 'Production requires a custom OTP_HMAC_SECRET',
        });
      }
    }

    if (data.EMAIL_TRANSPORT === 'smtp' && !data.SMTP_HOST) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when EMAIL_TRANSPORT is "smtp"',
      });
    }
  });

export function parseEnv(rawEnv = process.env) {
  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${messages}`);
  }
  return parsed.data;
}

const raw = parseEnv(process.env);

const env = {
  nodeEnv: raw.NODE_ENV,
  isProd: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  port: raw.PORT,
  userFrontendUrl: raw.USER_FRONTEND_URL,
  trustProxy: raw.TRUST_PROXY,
  db: {
    host: raw.DB_HOST,
    port: raw.DB_PORT,
    name: raw.NODE_ENV === 'test' ? raw.TEST_DB_NAME : raw.DB_NAME,
    user: raw.DB_USER,
    password: raw.DB_PASSWORD,
    logging: raw.DB_LOGGING,
  },
  jwt: {
    accessSecret: raw.USER_JWT_ACCESS_SECRET,
    refreshSecret: raw.USER_JWT_REFRESH_SECRET,
    accessExpiresIn: raw.USER_JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: raw.USER_JWT_REFRESH_EXPIRES_IN,
    issuer: 'japaika-user-backend',
    audience: 'japaika-user',
  },
  otp: {
    hmacSecret: raw.OTP_HMAC_SECRET,
    expiryMinutes: raw.OTP_EXPIRY_MINUTES,
    resendCooldownSeconds: raw.OTP_RESEND_COOLDOWN_SECONDS,
    maxAttempts: raw.OTP_MAX_ATTEMPTS,
  },
  cookie: {
    domain: raw.COOKIE_DOMAIN || undefined,
    accessName: 'japaika_user_access',
    refreshName: 'japaika_user_refresh',
  },
  email: {
    transport: raw.EMAIL_TRANSPORT,
    from: raw.EMAIL_FROM,
    smtp: {
      host: raw.SMTP_HOST,
      port: raw.SMTP_PORT,
      secure: raw.SMTP_SECURE,
      user: raw.SMTP_USER,
      pass: raw.SMTP_PASS,
    },
  },
};

export default env;
