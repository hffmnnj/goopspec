import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import type { WorkItem } from "@/lib/api-client";

interface DeleteItemDialogProps {
  projectId: string;
  item: WorkItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (itemId: string) => void;
}

export function DeleteItemDialog({
  projectId,
  item,
  open,
  onOpenChange,
  onDeleted,
}: DeleteItemDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    setSubmitting(true);
    setError(null);

    try {
      await api.items.delete(projectId, item.id);
      onDeleted(item.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete item.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Work Item</DialogTitle>
          <DialogDescription>
            This action cannot be undone. The work item will be permanently
            removed.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/50 p-3">
          <p className="text-sm font-medium">{item.title}</p>
          {item.description && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {item.description}
            </p>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={submitting}
          >
            {submitting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
