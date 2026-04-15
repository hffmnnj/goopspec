export const WORK_ITEM_STATUSES = ["todo", "in-progress", "done", "cancelled"] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

export const WORK_ITEM_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[number];

export interface WorkItem {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkItemCreate {
  title: string;
  description?: string;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  tags?: string[];
}

export interface WorkItemUpdate {
  title?: string;
  description?: string;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  tags?: string[];
}
