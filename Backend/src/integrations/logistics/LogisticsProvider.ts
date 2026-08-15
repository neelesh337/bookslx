export interface CreateShipmentParams {
  orderId: string;
  orderNumber: string;
  pickupAddress: {
    name: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  deliveryAddress: {
    name: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  deliveryEmail?: string;
  weightKg?: number;
}

export interface ShipmentResult {
  shipmentId: string;
  orderId: string;
  courierName: string;
  trackingNumber: string;
  trackingUrl: string;
  status: string;
  estDeliveryDate: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
  events: Array<{
    status: string;
    description: string;
    location?: string;
    timestamp: Date;
  }>;
}

export interface LogisticsProvider {
  name: string;
  createShipment(params: CreateShipmentParams): Promise<ShipmentResult>;
  getTracking(trackingNumber: string): Promise<ShipmentResult>;
  cancelShipment(trackingNumber: string): Promise<{ success: boolean; message: string }>;
  handleWebhook(headers: Record<string, any>, payload: any): Promise<{ verified: boolean; status: string; trackingNumber: string; location?: string }>;
}
