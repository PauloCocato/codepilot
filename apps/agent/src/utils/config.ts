import { z } from "zod";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  LLM_PRIMARY_PROVIDER: z.enum(["claude", "openai"]).default("claude"),
  LLM_FALLBACK_PROVIDER: z.enum(["claude", "openai", "none"]).default("openai"),
  VECTOR_DB: z.enum(["chroma", "pinecone"]).default("chroma"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SANDBOX_TIMEOUT_MS: z.coerce.number().default(60_000),
  MAX_RETRIES: z.coerce.number().default(3),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  return envSchema.parse(process.env);
}
