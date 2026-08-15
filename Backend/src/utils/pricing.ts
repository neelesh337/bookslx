export interface OrderAmountBreakdown {
  bookPrice: number;
  shippingFee: number;
  platformFee: number;
  discount: number;
  totalAmount: number;
}

export const calculateOrderAmount = (
  agreedPrice: number,
  shippingFee = 50.0,
  platformFee?: number,
  discount = 0.0
): OrderAmountBreakdown => {
  const bookPrice = Math.max(0, Number(agreedPrice.toFixed(2)));

  // Platform escrow fee: 5% of the final item price — the price the buyer and
  // seller actually agreed on (negotiated offer price or direct buying price).
  // An explicit platformFee still overrides the percentage when provided.
  const computedPlatformFee =
    platformFee !== undefined
      ? platformFee
      : Math.round(bookPrice * 0.05 * 100) / 100;

  const totalAmount = Math.max(
    0,
    Number((bookPrice + shippingFee + computedPlatformFee - discount).toFixed(2))
  );

  return {
    bookPrice,
    shippingFee,
    platformFee: computedPlatformFee,
    discount,
    totalAmount,
  };
};
