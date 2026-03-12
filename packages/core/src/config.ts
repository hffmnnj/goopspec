import { z } from "zod";

export const GoopspecConfigSchema = z.object({
  daemonUrl: z.string().trim().url().default("http://localhost:7331"),
  port: z.number().int().min(1).max(65535).default(7331),
  host: z.string().trim().min(1).default("localhost"),
});

export type GoopspecConfig = z.infer<typeof GoopspecConfigSchema>;

export const DEFAULT_CONFIG: GoopspecConfig = GoopspecConfigSchema.parse({});
