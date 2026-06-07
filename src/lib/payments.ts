export interface PaymentIntentSheetConfig {
  clientSecret: string;
  paymentIntentId?: string;
}

export function getPaymentSheetConfig(response: unknown): PaymentIntentSheetConfig {
  if (!response || typeof response !== 'object') {
    throw new Error('Payment setup did not return a valid response.');
  }

  const data = response as { client_secret?: unknown; payment_intent_id?: unknown };
  if (typeof data.client_secret !== 'string' || data.client_secret.trim().length === 0) {
    throw new Error('Payment setup did not return a Stripe client secret.');
  }

  return {
    clientSecret: data.client_secret,
    paymentIntentId: typeof data.payment_intent_id === 'string' ? data.payment_intent_id : undefined,
  };
}

