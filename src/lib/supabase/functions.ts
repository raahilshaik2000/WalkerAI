function isTransientInfrastructureMessage(message: string) {
  const lower = message.toLowerCase();
  return lower.includes('database timed out')
    || lower.includes('connection to the database timed out')
    || lower.includes('network request failed')
    || lower.includes('fetch failed')
    || lower.includes('failed to fetch')
    || lower.includes('timed out')
    || lower.includes('timeout');
}

export function appSafeFunctionMessage(message: string, fallback = 'Please try again.') {
  const trimmed = message.trim();
  if (trimmed === 'Markup must be between 0 and 50 percent') {
    return 'Management allowance must be between 0% and 50%.';
  }
  if (trimmed === 'Concierge fee must be between 0 and 25 percent') {
    return 'Concierge allowance must be between 0% and 25%.';
  }
  if (trimmed === 'GC markup approval request is missing a valid markup percentage') {
    return 'Management allowance approval request is missing a valid percentage.';
  }
  if (trimmed === 'GC terms approval request is missing a valid concierge fee percentage') {
    return 'Concierge allowance approval request is missing a valid percentage.';
  }
  if (isTransientInfrastructureMessage(trimmed)) {
    return fallback;
  }
  return trimmed;
}

export function formatAppSafeErrorMessage(error: unknown, fallback = 'Please try again.') {
  if (error instanceof Error && error.message.trim()) {
    return appSafeFunctionMessage(error.message, fallback);
  }

  if (typeof error === 'string' && error.trim()) {
    return appSafeFunctionMessage(error, fallback);
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return appSafeFunctionMessage(message, fallback);
    }
  }

  return fallback;
}

export async function formatSupabaseFunctionError(error: unknown, fallback = 'Request failed. Please try again.') {
  if (!error) return fallback;

  const maybeError = error as {
    message?: string;
    context?: {
      clone?: () => Response;
      json?: () => Promise<unknown>;
      text?: () => Promise<string>;
    };
  };

  const response = maybeError.context;
  if (response) {
    try {
      const body = await (typeof response.clone === 'function' ? response.clone() : response).json?.();
      if (body && typeof body === 'object') {
        const message = (body as { error?: unknown; message?: unknown; msg?: unknown }).error
          ?? (body as { message?: unknown }).message
          ?? (body as { msg?: unknown }).msg;
        if (typeof message === 'string' && message.trim()) return appSafeFunctionMessage(message, fallback);
      }
    } catch {
      try {
        const text = await (typeof response.clone === 'function' ? response.clone() : response).text?.();
        if (text?.trim()) return appSafeFunctionMessage(text, fallback);
      } catch {
        // Fall through to the SDK error message.
      }
    }
  }

  if (maybeError.message?.trim()) return appSafeFunctionMessage(maybeError.message, fallback);
  return fallback;
}
