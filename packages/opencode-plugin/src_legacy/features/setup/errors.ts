/**
 * Setup Error Handling
 * Categorizes and provides actionable suggestions for setup errors
 * 
 * @module features/setup/errors
 */

// ============================================================================
// Error Categories
// ============================================================================

/**
 * Category of an installation error
 */
export type ErrorCategory = 
  | "network"
  | "permission"
  | "compatibility"
  | "not-found"
  | "timeout"
  | "unknown";

/**
 * A categorized error with actionable suggestion
 */
export interface CategorizedError {
  /** Error category for programmatic handling */
  category: ErrorCategory;
  /** User-friendly error message */
  message: string;
  /** Actionable suggestion to fix the error */
  suggestion: string;
  /** Whether the operation can be retried */
  retryable: boolean;
  /** Original error message */
  originalError?: string;
}

// ============================================================================
// Error Patterns
// ============================================================================

interface ErrorPattern {
  patterns: RegExp[];
  category: ErrorCategory;
  message: string;
  suggestion: string;
  retryable: boolean;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // Network errors
  {
    patterns: [
      /ECONNREFUSED/i,
      /ENOTFOUND/i,
      /ETIMEDOUT/i,
      /network/i,
      /fetch failed/i,
      /unable to connect/i,
      /connection refused/i,
    ],
    category: "network",
    message: "Network connection failed",
    suggestion: "Check your internet connection and try again. If behind a proxy, configure your npm/bun proxy settings.",
    retryable: true,
  },
  // Permission errors
  {
    patterns: [
      /EACCES/i,
      /permission denied/i,
      /EPERM/i,
      /access denied/i,
      /insufficient privileges/i,
    ],
    category: "permission",
    message: "Permission denied",
    suggestion: "Try running with elevated privileges (sudo on Unix), or install to a user directory instead of global.",
    retryable: false,
  },
  // Platform compatibility errors
  {
    patterns: [
      /unsupported platform/i,
      /not supported/i,
      /platform.*not.*available/i,
      /incompatible.*platform/i,
      /arch.*not.*supported/i,
      /os.*not.*supported/i,
      /no prebuilt binaries/i,
      /prebuild.*not found/i,
    ],
    category: "compatibility",
    message: "Platform not supported",
    suggestion: "This native package may not be available for your platform. Consider using an alternative (e.g., OpenAI embeddings instead of local).",
    retryable: false,
  },
  // Package not found errors
  {
    patterns: [
      /404/,
      /not found/i,
      /no such package/i,
      /package.*does not exist/i,
      /couldn't find package/i,
      /no matching version/i,
    ],
    category: "not-found",
    message: "Package not found",
    suggestion: "The package may have been renamed, removed, or the version doesn't exist. Check the package name and try again.",
    retryable: false,
  },
  // Timeout errors
  {
    patterns: [
      /timeout/i,
      /timed out/i,
      /deadline exceeded/i,
    ],
    category: "timeout",
    message: "Operation timed out",
    suggestion: "The operation took too long. Try again with a faster connection, or increase the timeout setting.",
    retryable: true,
  },
];

// ============================================================================
// Error Categorization
// ============================================================================

/**
 * Categorize an installation error and provide actionable suggestions
 */
export function categorizeInstallError(error: string): CategorizedError {
  const lowerError = error.toLowerCase();
  
  // Try to match known patterns
  for (const pattern of ERROR_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(error) || regex.test(lowerError)) {
        return {
          category: pattern.category,
          message: pattern.message,
          suggestion: pattern.suggestion,
          retryable: pattern.retryable,
          originalError: error,
        };
      }
    }
  }
  
  // Unknown error - provide generic guidance
  return {
    category: "unknown",
    message: "Installation failed",
    suggestion: "Check the error message above. Common fixes: check network, verify package name, ensure platform compatibility.",
    retryable: true,
    originalError: error,
  };
}

/**
 * Format a categorized error for display
 */
export function formatCategorizedError(error: CategorizedError): string {
  const lines: string[] = [];
  
  const categoryIcon = {
    network: "🌐",
    permission: "🔒",
    compatibility: "⚙️",
    "not-found": "🔍",
    timeout: "⏱️",
    unknown: "❓",
  };
  
  lines.push(`${categoryIcon[error.category]} **${error.message}**`);
  lines.push("");
  lines.push(`💡 ${error.suggestion}`);
  
  if (error.retryable) {
    lines.push("");
    lines.push("*This error may be temporary - try again.*");
  }
  
  return lines.join("\n");
}

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Options for retry logic
 */
export interface RetryOptions {
  /** Maximum number of attempts */
  maxAttempts?: number;
  /** Initial delay in ms between attempts */
  initialDelayMs?: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier?: number;
  /** Maximum delay in ms */
  maxDelayMs?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 10000,
};

/**
 * Execute an async function with retry logic
 * Only retries on retryable errors
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = opts.initialDelayMs;
  
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if error is retryable
      const categorized = categorizeInstallError(lastError.message);
      if (!categorized.retryable || attempt === opts.maxAttempts) {
        throw lastError;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }
  
  throw lastError;
}

// ============================================================================
// Error Aggregation
// ============================================================================

/**
 * Aggregate multiple errors into a summary
 */
export function aggregateErrors(errors: CategorizedError[]): {
  summary: string;
  byCategory: Record<ErrorCategory, CategorizedError[]>;
  hasRetryable: boolean;
} {
  const byCategory: Record<ErrorCategory, CategorizedError[]> = {
    network: [],
    permission: [],
    compatibility: [],
    "not-found": [],
    timeout: [],
    unknown: [],
  };
  
  for (const error of errors) {
    byCategory[error.category].push(error);
  }
  
  const hasRetryable = errors.some(e => e.retryable);
  
  // Build summary
  const parts: string[] = [];
  if (byCategory.network.length > 0) {
    parts.push(`${byCategory.network.length} network error(s)`);
  }
  if (byCategory.permission.length > 0) {
    parts.push(`${byCategory.permission.length} permission error(s)`);
  }
  if (byCategory.compatibility.length > 0) {
    parts.push(`${byCategory.compatibility.length} compatibility issue(s)`);
  }
  if (byCategory["not-found"].length > 0) {
    parts.push(`${byCategory["not-found"].length} package(s) not found`);
  }
  if (byCategory.timeout.length > 0) {
    parts.push(`${byCategory.timeout.length} timeout(s)`);
  }
  if (byCategory.unknown.length > 0) {
    parts.push(`${byCategory.unknown.length} unknown error(s)`);
  }
  
  const summary = parts.length > 0 
    ? `Encountered: ${parts.join(", ")}` 
    : "No errors";
  
  return { summary, byCategory, hasRetryable };
}
