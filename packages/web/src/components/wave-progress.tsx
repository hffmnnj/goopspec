import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WaveStatus = "pending" | "active" | "complete";

interface WaveProgressProps {
  currentWave: number;
  totalWaves: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function getWaveStatus(
  waveIndex: number,
  currentWave: number,
  isTerminal: boolean,
): WaveStatus {
  if (isTerminal) return "complete";
  if (waveIndex + 1 < currentWave) return "complete";
  if (waveIndex + 1 === currentWave) return "active";
  return "pending";
}

const statusStyles: Record<WaveStatus, string> = {
  complete:
    "border-primary bg-primary/10 text-primary",
  active:
    "border-primary bg-primary text-primary-foreground",
  pending:
    "border-muted bg-muted/30 text-muted-foreground",
};

const statusLabels: Record<WaveStatus, string> = {
  complete: "Complete",
  active: "Active",
  pending: "Pending",
};

export function WaveProgress({
  currentWave,
  totalWaves,
  className,
}: WaveProgressProps) {
  if (totalWaves <= 0) {
    return (
      <p className={cn("text-sm text-muted-foreground italic", className)}>
        No waves defined yet.
      </p>
    );
  }

  const isTerminal = currentWave > totalWaves;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Waves
        </h3>
        <span className="text-xs text-muted-foreground">
          {Math.min(currentWave, totalWaves)} / {totalWaves}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: totalWaves }, (_, i) => {
          const status = getWaveStatus(i, currentWave, isTerminal);
          return (
            <div
              key={i}
              className={cn(
                "flex flex-col items-center justify-center rounded-lg border-2 px-3 py-2.5 transition-colors",
                statusStyles[status],
              )}
            >
              <span className="text-lg font-bold leading-none">{i + 1}</span>
              <span className="mt-1 text-[10px] font-medium uppercase tracking-wider">
                {statusLabels[status]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
