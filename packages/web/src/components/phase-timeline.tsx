import { Check } from "lucide-react";
import type { WorkflowPhase } from "@/lib/api-client";
import { phaseConfig } from "@/components/phase-indicator";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Phase ordering
// ---------------------------------------------------------------------------

const PHASE_ORDER: WorkflowPhase[] = [
  "idle",
  "discuss",
  "plan",
  "execute",
  "accept",
  "complete",
];

const phaseIndex = new Map(PHASE_ORDER.map((p, i) => [p, i]));

function getPhaseStatus(
  phase: WorkflowPhase,
  currentPhase: WorkflowPhase | string,
  isTerminal: boolean,
): "completed" | "current" | "upcoming" {
  if (isTerminal) return "completed";
  const currentIdx = phaseIndex.get(currentPhase as WorkflowPhase) ?? 0;
  const phaseIdx = phaseIndex.get(phase) ?? 0;
  if (phaseIdx < currentIdx) return "completed";
  if (phaseIdx === currentIdx) return "current";
  return "upcoming";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PhaseTimelineProps {
  currentPhase: WorkflowPhase | string;
  isTerminal?: boolean;
  className?: string;
}

export function PhaseTimeline({
  currentPhase,
  isTerminal = false,
  className,
}: PhaseTimelineProps) {
  // Skip "idle" from display — it's the initial state before anything happens
  const displayPhases = PHASE_ORDER.filter((p) => p !== "idle");

  return (
    <nav aria-label="Workflow phases" className={className}>
      <ol className="flex items-center gap-0">
        {displayPhases.map((phase, index) => {
          const status = getPhaseStatus(phase, currentPhase, isTerminal);
          const config = phaseConfig[phase] ?? phaseConfig.idle;
          const Icon = config.icon;
          const isLast = index === displayPhases.length - 1;

          return (
            <li
              key={phase}
              className={cn("flex items-center", !isLast && "flex-1")}
            >
              {/* Step circle */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
                    status === "completed" &&
                      "border-primary bg-primary text-primary-foreground",
                    status === "current" &&
                      "border-primary bg-background text-primary",
                    status === "upcoming" &&
                      "border-muted bg-background text-muted-foreground",
                  )}
                  aria-current={status === "current" ? "step" : undefined}
                >
                  {status === "completed" ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium leading-none",
                    status === "current"
                      ? "text-primary"
                      : status === "completed"
                        ? "text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {config.label}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    "mx-1 h-0.5 flex-1",
                    status === "completed" ? "bg-primary" : "bg-muted",
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
