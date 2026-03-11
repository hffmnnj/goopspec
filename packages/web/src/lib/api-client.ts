const DAEMON_URL =
  import.meta.env.PUBLIC_DAEMON_URL ?? "http://localhost:7331";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${DAEMON_URL}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ApiError(
      response.status,
      body || `API request failed: ${response.status} ${response.statusText}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Domain types used by the web panel
// These extend @goopspec/core types with additional fields the daemon API
// may return. We define them locally to avoid coupling the UI to the exact
// core package shape — the API is the contract.
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkItemType = "feature" | "bug" | "chore";
export type WorkItemStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "review"
  | "done";
export type WorkItemPriority = "low" | "medium" | "high" | "critical";

export interface WorkItem {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  type: WorkItemType;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  tags: string[];
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowPhase =
  | "idle"
  | "discuss"
  | "plan"
  | "execute"
  | "accept"
  | "complete";
export type WorkflowStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed";

export interface WorkflowSession {
  id: string;
  projectId: string;
  workItemId?: string;
  workflowId: string;
  phase: WorkflowPhase;
  currentWave: number;
  totalWaves: number;
  status: WorkflowStatus;
  activeAgent?: string;
  blockerDescription?: string;
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Query / mutation payloads
// ---------------------------------------------------------------------------

export interface ItemQuery {
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  tags?: string;
  sort?: "created_asc" | "created_desc" | "priority" | "title";
}

export interface CreateItemBody {
  title: string;
  description?: string;
  type?: WorkItemType;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  tags?: string[];
}

export interface UpdateItemBody {
  title?: string;
  description?: string;
  type?: WorkItemType;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Typed API client
// ---------------------------------------------------------------------------

function buildQuery(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(
    (pair): pair is [string, string] => pair[1] !== undefined && pair[1] !== "",
  );
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries).toString();
}

export const api = {
  projects: {
    list() {
      return apiFetch<{ projects: Project[] }>("/api/projects");
    },
    get(id: string) {
      return apiFetch<{ project: Project }>(`/api/projects/${encodeURIComponent(id)}`);
    },
  },

  items: {
    list(projectId: string, query?: ItemQuery) {
      const qs = query
        ? buildQuery({
            status: query.status,
            priority: query.priority,
            tags: query.tags,
            sort: query.sort,
          })
        : "";
      return apiFetch<{ items: WorkItem[] }>(
        `/api/projects/${encodeURIComponent(projectId)}/items${qs}`,
      );
    },
    get(projectId: string, itemId: string) {
      return apiFetch<{ item: WorkItem }>(
        `/api/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemId)}`,
      );
    },
    create(projectId: string, body: CreateItemBody) {
      return apiFetch<{ item: WorkItem }>(
        `/api/projects/${encodeURIComponent(projectId)}/items`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    update(projectId: string, itemId: string, body: UpdateItemBody) {
      return apiFetch<{ item: WorkItem }>(
        `/api/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemId)}`,
        { method: "PUT", body: JSON.stringify(body) },
      );
    },
    delete(projectId: string, itemId: string) {
      return apiFetch<void>(
        `/api/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemId)}`,
        { method: "DELETE" },
      );
    },
  },

  workflows: {
    list(projectId?: string) {
      const qs = projectId
        ? buildQuery({ projectId })
        : "";
      return apiFetch<{ sessions: WorkflowSession[] }>(
        `/api/workflows${qs}`,
      );
    },
    get(id: string) {
      return apiFetch<{ session: WorkflowSession }>(
        `/api/workflows/${encodeURIComponent(id)}`,
      );
    },
  },
};
