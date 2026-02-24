import { Environment } from "@prisma/client";

const ENV_ALIASES: Record<string, Environment> = {
  PROD: Environment.PROD,
  PRODUCTION: Environment.PROD,
  LIVE: Environment.PROD,
  UAT: Environment.UAT,
  STAGING: Environment.UAT,
  TEST: Environment.UAT,
  DEV: Environment.UAT,
  DEVELOPMENT: Environment.UAT,
};

export function parseEnvironment(value: unknown): Environment | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return ENV_ALIASES[normalized] ?? null;
}
