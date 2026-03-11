import { MoreHorizontal, Bug, Wrench, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { WorkItem, WorkItemStatus } from "@/lib/api-client";
import { api } from "@/lib/api-client";

interface WorkItemCardProps {
  item: WorkItem;
  projectId: string;
  onStatusChange?: (item: WorkItem, newStatus: WorkItemStatus) => void;
  onEdit?: (item: WorkItem) => void;
  onDelete?: (item: WorkItem) => void;
}

const priorityStyles: Record<WorkItem["priority"], string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  medium:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  low: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

const typeIcons: Record<WorkItem["type"], typeof Bug> = {
  bug: Bug,
  chore: Wrench,
  feature: Sparkles,
};

const statusLabels: Record<WorkItemStatus, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};

const allStatuses: WorkItemStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
];

export function WorkItemCard({
  item,
  projectId,
  onStatusChange,
  onEdit,
  onDelete,
}: WorkItemCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const TypeIcon = typeIcons[item.type];

  async function handleStatusChange(newStatus: WorkItemStatus) {
    if (newStatus === item.status) return;
    setIsUpdating(true);
    setError(null);
    try {
      await api.items.update(projectId, item.id, { status: newStatus });
      onStatusChange?.({ ...item, status: newStatus }, newStatus);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update status",
      );
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div
      className={cn(
        "group rounded-md border bg-card p-3 shadow-sm transition-colors hover:border-primary/30",
        isUpdating && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <a
          href={`/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(item.id)}`}
          className="min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <TypeIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={item.type} />
            <h4 className="text-sm font-medium leading-tight truncate">
              {item.title}
            </h4>
          </div>
        </a>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              aria-label="Item actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Move to&hellip;</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {allStatuses
                  .filter((s) => s !== item.status)
                  .map((s) => (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => handleStatusChange(s)}
                    >
                      {statusLabels[s]}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onEdit?.(item)}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete?.(item)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {item.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          {item.description}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge
          className={cn(
            "text-[10px] px-1.5 py-0 border-0",
            priorityStyles[item.priority],
          )}
        >
          {item.priority}
        </Badge>
        {item.tags.map((tag) => (
          <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
            {tag}
          </Badge>
        ))}
      </div>

      {error && (
        <p className="mt-1.5 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
