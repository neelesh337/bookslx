import { LogisticsProvider, CreateShipmentParams, ShipmentResult } from './LogisticsProvider';

export class MockLogisticsProvider implements LogisticsProvider {
  public name = 'mock';

  async createShipment(params: CreateShipmentParams): Promise<ShipmentResult> {
    const courierName = 'BooksLX Express Logistics';
    const trackingNumber = `BLX-${Math.floor(100000000 + Math.random() * 900000000)}`;
    const trackingUrl = `https://bookslx.local/track/${trackingNumber}`;
    const estDeliveryDate = new Date();
    estDeliveryDate.setDate(estDeliveryDate.getDate() + 3);

    const shippedAt = new Date();

    return {
      shipmentId: params.orderId,
      orderId: params.orderId,
      courierName,
      trackingNumber,
      trackingUrl,
      status: 'SHIPPED',
      estDeliveryDate,
      shippedAt,
      events: [
        {
          status: 'SHIPPED',
          description: `Shipment label generated and package handed to ${courierName} at seller location (${params.pickupAddress.city}).`,
          location: params.pickupAddress.city,
          timestamp: shippedAt,
        },
      ],
    };
  }

  async getTracking(trackingNumber: string): Promise<ShipmentResult> {
    const estDeliveryDate = new Date();
    estDeliveryDate.setDate(estDeliveryDate.getDate() + 2);

    return {
      shipmentId: trackingNumber,
      orderId: 'order_mock',
      courierName: 'BooksLX Express Logistics',
      trackingNumber,
      trackingUrl: `https://bookslx.local/track/${trackingNumber}`,
      status: 'IN_TRANSIT',
      estDeliveryDate,
      events: [
        {
          status: 'SHIPPED',
          description: 'Package picked up from seller hub',
          location: 'Origin Sorting Hub',
          timestamp: new Date(Date.now() - 3600000 * 24),
        },
        {
          status: 'IN_TRANSIT',
          description: 'Package in transit to destination hub',
          location: 'Central Distribution Center',
          timestamp: new Date(Date.now() - 3600000 * 5),
        },
      ],
    };
  }

  async cancelShipment(trackingNumber: string): Promise<{ success: boolean; message: string }> {
    return {
      success: true,
      message: `Shipment ${trackingNumber} cancelled successfully in mock mode.`,
    };
  }

  async handleWebhook(_headers: Record<string, any>, payload: any): Promise<{ verified: boolean; status: string; trackingNumber: string; location?: string }> {
    return {
      verified: true,
      status: payload.status || 'IN_TRANSIT',
      trackingNumber: payload.trackingNumber || 'BLX-MOCK',
      location: payload.location || 'Hub',
    };
  }
}
