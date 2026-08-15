export interface CreatePaymentParams {
  orderId: string;
  amount: number;
  currency?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

export interface PaymentResult {
  paymentId: string;
  orderId: string;
  provider: string;
  providerTransactionId: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'PROTECTED' | 'RELEASED' | 'REFUNDED' | 'FAILED';
  redirectUrl?: string;
  clientSecret?: string;
  metadata?: Record<string, any>;
}

export interface RefundParams {
  paymentId: string;
  amount: number;
  reason?: string;
}

export interface RefundResult {
  refundId: string;
  paymentId: string;
  amount: number;
  status: 'REFUNDED' | 'FAILED';
}

export interface PaymentProvider {
  name: string;
  createPayment(params: CreatePaymentParams): Promise<PaymentResult>;
  verifyPayment(paymentId: string, payload: Record<string, any>): Promise<PaymentResult>;
  refundPayment(params: RefundParams): Promise<RefundResult>;
  handleWebhook(headers: Record<string, any>, payload: any): Promise<{ verified: boolean; eventType: string; data: any }>;
}
