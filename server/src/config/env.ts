import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  
  DATABASE_URL: z.string().transform(url => url.replace(/^["']|["']$/g, '').replace(/&channel_binding=require/g, '')).default('postgresql://codesync:codesync_dev@localhost:5432/codesync'),
  REDIS_URL: z.string().transform(url => url.replace(/^["']|["']$/g, '')).default('redis://localhost:6379'),
  
  JWT_ACCESS_SECRET: z.string().default('dev_access_secret_change_in_production_32chars!'),
  JWT_REFRESH_SECRET: z.string().default('dev_refresh_secret_change_in_production_32chars!'),
  JWT_ACCESS_EXPIRY: z.string().default('7d'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),
  
  BCRYPT_ROUNDS: z.coerce.number().default(12),
  
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_BUCKET: z.string().default('codesync-storage'),
  S3_REGION: z.string().default('us-east-1'),
  
  SONARQUBE_URL: z.string().default('http://localhost:9200'),
  SONARQUBE_TOKEN: z.string().default(''),
  SONARQUBE_API_PASSWORD: z.string().default('admin'),
  
  ML_WORKER_URL: z.string().transform(url => url.replace(/^["']|["']$/g, '').trim()).default('http://localhost:8000'),
  
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string().default('capcoders2027@gmail.com'),
  SMTP_PASS: z.string().default('hghl gejj towg sgfm'),
  EMAIL_FROM: z.string().default('capcoders2027@gmail.com'),
  RESEND_API_KEY: z.string().optional(),
  
  FRONTEND_URL: z.string()
    .default('http://localhost:3000')
    .transform(val => {
      const clean = (val || '').trim().replace(/^["']|["']$/g, '');
      if (!clean || clean === '*' || !clean.startsWith('http')) {
        return process.env.NODE_ENV === 'production'
          ? 'https://code-sync-six-tau.vercel.app'
          : 'http://localhost:3000';
      }
      return clean.replace(/\/$/, '');
    }),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),
  
  DOCKER_NETWORK: z.string().optional(),
  // Host-visible path for execution temp files.
  // In Docker Compose this must be a path on the HOST that Docker can bind-mount
  // into spawned execution containers. Set via EXEC_HOST_TMPDIR in compose.
  EXEC_HOST_TMPDIR: z.string().optional(),
  // Docker volume name for execution temp files (used in Compose mode)
  EXEC_VOLUME_NAME: z.string().optional(),
  // SonarQube temp dir inside server container (maps to named volume in Compose)
  SONAR_HOST_TMPDIR: z.string().optional(),
  // Docker volume name for SonarQube temp files (used in Compose mode)
  SONAR_VOLUME_NAME: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[ENV] Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
