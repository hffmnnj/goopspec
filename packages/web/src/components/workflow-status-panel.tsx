import { useEffect, useState } from "react";
import { AlertTriangle, Wifi, WifiOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhaseIndicator } from "@/components/phase-indicator";
import { useWorkflowStream } from "@/hooks/use-workflow-stream";
import { api } from "@/lib/api-client";
import type { WorkflowSession } from "@/lib/api-client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WorkflowStatusPanelProps {
  sessionId: string;
  projectId: string;
  initialSession?: WorkflowSession;
}

// ---------------------------------------------------------------------------
// Connection dot
// ---------------------------------------------------------------------------

function ConnectionIndicator({
  type,
}: {
  type: "websocket" | "sse" | "disconnected";
}) {
  const config = {
    websocket: {
      color: "bg-green-500",
      label: "Connected (WebSocket)",
    },
    sse: {
      color: "bg-yellow-500",
      label: "Connected (SSE)",
    },
    disconnected: {
      color: "bg-red-500",
      label: "Disconnected",
    },
  };

  const c = config[type];

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn("h-2 w-2 rounded-full", c.color)}
        aria-hidden="true"
      />
      <span className="sr-only">{c.label}</span>
      {type === "disconnected" ? (
        <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Wave progress bar
// ---------------------------------------------------------------------------

function WaveBar({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  if (total <= 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Wave {current} of {total}
        </span>
        <span>{total > 0 ? Math.round((current / total) * 100) : 0}%</span>
      </div>
      <div className="flex gap-1" role="progressbar" aria-valuenow={current} aria-valuemin={0} aria-valuemax={total}>
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={cn(
              "h-2 flex-1 rounded-full transition-colors",
              i < current
                ? "bg-primary"
                : i === current
                  ? "bg-primary/50"
                  : "bg-muted",
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function StatusSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-4 animate-pulse rounded-full bg-muted" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="space-y-1.5">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="flex gap-1">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-2 flex-1 animate-pulse rounded-full bg-muted" />
            ))}
          </div>
        </div>
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Error fallback
// ---------------------------------------------------------------------------

function ErrorFallback({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <Card className="border-destructive/50">
      <CardContent className="py-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive mb-2" />
        <p className="text-sm text-destructive mb-3">
          {error ?? "Something went wrong loading the status panel."}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="text-sm text-primary hover:underline"
        >
          Try again
        </button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorkflowStatusPanel({
  sessionId,
  projectId,
  initialSession,
}: WorkflowStatusPanelProps) {
  const stream = useWorkflowStream(sessionId, projectId);
  const [fetchedSession, setFetchedSession] = useState<WorkflowSession | null>(
    initialSession ?? null,
  );
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch initial session data if not provided
  useEffect(() => {
    if (initialSession) return;

    let cancelled = false;
    api.workflows
      .get(sessionId)
      .then((session) => {
        if (!cancelled) setFetchedSession(session);
      })
      .catch((err) => {
        if (!cancelled) {
          setFetchError(
            err instanceof Error ? err.message : "Failed to load workflow.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, initialSession]);

  // Merge: live stream session takes priority over fetched
  const session = stream.session ?? fetchedSession;

  if (fetchError && !session) {
    return (
      <ErrorFallback
        error={fetchError}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (!session) {
    return <StatusSkeleton />;
  }

  const isTerminal = session.status === "completed" || session.status === "failed";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Workflow Status</CardTitle>
          {!isTerminal && (
            <ConnectionIndicator type={stream.connectionType} />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Phase */}
        <div className="flex items-center justify-between">
          <PhaseIndicator phase={session.phase} size="md" />
          <Badge
            variant={
              session.status === "running"
                ? "default"
                : session.status === "completed"
                  ? "secondary"
                  : session.status === "failed"
                    ? "destructive"
                    : "outline"
            }
          >
            {session.status}
          </Badge>
        </div>

        {/* Wave progress */}
        {session.totalWaves > 0 && (
          <WaveBar current={session.currentWave} total={session.totalWaves} />
        )}

        {/* Active agent */}
        {session.activeAgent && (
          <div className="text-sm">
            <span className="text-muted-foreground">Agent: </span>
            <span className="font-medium">{session.activeAgent}</span>
          </div>
        )}

        {/* Blocker alert */}
        {session.blockerDescription && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold text-destructive uppercase tracking-wider">
                Blocked
              </p>
              <p className="text-sm text-destructive">
                {session.blockerDescription}
              </p>
            </div>
          </div>
        )}

        {/* Connection error */}
        {stream.error && !isTerminal && (
          <p className="text-xs text-muted-foreground">{stream.error}</p>
        )}
      </CardContent>
    </Card>
  );
}
