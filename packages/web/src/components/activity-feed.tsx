import { Activity, Play, Pause, CheckCircle2, XCircle, Clock } from "lucide-react";
import type { WorkflowSession } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface ActivityFeedProps {
  sessions: WorkflowSession[];
  className?: string;
}

const statusConfig: Record<
  WorkflowSession["status"],
  { icon: typeof Activity; label: string; className: string }
> = {
  running: {
    icon: Play,
    label: "Running",
    className: "text-green-600 dark:text-green-400",
  },
  paused: {
    icon: Pause,
    label: "Paused",
    className: "text-yellow-600 dark:text-yellow-400",
  },
  completed: {
    icon: CheckCircle2,
    label: "Completed",
    className: "text-blue-600 dark:text-blue-400",
  },
  failed: {
    icon: XCircle,
    label: "Failed",
    className: "text-red-600 dark:text-red-400",
  },
  pending: {
    icon: Clock,
    label: "Pending",
    className: "text-muted-foreground",
  },
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

export function ActivityFeed({ sessions, className }: ActivityFeedProps) {
  if (sessions.length === 0) {
    return (
      <div className={cn("text-center py-8 text-muted-foreground", className)}>
        <Activity className="mx-auto h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">No recent workflow activity.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      {sessions.map((session) => {
        const config = statusConfig[session.status];
        const Icon = config.icon;

        return (
          <div
            key={session.id}
            className="flex items-start gap-3 rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
          >
            <Icon
              className={cn("mt-0.5 h-4 w-4 shrink-0", config.className)}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">
                {session.workflowId}
                <span className="ml-1.5 font-normal text-muted-foreground">
                  &middot; {session.phase}
                </span>
              </p>
              {session.status === "running" && session.activeAgent && (
                <p className="text-xs text-muted-foreground truncate">
                  Agent: {session.activeAgent}
                </p>
              )}
              {session.status === "running" &&
                session.totalWaves > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Wave {session.currentWave}/{session.totalWaves}
                  </p>
                )}
              {session.blockerDescription && (
                <p className="text-xs text-destructive truncate">
                  Blocked: {session.blockerDescription}
                </p>
              )}
            </div>
            <time
              className="shrink-0 text-xs text-muted-foreground"
              dateTime={session.updatedAt}
            >
              {formatTime(session.updatedAt)}
            </time>
          </div>
        );
      })}
    </div>
  );
}
