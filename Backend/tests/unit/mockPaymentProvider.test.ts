import { describe, it, expect } from 'vitest';
import { MockPaymentProvider } from '../../src/integrations/payment/MockPaymentProvider';

describe('MockPaymentProvider', () => {
  const provider = new MockPaymentProvider();

  it('creates a PENDING payment with a mock transaction id', async () => {
    const result = await provider.createPayment({ orderId: 'order-1', amount: 170 });
    expect(result.status).toBe('PENDING');
    expect(result.providerTransactionId).toMatch(/^MOCK_TX_/);
  });

  it('verifies a payment as PROTECTED by default', async () => {
    const result = await provider.verifyPayment('order-1', { orderId: 'order-1', amount: 170 });
    expect(result.status).toBe('PROTECTED');
  });

  it('returns FAILED when simulateFailure is set', async () => {
    const result = await provider.verifyPayment('order-1', { simulateFailure: true });
    expect(result.status).toBe('FAILED');
  });

  it('refunds successfully with a refund id', async () => {
    const result = await provider.refundPayment({ paymentId: 'payment-1', amount: 170 });
    expect(result.status).toBe('REFUNDED');
    expect(result.refundId).toMatch(/^MOCK_REFUND_/);
  });
});
