import {
  Circle,
  MessageSquare,
  FileText,
  Zap,
  Search,
  CheckCircle,
} from "lucide-react";
import type { WorkflowPhase } from "@/lib/api-client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Phase configuration
// ---------------------------------------------------------------------------

interface PhaseConfig {
  icon: typeof Circle;
  label: string;
  className: string;
}

const phaseConfig: Record<string, PhaseConfig> = {
  idle: {
    icon: Circle,
    label: "Idle",
    className: "text-muted-foreground",
  },
  discuss: {
    icon: MessageSquare,
    label: "Discuss",
    className: "text-blue-600 dark:text-blue-400",
  },
  plan: {
    icon: FileText,
    label: "Plan",
    className: "text-violet-600 dark:text-violet-400",
  },
  execute: {
    icon: Zap,
    label: "Execute",
    className: "text-amber-600 dark:text-amber-400",
  },
  audit: {
    icon: Search,
    label: "Audit",
    className: "text-orange-600 dark:text-orange-400",
  },
  accept: {
    icon: CheckCircle,
    label: "Accept",
    className: "text-green-600 dark:text-green-400",
  },
  complete: {
    icon: CheckCircle,
    label: "Complete",
    className: "text-green-600 dark:text-green-400",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PhaseIndicatorProps {
  phase: WorkflowPhase | string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

const labelSizeClasses = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export function PhaseIndicator({
  phase,
  size = "md",
  showLabel = true,
  className,
}: PhaseIndicatorProps) {
  const config = phaseConfig[phase] ?? phaseConfig.idle;
  const Icon = config.icon;

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", config.className, className)}
      aria-label={`Phase: ${config.label}`}
    >
      <Icon className={sizeClasses[size]} aria-hidden="true" />
      {showLabel && (
        <span className={cn("font-medium", labelSizeClasses[size])}>
          {config.label}
        </span>
      )}
    </span>
  );
}

export { phaseConfig };
