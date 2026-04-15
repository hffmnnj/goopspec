import { z } from "zod";

const ISO_DATE_TIME_WITH_OFFSET = z.string().datetime({ offset: true });

export const ProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  path: z.string().trim().min(1),
  description: z.string().trim().max(2000).optional(),
});

export const ProjectUpdateSchema = ProjectSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  {
    message: "At least one field must be provided for project updates",
  },
);

export const ProjectRecordSchema = ProjectSchema.extend({
  id: z.string().trim().min(1),
  createdAt: ISO_DATE_TIME_WITH_OFFSET,
  updatedAt: ISO_DATE_TIME_WITH_OFFSET,
});

export const WorkItemStatusSchema = z.enum(["todo", "in-progress", "done"]);

export const WorkItemPrioritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export const WorkItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  status: WorkItemStatusSchema.default("todo"),
  priority: WorkItemPrioritySchema.default("medium"),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export const WorkItemUpdateSchema = WorkItemSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  {
    message: "At least one field must be provided for work item updates",
  },
);

export const WorkItemRecordSchema = WorkItemSchema.extend({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  createdAt: ISO_DATE_TIME_WITH_OFFSET,
  updatedAt: ISO_DATE_TIME_WITH_OFFSET,
});

export const WorkflowPhaseSchema = z.enum([
  "discuss",
  "plan",
  "execute",
  "accept",
  "research",
]);

export const WorkflowStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const WorkflowSpawnSchema = z
  .object({
    projectId: z.string().trim().min(1),
    workItemId: z.string().trim().min(1).optional(),
    prompt: z.string().trim().min(1).max(10000).optional(),
  })
  .strict();

export const WorkflowSessionSchema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  workItemId: z.string().trim().min(1).optional(),
  phase: WorkflowPhaseSchema,
  wave: z.number().int().nonnegative(),
  totalWaves: z.number().int().positive().optional(),
  status: WorkflowStatusSchema,
  blocker: z.string().trim().min(1).optional(),
  startedAt: ISO_DATE_TIME_WITH_OFFSET,
  completedAt: ISO_DATE_TIME_WITH_OFFSET.optional(),
});

export const SortFieldSchema = z.enum([
  "createdAt",
  "updatedAt",
  "priority",
  "status",
  "title",
]);

export const SortOrderSchema = z.enum(["asc", "desc"]);

export const PaginationSchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: SortFieldSchema.optional(),
    order: SortOrderSchema.optional(),
  })
  .strict();

export const WorkItemFilterSchema = z
  .object({
    status: WorkItemStatusSchema.optional(),
    priority: WorkItemPrioritySchema.optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    search: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const WorkItemListQuerySchema = PaginationSchema.merge(
  WorkItemFilterSchema,
);

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  uptime: z.number().nonnegative(),
  version: z.string().trim().min(1),
});

export const ProjectListResponseSchema = z.object({
  data: z.array(ProjectRecordSchema),
  pagination: z
    .object({
      page: z.number().int().min(1),
      limit: z.number().int().min(1),
      total: z.number().int().nonnegative(),
    })
    .optional(),
});

export const IdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const ProjectIdParamSchema = z.object({
  projectId: z.string().trim().min(1),
});

export const ProjectItemParamSchema = z.object({
  projectId: z.string().trim().min(1),
  id: z.string().trim().min(1),
});

export const WorkItemListResponseSchema = z.object({
  data: z.array(WorkItemRecordSchema),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    total: z.number().int().nonnegative(),
  }),
});

export const WorkflowListResponseSchema = z.object({
  data: z.array(WorkflowSessionSchema),
  pagination: z
    .object({
      page: z.number().int().min(1),
      limit: z.number().int().min(1),
      total: z.number().int().nonnegative(),
    })
    .optional(),
});

export const SyncResponseSchema = z.object({
  projectId: z.string().trim().min(1),
  workflows: z.array(WorkflowSessionSchema),
  generatedAt: ISO_DATE_TIME_WITH_OFFSET,
});

export type ProjectInput = z.infer<typeof ProjectSchema>;
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateSchema>;
export type ProjectRecord = z.infer<typeof ProjectRecordSchema>;

export type WorkItemStatusValue = z.infer<typeof WorkItemStatusSchema>;
export type WorkItemPriorityValue = z.infer<typeof WorkItemPrioritySchema>;
export type WorkItemInput = z.infer<typeof WorkItemSchema>;
export type WorkItemUpdateInput = z.infer<typeof WorkItemUpdateSchema>;
export type WorkItemRecord = z.infer<typeof WorkItemRecordSchema>;

export type WorkflowPhaseValue = z.infer<typeof WorkflowPhaseSchema>;
export type WorkflowStatusValue = z.infer<typeof WorkflowStatusSchema>;
export type WorkflowSpawnInput = z.infer<typeof WorkflowSpawnSchema>;
export type WorkflowSessionRecord = z.infer<typeof WorkflowSessionSchema>;

export type SortField = z.infer<typeof SortFieldSchema>;
export type SortOrder = z.infer<typeof SortOrderSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
export type WorkItemFilter = z.infer<typeof WorkItemFilterSchema>;
export type WorkItemListQuery = z.infer<typeof WorkItemListQuerySchema>;

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;
export type WorkItemListResponse = z.infer<typeof WorkItemListResponseSchema>;
export type WorkflowListResponse = z.infer<typeof WorkflowListResponseSchema>;
export type SyncResponse = z.infer<typeof SyncResponseSchema>;

export type IdParam = z.infer<typeof IdParamSchema>;
export type ProjectIdParam = z.infer<typeof ProjectIdParamSchema>;
export type ProjectItemParam = z.infer<typeof ProjectItemParamSchema>;
