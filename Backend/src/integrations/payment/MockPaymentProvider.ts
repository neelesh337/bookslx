import { PaymentProvider, CreatePaymentParams, PaymentResult, RefundParams, RefundResult } from './PaymentProvider';

export class MockPaymentProvider implements PaymentProvider {
  public name = 'mock';

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    const providerTxId = `MOCK_TX_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    return {
      paymentId: params.orderId,
      orderId: params.orderId,
      provider: 'mock',
      providerTransactionId: providerTxId,
      amount: params.amount,
      status: 'PENDING',
      metadata: {
        ...params.metadata,
        mockNote: 'Development Mock Payment Gateway',
        createdAt: new Date().toISOString(),
      },
    };
  }

  async verifyPayment(paymentId: string, payload: Record<string, any>): Promise<PaymentResult> {
    const shouldFail = payload.simulateFailure === true;

    return {
      paymentId,
      orderId: payload.orderId || paymentId,
      provider: 'mock',
      providerTransactionId: payload.providerTransactionId || `MOCK_TX_CONFIRMED_${Date.now()}`,
      amount: payload.amount || 0,
      status: shouldFail ? 'FAILED' : 'PROTECTED',
      metadata: {
        mockPaymentVerifiedAt: new Date().toISOString(),
        simulateFailure: shouldFail,
      },
    };
  }

  async refundPayment(params: RefundParams): Promise<RefundResult> {
    return {
      refundId: `MOCK_REFUND_${Date.now()}`,
      paymentId: params.paymentId,
      amount: params.amount,
      status: 'REFUNDED',
    };
  }

  async handleWebhook(_headers: Record<string, any>, payload: any): Promise<{ verified: boolean; eventType: string; data: any }> {
    return {
      verified: true,
      eventType: payload.event || 'payment.captured',
      data: payload,
    };
  }
}
