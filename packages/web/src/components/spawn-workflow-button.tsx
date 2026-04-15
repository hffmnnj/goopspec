import { useState } from "react";
import { Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api-client";
import { useToast, ToastContainer } from "@/components/toast";

interface SpawnWorkflowButtonProps {
  projectId: string;
  workItemId: string;
  itemTitle: string;
}

export function SpawnWorkflowButton({
  projectId,
  workItemId,
  itemTitle,
}: SpawnWorkflowButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const session = await api.workflows.spawn({ projectId, workItemId });
      setDialogOpen(false);
      addToast("success", "Workflow started successfully.");
      // Navigate to the workflow detail page
      window.location.href = `/workflows/${session.id}`;
    } catch (err) {
      setDialogOpen(false);
      if (err instanceof ApiError) {
        addToast("error", `Failed to start workflow: ${err.message}`);
      } else {
        addToast(
          "error",
          "Failed to connect to the daemon. Is it running?",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setDialogOpen(true)}>
        <Play className="h-4 w-4" aria-hidden="true" />
        Start Workflow
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start Workflow</DialogTitle>
            <DialogDescription>
              Start a GoopSpec workflow for this item?
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-sm font-medium truncate">{itemTitle}</p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Starting…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" aria-hidden="true" />
                  Start Workflow
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>
  );
}
