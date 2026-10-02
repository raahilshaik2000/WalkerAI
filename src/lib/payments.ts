export interface PaymentIntentSheetConfig {
  clientSecret: string;
  paymentIntentId?: string;
}

export function getPaymentSheetConfig(response: unknown): PaymentIntentSheetConfig {
  if (!response || typeof response !== 'object') {
    throw new Error('Payment setup did not return a valid response. Please try again in a moment.');
  }

  const data = response as {
    client_secret?: unknown;
    payment_intent_id?: unknown;
    error?: unknown;
  };
  if (typeof data.error === 'string' && data.error.trim()) {
    throw new Error(data.error.trim());
  }
  if (typeof data.client_secret !== 'string' || data.client_secret.trim().length === 0) {
    throw new Error('Payment setup did not return a Stripe client secret. Confirm Stripe is configured and try again.');
  }

  return {
    clientSecret: data.client_secret,
    paymentIntentId: typeof data.payment_intent_id === 'string' ? data.payment_intent_id : undefined,
  };
}

export function formatPaymentUserError(error: unknown, fallback = 'Payment could not be completed. Please try again.') {
  if (error && typeof error === 'object') {
    const code = (error as { code?: string }).code;
    if (code === 'Canceled' || code === 'CanceledError') {
      return null;
    }
  }
  // Lazy import path avoided — callers already use formatSupabaseFunctionError for async cases.
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
}

