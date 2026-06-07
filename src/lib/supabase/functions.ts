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
        if (typeof message === 'string' && message.trim()) return message;
      }
    } catch {
      try {
        const text = await (typeof response.clone === 'function' ? response.clone() : response).text?.();
        if (text?.trim()) return text.trim();
      } catch {
        // Fall through to the SDK error message.
      }
    }
  }

  if (maybeError.message?.trim()) return maybeError.message;
  return fallback;
}
