export interface Env {
  DB: D1Database;
  OTP: KVNamespace;
  JWT_SECRET: string;
  FRONTEND_URL: string;
  SMS_PROVIDER: string;
  SMS_API_KEY?: string;
}
