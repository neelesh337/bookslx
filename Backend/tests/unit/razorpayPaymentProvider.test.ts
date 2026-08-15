import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { RazorpayPaymentProvider } from '../../src/integrations/payment/RazorpayPaymentProvider';
import { AppError } from '../../src/utils/errors';

const KEY_ID = 'rzp_test_fakekey';
const KEY_SECRET = 'fake_key_secret_1234567890';
const WEBHOOK_SECRET = 'fake_webhook_secret_0987654321';

const provider = new RazorpayPaymentProvider(KEY_ID, KEY_SECRET, WEBHOOK_SECRET);

const sign = (body: string, secret: string) =>
  crypto.createHmac('sha256', secret).update(body).digest('hex');

describe('RazorpayPaymentProvider', () => {
  describe('verifySignature', () => {
    it('accepts a correctly signed checkout payload', () => {
      const orderId = 'order_rzp123';
      const paymentId = 'pay_rzp456';
      const signature = sign(`${orderId}|${paymentId}`, KEY_SECRET);

      expect(provider.verifySignature(orderId, paymentId, signature)).toBe(true);
    });

    it('rejects a tampered signature', () => {
      const signature = sign('order_rzp123|pay_rzp456', KEY_SECRET);
      // Tamper with the payment id
      expect(provider.verifySignature('order_rzp123', 'pay_rzp_evil', signature)).toBe(false);
    });

    it('rejects a signature made with a different secret', () => {
      const orderId = 'order_rzp123';
      const paymentId = 'pay_rzp456';
      const wrongSig = sign(`${orderId}|${paymentId}`, 'some_other_secret');
      expect(provider.verifySignature(orderId, paymentId, wrongSig)).toBe(false);
    });
  });

  describe('verifyPayment', () => {
    it('throws when the razorpay payload is incomplete', async () => {
      await expect(
        provider.verifyPayment('order-1', { razorpay_order_id: 'order_rzp1' })
      ).rejects.toThrow(AppError);

      await expect(
        provider.verifyPayment('order-1', {})
      ).rejects.toThrow('Missing Razorpay payment details');
    });

    it('throws INVALID_SIGNATURE before any provider network call when signed incorrectly', async () => {
      const payload = {
        razorpay_order_id: 'order_rzp123',
        razorpay_payment_id: 'pay_rzp456',
        razorpay_signature: 'deadbeef',
        amount: 170,
      };

      await expect(provider.verifyPayment('order-1', payload)).rejects.toMatchObject({
        code: 'INVALID_SIGNATURE',
      });
    });
  });

  describe('handleWebhook', () => {
    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_rzp456',
            order_id: 'order_rzp123',
            amount: 17000,
            status: 'captured',
          },
        },
      },
    };

    it('verifies a validly signed raw body', async () => {
      const rawBody = JSON.stringify(payload);
      const signature = sign(rawBody, WEBHOOK_SECRET);

      const result = await provider.handleWebhook(
        { 'x-razorpay-signature': signature },
        rawBody
      );

      expect(result.verified).toBe(true);
      expect(result.eventType).toBe('payment.captured');
      expect(result.data.payment.entity.id).toBe('pay_rzp456');
    });

    it('rejects a webhook with a bad signature', async () => {
      const rawBody = JSON.stringify(payload);
      const signature = sign(rawBody, 'wrong_secret');

      const result = await provider.handleWebhook(
        { 'x-razorpay-signature': signature },
        rawBody
      );

      expect(result.verified).toBe(false);
    });

    it('returns verified=false when the signature header is missing', async () => {
      const result = await provider.handleWebhook({}, JSON.stringify(payload));
      expect(result.verified).toBe(false);
    });

    it('returns verified=false for a non-JSON body', async () => {
      const result = await provider.handleWebhook(
        { 'x-razorpay-signature': 'abc' },
        'not-json{'
      );
      expect(result.verified).toBe(false);
    });
  });

  describe('name / metadata', () => {
    it('reports razorpay as the provider name', () => {
      expect(provider.name).toBe('razorpay');
    });
  });
});
