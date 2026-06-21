import type { GoopSpecDB } from "./index.js";

export interface BatchItemResult {
  index: number;
  ok: boolean;
  detail: string;
}

export interface BatchResult {
  total: number;
  succeeded: number;
  failed: number;
  items: BatchItemResult[];
}

class BatchItemError extends Error {
  constructor(
    public readonly index: number,
    public readonly detail: string,
  ) {
    super(detail);
    this.name = "BatchItemError";
  }
}

function getErrorDetail(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return String(error);
}

function failedItem(index: number, detail: string): BatchItemResult {
  return { index, ok: false, detail };
}

export function formatBatchResult(result: BatchResult, label: string): string {
  const failureSummary = result.failed > 0 ? `, ${result.failed} failed` : "";
  const lines = [`Batch ${label}: ${result.succeeded}/${result.total} succeeded${failureSummary}.`];

  for (const item of result.items) {
    lines.push(`- [${item.index}] ${item.ok ? "OK" : "FAIL"}: ${item.detail}`);
  }

  return lines.join("\n");
}

export function runBatch<TItem>(
  db: GoopSpecDB,
  items: TItem[],
  processFn: (item: TItem, index: number) => string,
): BatchResult {
  if (items.length === 0) {
    return { total: 0, succeeded: 0, failed: 0, items: [] };
  }

  const successes: BatchItemResult[] = [];

  try {
    db.runTransaction(() => {
      for (const [index, item] of items.entries()) {
        try {
          const detail = processFn(item, index);
          successes.push({ index, ok: true, detail });
        } catch (error) {
          throw new BatchItemError(index, getErrorDetail(error));
        }
      }
    });

    return {
      total: items.length,
      succeeded: successes.length,
      failed: 0,
      items: successes,
    };
  } catch (error) {
    const failureIndex = error instanceof BatchItemError ? error.index : null;
    const failureDetail = getErrorDetail(error);
    const resultItems = items.map((_, index) => {
      if (index === failureIndex) {
        return failedItem(index, failureDetail);
      }

      if (index < successes.length) {
        return failedItem(index, "rolled back due to batch failure");
      }

      return failedItem(index, "not processed due to batch failure");
    });

    return {
      total: items.length,
      succeeded: 0,
      failed: items.length,
      items: resultItems,
    };
  }
}
