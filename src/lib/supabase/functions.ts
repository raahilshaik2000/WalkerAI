export function appSafeFunctionMessage(message: string) {
  const trimmed = message.trim();
  if (trimmed === 'Markup must be between 0 and 50 percent') {
    return 'Management allowance must be between 0% and 50%.';
  }
  if (trimmed === 'Concierge fee must be between 0 and 25 percent') {
    return 'Concierge allowance must be between 0% and 25%.';
  }
  return trimmed;
}

export function formatAppSafeErrorMessage(error: unknown, fallback = 'Please try again.') {
  if (error instanceof Error && error.message.trim()) {
    return appSafeFunctionMessage(error.message);
  }

  if (typeof error === 'string' && error.trim()) {
    return appSafeFunctionMessage(error);
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return appSafeFunctionMessage(message);
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
        if (typeof message === 'string' && message.trim()) return appSafeFunctionMessage(message);
      }
    } catch {
      try {
        const text = await (typeof response.clone === 'function' ? response.clone() : response).text?.();
        if (text?.trim()) return appSafeFunctionMessage(text);
      } catch {
        // Fall through to the SDK error message.
      }
    }
  }

  if (maybeError.message?.trim()) return appSafeFunctionMessage(maybeError.message);
  return fallback;
}
