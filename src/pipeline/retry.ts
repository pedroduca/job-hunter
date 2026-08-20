// Shared retry-with-backoff for provider fetches. Extracted from the ad-hoc fixed-delay
// loops that used to be duplicated in valig.ts and harvestapi.ts (stepstone.ts and
// indeed.ts had no retry at all).

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 5_000;

function isTransientNetworkError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNABORTED';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  isRetryable?: (err: unknown) => boolean;
}

/**
 * Runs `fn`, retrying on transient errors with exponential backoff
 * (baseDelayMs, 2×, 4×, ...). Non-retryable errors (per `isRetryable`) and the
 * final attempt's error are thrown as-is.
 */
export async function withRetry<T>(
  label: string,
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const isRetryable = opts.isRetryable ?? isTransientNetworkError;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (isRetryable(err) && attempt < maxAttempts) {
        const delayMs = baseDelayMs * 2 ** (attempt - 1);
        const code = (err as NodeJS.ErrnoException)?.code ?? (err as Error).message;
        console.warn(`[retry] ${label} attempt ${attempt} failed (${code}), retrying in ${Math.round(delayMs / 1000)}s…`);
        await sleep(delayMs);
      } else {
        break;
      }
    }
  }
  throw lastErr;
}

export { isTransientNetworkError };
