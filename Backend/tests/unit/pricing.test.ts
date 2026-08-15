import { describe, it, expect } from 'vitest';
import { calculateOrderAmount } from '../../src/utils/pricing';

describe('calculateOrderAmount', () => {
  it('applies default shipping (50) and a 5% platform fee', () => {
    expect(calculateOrderAmount(100)).toEqual({
      bookPrice: 100,
      shippingFee: 50,
      platformFee: 5, // 5% of 100
      discount: 0,
      totalAmount: 155,
    });
  });

  it('charges 5% of the negotiated price after an offer is accepted', () => {
    // E.g. a book negotiated down to 150 still carries a 5% platform fee.
    expect(calculateOrderAmount(150)).toEqual({
      bookPrice: 150,
      shippingFee: 50,
      platformFee: 7.5, // 5% of 150
      discount: 0,
      totalAmount: 207.5,
    });
  });

  it('applies custom fees and a discount', () => {
    expect(calculateOrderAmount(100, 30, 10, 5)).toEqual({
      bookPrice: 100,
      shippingFee: 30,
      platformFee: 10,
      discount: 5,
      totalAmount: 135,
    });
  });

  it('clamps a negative book price to zero', () => {
    const result = calculateOrderAmount(-5);
    expect(result.bookPrice).toBe(0);
    expect(result.platformFee).toBe(0); // 5% of 0
    expect(result.totalAmount).toBe(50);
  });

  it('rounds the book price, 5% fee, and total to two decimal places', () => {
    expect(calculateOrderAmount(99.999, 10, 5)).toEqual({
      bookPrice: 100,
      shippingFee: 10,
      platformFee: 5,
      discount: 0,
      totalAmount: 115,
    });
  });
});
