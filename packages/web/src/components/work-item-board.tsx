import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkItemCard } from "@/components/work-item-card";
import { CreateItemDialog } from "@/components/create-item-dialog";
import { EditItemDialog } from "@/components/edit-item-dialog";
import { DeleteItemDialog } from "@/components/delete-item-dialog";
import type { WorkItem, WorkItemStatus } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface WorkItemBoardProps {
  projectId: string;
  items: WorkItem[];
  searchQuery?: string;
}

interface ColumnDef {
  id: string;
  label: string;
  statuses: WorkItemStatus[];
}

const columns: ColumnDef[] = [
  { id: "active", label: "Active", statuses: ["todo", "in_progress"] },
  { id: "review", label: "Review", statuses: ["review"] },
  { id: "done", label: "Done", statuses: ["done"] },
];

function filterBySearch(items: WorkItem[], query: string): WorkItem[] {
  if (!query.trim()) return items;
  const lower = query.toLowerCase();
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(lower) ||
      item.description?.toLowerCase().includes(lower) ||
      item.tags.some((t) => t.toLowerCase().includes(lower)),
  );
}

export function WorkItemBoard({
  projectId,
  items: initialItems,
  searchQuery = "",
}: WorkItemBoardProps) {
  const [items, setItems] = useState<WorkItem[]>(initialItems);
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<WorkItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<WorkItem | null>(null);

  const filtered = useMemo(
    () => filterBySearch(items, searchQuery),
    [items, searchQuery],
  );

  const backlogItems = useMemo(
    () =>
      filtered
        .filter((i) => i.status === "backlog")
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [filtered],
  );

  const columnItems = useMemo(() => {
    const map: Record<string, WorkItem[]> = {};
    for (const col of columns) {
      map[col.id] = filtered
        .filter((i) => col.statuses.includes(i.status))
        .sort((a, b) => a.orderIndex - b.orderIndex);
    }
    return map;
  }, [filtered]);

  function handleStatusChange(updated: WorkItem) {
    setItems((prev) =>
      prev.map((i) => (i.id === updated.id ? updated : i)),
    );
  }

  function handleCreated(newItem: WorkItem) {
    setItems((prev) => [...prev, newItem]);
    setCreateOpen(false);
  }

  function handleUpdated(updated: WorkItem) {
    setItems((prev) =>
      prev.map((i) => (i.id === updated.id ? updated : i)),
    );
    setEditItem(null);
  }

  function handleDeleted(deletedId: string) {
    setItems((prev) => prev.filter((i) => i.id !== deletedId));
    setDeleteItem(null);
  }

  const hasItems = items.length > 0;

  return (
    <div className="space-y-4">
      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Work Items</h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New Item
        </Button>
      </div>

      {!hasItems && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            No work items yet. Create your first item above.
          </p>
        </div>
      )}

      {hasItems && (
        <>
          {/* Backlog collapsible */}
          {backlogItems.length > 0 && (
            <div className="rounded-lg border">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
                onClick={() => setBacklogOpen((prev) => !prev)}
                aria-expanded={backlogOpen}
              >
                {backlogOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Backlog
                <span className="ml-auto text-xs text-muted-foreground">
                  {backlogItems.length}
                </span>
              </button>
              {backlogOpen && (
                <div className="border-t px-4 py-3 space-y-2">
                  {backlogItems.map((item) => (
                    <WorkItemCard
                      key={item.id}
                      item={item}
                      projectId={projectId}
                      onStatusChange={handleStatusChange}
                      onEdit={setEditItem}
                      onDelete={setDeleteItem}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Board columns */}
          <div className="grid gap-4 md:grid-cols-3">
            {columns.map((col) => {
              const colItems = columnItems[col.id] ?? [];
              return (
                <div key={col.id} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      {col.label}
                    </h3>
                    <span
                      className={cn(
                        "inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[10px] font-medium",
                        colItems.length > 0
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {colItems.length}
                    </span>
                  </div>

                  <div className="min-h-[120px] space-y-2 rounded-lg border border-dashed bg-muted/20 p-2">
                    {colItems.length === 0 && (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        Nothing here
                      </p>
                    )}
                    {colItems.map((item) => (
                      <WorkItemCard
                        key={item.id}
                        item={item}
                        projectId={projectId}
                        onStatusChange={handleStatusChange}
                        onEdit={setEditItem}
                        onDelete={setDeleteItem}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Dialogs */}
      <CreateItemDialog
        projectId={projectId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />

      {editItem && (
        <EditItemDialog
          projectId={projectId}
          item={editItem}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditItem(null);
          }}
          onUpdated={handleUpdated}
        />
      )}

      {deleteItem && (
        <DeleteItemDialog
          projectId={projectId}
          item={deleteItem}
          open={true}
          onOpenChange={(open) => {
            if (!open) setDeleteItem(null);
          }}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
