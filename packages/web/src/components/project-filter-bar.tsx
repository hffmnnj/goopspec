import { ItemFilters } from "@/components/item-filters";
import { ItemSearch } from "@/components/item-search";
import { useFilters, type FilterState } from "@/hooks/use-filters";

interface ProjectFilterBarProps {
  initialFilters: FilterState;
  onSearchChange?: (query: string) => void;
}

export function ProjectFilterBar({
  initialFilters,
  onSearchChange,
}: ProjectFilterBarProps) {
  const { filters, setFilter, clearFilters } = useFilters(initialFilters);

  function handleSearchChange(value: string) {
    setFilter("query", value);
    onSearchChange?.(value);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <ItemFilters
        filters={filters}
        onFilterChange={setFilter}
        onClear={clearFilters}
      />
      <ItemSearch value={filters.query} onChange={handleSearchChange} />
    </div>
  );
}
