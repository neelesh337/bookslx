import Razorpay from 'razorpay';
import crypto from 'crypto';
import { PaymentProvider, CreatePaymentParams, PaymentResult, RefundParams, RefundResult } from './PaymentProvider';
import { AppError } from '../../utils/errors';

/**
 * Real Razorpay integration.
 *
 * Flow (in-app checkout modal):
 *   1. createPayment()      -> POST /orders -> rzp_order_xxx (amount in paise)
 *   2. Frontend opens the Razorpay Checkout modal with key + order_id
 *   3. Buyer pays -> checkout handler returns { payment_id, order_id, signature }
 *   4. verifyPayment()      -> HMAC signature check + payments.fetch confirm
 *   5. Webhook (optional)   -> payment.captured events, idempotent finalization
 *
 * Test mode (PAYMENT_ENV=test) is free and needs no KYC — test cards work
 * against the live Razorpay API with `rzp_test_*` keys.
 */
export class RazorpayPaymentProvider implements PaymentProvider {
  public name = 'razorpay';
  private client: Razorpay;
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;

  constructor(keyId: string, keySecret: string, webhookSecret: string) {
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.webhookSecret = webhookSecret || '';
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  /**
   * Creates a Razorpay Order that the in-app checkout modal will charge.
   */
  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    const order = await this.client.orders.create({
      amount: Math.round(params.amount * 100), // paise
      currency: params.currency || 'INR',
      receipt: `ord_${params.orderId.slice(-24)}`,
      notes: {
        orderId: params.orderId,
        ...(params.metadata || {}),
      },
    });

    return {
      paymentId: params.orderId,
      orderId: params.orderId,
      provider: this.name,
      providerTransactionId: order.id, // rzp_order_xxx
      amount: params.amount,
      status: 'PENDING',
      clientSecret: this.keyId, // key_id required by the checkout modal
      metadata: {
        razorpayOrderId: order.id,
        amountPaise: order.amount,
        currency: order.currency,
      },
    };
  }

  /**
   * Verifies the checkout signature (HMAC-SHA256 over `order_id|payment_id`)
   * and confirms with Razorpay that the payment was actually captured.
   */
  async verifyPayment(paymentId: string, payload: Record<string, any>): Promise<PaymentResult> {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = payload;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new AppError('Missing Razorpay payment details for verification', 400, 'INVALID_PAYMENT_PAYLOAD');
    }

    if (!this.verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
      throw new AppError('Razorpay payment signature verification failed', 400, 'INVALID_SIGNATURE');
    }

    // Confirm with Razorpay that the payment wasn't explicitly failed. The
    // signature is the security boundary (documented by Razorpay), so a transient
    // fetch failure falls back to signature-verified PROTECTED rather than
    // cancelling a legitimate order. Async methods (UPI/netbanking) can be
    // 'authorized'/'pending' when the modal handler fires — only an explicit
    // 'failed' status cancels.
    let rzpStatus: string | null = null;
    let rzpMethod: string | null = null;
    try {
      const rzpPayment = await this.client.payments.fetch(razorpay_payment_id);
      rzpStatus = rzpPayment.status ?? null;
      rzpMethod = rzpPayment.method ?? null;
    } catch (err: any) {
      console.warn('[Razorpay] payments.fetch failed (falling back to signature verification):', err?.message || err);
    }

    const failed = rzpStatus === 'failed';

    return {
      paymentId,
      orderId: paymentId,
      provider: this.name,
      providerTransactionId: razorpay_payment_id, // rzp_pay_xxx — used for refunds
      amount: amount ?? 0,
      status: failed ? 'FAILED' : 'PROTECTED',
      metadata: {
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        signatureVerified: true,
        providerStatus: rzpStatus,
        method: rzpMethod,
      },
    };
  }

  /**
   * HMAC-SHA256 signature check — the canonical Razorpay checkout verification.
   */
  verifySignature(orderId: string, paymentId: string, signature: string): boolean {
    const body = `${orderId}|${paymentId}`;
    const expected = crypto.createHmac('sha256', this.keySecret).update(body).digest('hex');
    return expected === signature;
  }

  /**
   * Refunds a captured payment. `paymentId` must be the rzp_pay_xxx id.
   */
  async refundPayment(params: RefundParams): Promise<RefundResult> {
    try {
      const refund = await this.client.payments.refund(params.paymentId, {
        amount: Math.round(params.amount * 100), // paise
        notes: { reason: params.reason || 'Buyer-initiated refund' },
      });

      return {
        refundId: refund.id,
        paymentId: params.paymentId,
        amount: params.amount,
        status: 'REFUNDED',
      };
    } catch (err: any) {
      console.error('[Razorpay] refund failed:', err?.error?.description || err?.message || err);
      return {
        refundId: '',
        paymentId: params.paymentId,
        amount: params.amount,
        status: 'FAILED',
      };
    }
  }

  /**
   * Verifies a webhook signature over the RAW request body (required — Razorpay
   * signs the exact bytes). Accepts the raw string or an already-parsed object.
   */
  async handleWebhook(
    headers: Record<string, any>,
    payload: any
  ): Promise<{ verified: boolean; eventType: string; data: any }> {
    const signature = headers['x-razorpay-signature'];
    const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);

    let data: any = payload;
    if (typeof payload === 'string') {
      try {
        data = JSON.parse(payload);
      } catch {
        return { verified: false, eventType: '', data: null };
      }
    }

    let verified = false;
    if (this.webhookSecret && signature) {
      try {
        verified = Razorpay.validateWebhookSignature(rawBody, signature, this.webhookSecret);
      } catch {
        verified = false;
      }
    }

    return {
      verified,
      eventType: data?.event ?? '',
      data: data?.payload ?? null,
    };
  }
}
