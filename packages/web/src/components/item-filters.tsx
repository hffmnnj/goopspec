import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FilterState } from "@/hooks/use-filters";
import type { WorkItemStatus, WorkItemPriority } from "@/lib/api-client";

interface ItemFiltersProps {
  filters: FilterState;
  onFilterChange: <K extends keyof FilterState>(
    key: K,
    value: FilterState[K],
  ) => void;
  onClear: () => void;
}

const STATUS_OPTIONS: { value: WorkItemStatus; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
];

const PRIORITY_OPTIONS: { value: WorkItemPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const SORT_OPTIONS: { value: FilterState["sort"]; label: string }[] = [
  { value: "created_desc", label: "Newest first" },
  { value: "created_asc", label: "Oldest first" },
  { value: "priority", label: "Priority" },
  { value: "title", label: "Title A-Z" },
];

const PLACEHOLDER_VALUE = "__all__";

export function ItemFilters({
  filters,
  onFilterChange,
  onClear,
}: ItemFiltersProps) {
  const hasActiveFilters =
    filters.status !== undefined ||
    filters.priority !== undefined ||
    filters.tags.length > 0 ||
    filters.sort !== "created_desc";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Status filter */}
      <Select
        value={filters.status ?? PLACEHOLDER_VALUE}
        onValueChange={(v) =>
          onFilterChange(
            "status",
            v === PLACEHOLDER_VALUE ? undefined : (v as WorkItemStatus),
          )
        }
      >
        <SelectTrigger className="w-[140px] h-9 text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={PLACEHOLDER_VALUE}>All statuses</SelectItem>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Priority filter */}
      <Select
        value={filters.priority ?? PLACEHOLDER_VALUE}
        onValueChange={(v) =>
          onFilterChange(
            "priority",
            v === PLACEHOLDER_VALUE ? undefined : (v as WorkItemPriority),
          )
        }
      >
        <SelectTrigger className="w-[140px] h-9 text-xs">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={PLACEHOLDER_VALUE}>All priorities</SelectItem>
          {PRIORITY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Sort */}
      <Select
        value={filters.sort}
        onValueChange={(v) =>
          onFilterChange("sort", v as FilterState["sort"])
        }
      >
        <SelectTrigger className="w-[150px] h-9 text-xs">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 text-xs gap-1"
          onClick={onClear}
        >
          <X className="h-3 w-3" />
          Clear
        </Button>
      )}
    </div>
  );
}
