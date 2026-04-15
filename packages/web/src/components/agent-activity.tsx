import {
  Play,
  Zap,
  CheckCircle,
  XCircle,
  Rocket,
  Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { WorkflowEvent } from "@/lib/api-client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Event type configuration
// ---------------------------------------------------------------------------

interface EventConfig {
  icon: typeof Activity;
  label: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline";
  className: string;
}

const eventConfig: Record<string, EventConfig> = {
  "workflow:started": {
    icon: Play,
    label: "Started",
    badgeVariant: "default",
    className: "text-green-600 dark:text-green-400",
  },
  "workflow:progress": {
    icon: Zap,
    label: "Progress",
    badgeVariant: "secondary",
    className: "text-amber-600 dark:text-amber-400",
  },
  "workflow:status": {
    icon: Zap,
    label: "Status Update",
    badgeVariant: "secondary",
    className: "text-blue-600 dark:text-blue-400",
  },
  "workflow:completed": {
    icon: CheckCircle,
    label: "Completed",
    badgeVariant: "default",
    className: "text-green-600 dark:text-green-400",
  },
  "workflow:failed": {
    icon: XCircle,
    label: "Failed",
    badgeVariant: "destructive",
    className: "text-red-600 dark:text-red-400",
  },
  "workflow:spawning": {
    icon: Rocket,
    label: "Spawning",
    badgeVariant: "outline",
    className: "text-violet-600 dark:text-violet-400",
  },
};

const defaultConfig: EventConfig = {
  icon: Activity,
  label: "Event",
  badgeVariant: "outline",
  className: "text-muted-foreground",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function summarizeData(data: Record<string, unknown>): string {
  const parts: string[] = [];

  if (data.phase) parts.push(`Phase: ${data.phase}`);
  if (data.wave) parts.push(`Wave ${data.wave}`);
  if (data.agent) parts.push(`Agent: ${data.agent}`);
  if (data.status) parts.push(`Status: ${data.status}`);
  if (data.blocker) parts.push(`Blocker: ${data.blocker}`);
  if (data.message && typeof data.message === "string") parts.push(data.message);

  return parts.length > 0 ? parts.join(" · ") : "";
}

function getPhaseFromEvent(event: WorkflowEvent): string | null {
  const phase = event.data.phase;
  return typeof phase === "string" ? phase : null;
}

// ---------------------------------------------------------------------------
// Grouped events by phase
// ---------------------------------------------------------------------------

interface PhaseGroup {
  phase: string;
  events: WorkflowEvent[];
}

function groupByPhase(events: WorkflowEvent[]): PhaseGroup[] {
  const groups: PhaseGroup[] = [];
  let currentPhase: string | null = null;

  for (const event of events) {
    const eventPhase: string = getPhaseFromEvent(event) ?? currentPhase ?? "unknown";

    if (eventPhase !== currentPhase) {
      currentPhase = eventPhase;
      groups.push({ phase: eventPhase, events: [event] });
    } else {
      groups[groups.length - 1].events.push(event);
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AgentActivityProps {
  events: WorkflowEvent[];
  className?: string;
}

export function AgentActivity({ events, className }: AgentActivityProps) {
  if (events.length === 0) {
    return (
      <div className={cn("text-center py-8 text-muted-foreground", className)}>
        <Activity className="mx-auto h-8 w-8 mb-2 opacity-40" aria-hidden="true" />
        <p className="text-sm">No activity recorded yet.</p>
      </div>
    );
  }

  const groups = groupByPhase(events);

  return (
    <div className={cn("space-y-6", className)}>
      {groups.map((group, gi) => (
        <div key={`${group.phase}-${gi}`}>
          {/* Phase group header */}
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.phase}
            </span>
            <div className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>

          {/* Events in this phase */}
          <div className="relative ml-3 border-l border-border pl-4">
            {group.events.map((event) => {
              const config = eventConfig[event.type] ?? defaultConfig;
              const Icon = config.icon;
              const summary = summarizeData(event.data);

              return (
                <div
                  key={event.id}
                  className="relative pb-4 last:pb-0"
                >
                  {/* Timeline dot */}
                  <div
                    className={cn(
                      "absolute -left-[21px] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 bg-background",
                      config.className,
                    )}
                    aria-hidden="true"
                  >
                    <div className={cn("h-1.5 w-1.5 rounded-full", config.className.replace("text-", "bg-"))} />
                  </div>

                  <div className="flex items-start gap-2">
                    <Icon
                      className={cn("mt-0.5 h-4 w-4 shrink-0", config.className)}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={config.badgeVariant} className="text-[10px] px-1.5 py-0">
                          {config.label}
                        </Badge>
                        <time
                          className="text-[10px] text-muted-foreground"
                          dateTime={event.timestamp}
                        >
                          {formatTimestamp(event.timestamp)}
                        </time>
                      </div>
                      {summary && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {summary}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
