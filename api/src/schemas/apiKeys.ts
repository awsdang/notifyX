import { z } from "zod";

export const createApiKeySchema = z.object({
  name: z.string().min(2).max(100),
  scopes: z.array(z.string().min(1)).max(50).optional(),
  expiresAt: z.iso.datetime().optional(),
});

export const rotateApiKeySchema = z.object({
  name: z.string().min(2).max(100).optional(),
  scopes: z.array(z.string().min(1)).max(50).optional(),
  expiresAt: z.iso.datetime().optional(),
});
