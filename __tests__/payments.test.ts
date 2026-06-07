import { getPaymentSheetConfig } from '../src/lib/payments';

describe('payment helpers', () => {
  it('extracts Stripe payment sheet config from a valid edge function response', () => {
    expect(getPaymentSheetConfig({
      client_secret: 'pi_secret_123',
      payment_intent_id: 'pi_123',
    })).toEqual({
      clientSecret: 'pi_secret_123',
      paymentIntentId: 'pi_123',
    });
  });

  it('rejects malformed payment setup responses before Stripe initialization', () => {
    expect(() => getPaymentSheetConfig(null)).toThrow('Payment setup did not return a valid response.');
    expect(() => getPaymentSheetConfig({ success: true })).toThrow('Payment setup did not return a Stripe client secret.');
    expect(() => getPaymentSheetConfig({ client_secret: '   ' })).toThrow('Payment setup did not return a Stripe client secret.');
  });
});

