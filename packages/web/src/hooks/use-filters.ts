import { useState, useCallback } from "react";
import type { WorkItemStatus, WorkItemPriority } from "@/lib/api-client";

export interface FilterState {
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  tags: string[];
  sort: "created_desc" | "created_asc" | "priority" | "title";
  query: string;
}

const DEFAULT_FILTERS: FilterState = {
  status: undefined,
  priority: undefined,
  tags: [],
  sort: "created_desc",
  query: "",
};

export function parseFiltersFromURL(searchParams: URLSearchParams): FilterState {
  const status = searchParams.get("status") as WorkItemStatus | null;
  const priority = searchParams.get("priority") as WorkItemPriority | null;
  const tagsRaw = searchParams.get("tags");
  const sort = searchParams.get("sort") as FilterState["sort"] | null;
  const query = searchParams.get("q") ?? "";

  return {
    status: status ?? undefined,
    priority: priority ?? undefined,
    tags: tagsRaw
      ? tagsRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
    sort: sort ?? "created_desc",
    query,
  };
}

export function filtersToURLParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.tags.length > 0) params.set("tags", filters.tags.join(","));
  if (filters.sort !== "created_desc") params.set("sort", filters.sort);
  if (filters.query) params.set("q", filters.query);
  return params;
}

export function useFilters(initial: FilterState) {
  const [filters, setFilters] = useState<FilterState>(initial);

  const setFilter = useCallback(
    <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
      setFilters((prev) => {
        const next = { ...prev, [key]: value };
        // Push updated URL without full page reload for search query
        // For other filters, navigate to trigger SSR re-fetch
        if (typeof window !== "undefined") {
          const params = filtersToURLParams(next);
          const qs = params.toString();
          const newUrl =
            window.location.pathname + (qs ? `?${qs}` : "");

          if (key === "query") {
            // For text search, update URL without navigation (client-side filter)
            window.history.replaceState(null, "", newUrl);
          } else {
            // For server-side filters, navigate to trigger SSR
            window.location.href = newUrl;
          }
        }
        return next;
      });
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    if (typeof window !== "undefined") {
      window.location.href = window.location.pathname;
    }
  }, []);

  const toURLParams = useCallback(() => {
    return filtersToURLParams(filters);
  }, [filters]);

  return { filters, setFilter, clearFilters, toURLParams };
}
