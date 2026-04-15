import type { ZodTypeAny } from "zod";

import {
  HealthResponseSchema,
  IdParamSchema,
  PaginationSchema,
  ProjectIdParamSchema,
  ProjectItemParamSchema,
  ProjectListResponseSchema,
  ProjectRecordSchema,
  ProjectSchema,
  ProjectUpdateSchema,
  SyncResponseSchema,
  WorkItemListQuerySchema,
  WorkItemListResponseSchema,
  WorkItemRecordSchema,
  WorkItemSchema,
  WorkItemUpdateSchema,
  WorkflowListResponseSchema,
  WorkflowSessionSchema,
  WorkflowSpawnSchema,
} from "./schemas.js";

export const ROUTES = {
  HEALTH: "/health",

  PROJECTS: "/api/projects",
  PROJECT: "/api/projects/:id",

  PROJECT_ITEMS: "/api/projects/:projectId/items",
  PROJECT_ITEM: "/api/projects/:projectId/items/:id",

  WORKFLOWS: "/api/workflows",
  WORKFLOW: "/api/workflows/:id",
  WORKFLOW_SPAWN: "/api/workflows/spawn",
  WORKFLOW_EVENTS: "/api/workflows/:id/events",

  WS: "/ws",
  EVENTS: "/api/events/:projectId",

  SYNC: "/api/sync/:projectId",
} as const;

export type ApiRoute = (typeof ROUTES)[keyof typeof ROUTES];

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface RouteDefinition {
  method: HttpMethod;
  path: ApiRoute;
  description: string;
  request?: {
    params?: ZodTypeAny;
    query?: ZodTypeAny;
    body?: ZodTypeAny;
  };
  response: {
    success: ZodTypeAny;
  };
}

export const API_ROUTES = {
  health: {
    method: "GET",
    path: ROUTES.HEALTH,
    description: "Daemon health and uptime",
    response: { success: HealthResponseSchema },
  },

  listProjects: {
    method: "GET",
    path: ROUTES.PROJECTS,
    description: "List registered projects",
    request: { query: PaginationSchema },
    response: { success: ProjectListResponseSchema },
  },
  createProject: {
    method: "POST",
    path: ROUTES.PROJECTS,
    description: "Register a new project",
    request: { body: ProjectSchema },
    response: { success: ProjectRecordSchema },
  },
  getProject: {
    method: "GET",
    path: ROUTES.PROJECT,
    description: "Get project details by ID",
    request: { params: IdParamSchema },
    response: { success: ProjectRecordSchema },
  },
  updateProject: {
    method: "PUT",
    path: ROUTES.PROJECT,
    description: "Update a project",
    request: {
      params: IdParamSchema,
      body: ProjectUpdateSchema,
    },
    response: { success: ProjectRecordSchema },
  },
  deleteProject: {
    method: "DELETE",
    path: ROUTES.PROJECT,
    description: "Deregister a project",
    request: { params: IdParamSchema },
    response: { success: ProjectRecordSchema.pick({ id: true }) },
  },

  listProjectItems: {
    method: "GET",
    path: ROUTES.PROJECT_ITEMS,
    description: "List work items in a project",
    request: {
      params: ProjectIdParamSchema,
      query: WorkItemListQuerySchema,
    },
    response: { success: WorkItemListResponseSchema },
  },
  createProjectItem: {
    method: "POST",
    path: ROUTES.PROJECT_ITEMS,
    description: "Create a work item in a project",
    request: {
      params: ProjectIdParamSchema,
      body: WorkItemSchema,
    },
    response: { success: WorkItemRecordSchema },
  },
  getProjectItem: {
    method: "GET",
    path: ROUTES.PROJECT_ITEM,
    description: "Get work item details",
    request: {
      params: ProjectItemParamSchema,
    },
    response: { success: WorkItemRecordSchema },
  },
  updateProjectItem: {
    method: "PUT",
    path: ROUTES.PROJECT_ITEM,
    description: "Update a work item",
    request: {
      params: ProjectItemParamSchema,
      body: WorkItemUpdateSchema,
    },
    response: { success: WorkItemRecordSchema },
  },
  deleteProjectItem: {
    method: "DELETE",
    path: ROUTES.PROJECT_ITEM,
    description: "Delete a work item",
    request: {
      params: ProjectItemParamSchema,
    },
    response: { success: WorkItemRecordSchema.pick({ id: true }) },
  },

  listWorkflows: {
    method: "GET",
    path: ROUTES.WORKFLOWS,
    description: "List workflow sessions",
    request: { query: PaginationSchema },
    response: { success: WorkflowListResponseSchema },
  },
  spawnWorkflow: {
    method: "POST",
    path: ROUTES.WORKFLOW_SPAWN,
    description: "Spawn a new workflow session",
    request: { body: WorkflowSpawnSchema },
    response: { success: WorkflowSessionSchema },
  },
  getWorkflow: {
    method: "GET",
    path: ROUTES.WORKFLOW,
    description: "Get workflow session details",
    request: { params: IdParamSchema },
    response: { success: WorkflowSessionSchema },
  },
  getWorkflowEvents: {
    method: "GET",
    path: ROUTES.WORKFLOW_EVENTS,
    description: "Get workflow event stream metadata",
    request: { params: IdParamSchema },
    response: { success: WorkflowListResponseSchema },
  },

  streamProjectEvents: {
    method: "GET",
    path: ROUTES.EVENTS,
    description: "Open SSE event stream for a project",
    request: {
      params: ProjectIdParamSchema,
    },
    response: { success: SyncResponseSchema },
  },
  syncProjectState: {
    method: "GET",
    path: ROUTES.SYNC,
    description: "Get current sync snapshot for a project",
    request: {
      params: ProjectIdParamSchema,
    },
    response: { success: SyncResponseSchema },
  },
} satisfies Record<string, RouteDefinition>;

export type ApiRoutes = typeof API_ROUTES;
