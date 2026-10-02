function isTransientInfrastructureMessage(message: string) {
  const lower = message.toLowerCase();
  return lower.includes('database timed out')
    || lower.includes('connection to the database timed out')
    || lower.includes('databasetimeout')
    || lower.includes('upload failed (544)')
    || lower.includes('(544)')
    || lower.includes('network request failed')
    || lower.includes('fetch failed')
    || lower.includes('failed to fetch')
    || lower.includes('timed out')
    || lower.includes('timeout')
    || lower.includes('networkerror')
    || lower.includes('socket')
    || lower.includes('offline');
}

function isDatabaseInternalMessage(message: string) {
  const lower = message.toLowerCase();
  return lower.includes('row-level security')
    || lower.includes('violates row-level security policy')
    || lower.includes('permission denied')
    || lower.includes('schema cache')
    || lower.includes('foreign key constraint')
    || lower.includes('not-null constraint')
    || lower.includes('duplicate key value violates unique constraint')
    || /column .* does not exist/i.test(message)
    || /could not find the .* column of/i.test(message)
    || /relation .* does not exist/i.test(message);
}

function isStorageMessage(message: string) {
  const lower = message.toLowerCase();
  return lower.includes('storage')
    || lower.includes('bucket')
    || lower.includes('object not found')
    || lower.includes('payload too large')
    || lower.includes('entity too large')
    || lower.includes('upload failed (544)')
    || lower.includes('databasetimeout');
}

function isStripeOrPaymentMessage(message: string) {
  const lower = message.toLowerCase();
  return lower.includes('stripe')
    || lower.includes('paymentintent')
    || lower.includes('payment intent')
    || lower.includes('client_secret')
    || lower.includes('client secret')
    || lower.includes('card was declined')
    || lower.includes('requires_payment_method');
}

function isEdgeFunctionMessage(message: string) {
  const lower = message.toLowerCase();
  // Match SDK/transport noise only — keep clear server body messages like
  // "Function not found" or domain errors for the user.
  return lower.includes('edge function returned')
    || lower.includes('failed to send a request to the edge function')
    || lower.includes('functionsrelayerror')
    || lower.includes('functionshttperror')
    || lower.includes('non-2xx status code');
}

/** More specific fallbacks when raw messages are internal/noisy. */
export function classifyAppErrorFallback(message: string, fallback: string) {
  const improvedDefault = (improved: string) => (
    fallback === 'Please try again.'
    || fallback === 'Request failed. Please try again.'
      ? improved
      : fallback
  );

  if (isTransientInfrastructureMessage(message)) {
    if (message.toLowerCase().includes('544') || message.toLowerCase().includes('databasetimeout')) {
      return improvedDefault(
        'Storage is busy or timing out on the server. Wait a moment and try a smaller photo, or retry after Supabase recovers.',
      );
    }
    return improvedDefault('Network issue. Check your connection and try again.');
  }
  if (isStripeOrPaymentMessage(message)) {
    return improvedDefault('Payment could not be completed. Check your card details or try again in a moment.');
  }
  if (isStorageMessage(message)) {
    return improvedDefault('File upload failed. Try a smaller photo or check your connection.');
  }
  if (isEdgeFunctionMessage(message)) {
    return improvedDefault('A server action failed. Please try again in a moment.');
  }
  if (isDatabaseInternalMessage(message)) {
    return fallback;
  }
  return null;
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
  if (trimmed === 'No homeowner account found for that email') {
    return 'Enter the email for an existing WalkerAI homeowner account before creating a managed project.';
  }
  const classified = classifyAppErrorFallback(trimmed, fallback);
  if (classified) return classified;
  return trimmed;
}

export function formatAppSafeErrorMessage(error: unknown, fallback = 'Please try again.') {
  if (error instanceof Error && error.message.trim()) {
    return appSafeFunctionMessage(error.message, fallback);
  }

  if (typeof error === 'string' && error.trim()) {
    return appSafeFunctionMessage(error, fallback);
  }

  if (error && typeof error === 'object') {
    const fields = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    const messages = [fields.message, fields.details, fields.hint, fields.code]
      .filter((message): message is string => typeof message === 'string' && message.trim().length > 0);

    if (messages.some((message) => (
      isTransientInfrastructureMessage(message)
      || isDatabaseInternalMessage(message)
      || isStorageMessage(message)
      || isStripeOrPaymentMessage(message)
      || isEdgeFunctionMessage(message)
    ))) {
      return classifyAppErrorFallback(messages[0] ?? '', fallback) ?? fallback;
    }

    if (messages[0]) {
      return appSafeFunctionMessage(messages[0], fallback);
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
