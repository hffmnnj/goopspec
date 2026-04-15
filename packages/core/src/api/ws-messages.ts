import { z } from "zod";

export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("workflow:status"),
    payload: z.object({
      sessionId: z.string().trim().min(1),
      phase: z.string().trim().min(1),
      wave: z.number().int().nonnegative(),
      totalWaves: z.number().int().positive(),
      agent: z.string().trim().min(1).optional(),
      blocker: z.string().trim().min(1).optional(),
    }),
  }),
  z.object({
    type: z.literal("workflow:started"),
    payload: z.object({
      sessionId: z.string().trim().min(1),
      projectId: z.string().trim().min(1),
      workItemId: z.string().trim().min(1).optional(),
    }),
  }),
  z.object({
    type: z.literal("workflow:completed"),
    payload: z.object({
      sessionId: z.string().trim().min(1),
      status: z.enum(["completed", "failed"]),
    }),
  }),
  z.object({
    type: z.literal("project:updated"),
    payload: z.object({
      projectId: z.string().trim().min(1),
    }),
  }),
  z.object({
    type: z.literal("ping"),
    payload: z.object({
      timestamp: z.string().datetime({ offset: true }),
    }),
  }),
]);

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("join"),
    payload: z.object({
      room: z.string().trim().min(1),
    }),
  }),
  z.object({
    type: z.literal("leave"),
    payload: z.object({
      room: z.string().trim().min(1),
    }),
  }),
  z.object({
    type: z.literal("pong"),
    payload: z.object({
      timestamp: z.string().datetime({ offset: true }),
    }),
  }),
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export function isServerMessage(msg: unknown): msg is ServerMessage {
  return ServerMessageSchema.safeParse(msg).success;
}

export function isClientMessage(msg: unknown): msg is ClientMessage {
  return ClientMessageSchema.safeParse(msg).success;
}
