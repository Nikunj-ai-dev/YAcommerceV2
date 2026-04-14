import { Handler } from '@netlify/functions';
import { successResponse, errorResponse } from './utils';

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return successResponse({}, 200);
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const { amount, currency = 'INR', customerId, orderId } = JSON.parse(event.body || '{}');

    if (!amount || amount <= 0) {
      return errorResponse('Invalid amount');
    }

    if (!customerId) {
      return errorResponse('Customer ID required');
    }

    // Create Razorpay order
    const razorpayAuth = Buffer.from(
      `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
    ).toString('base64');

    const orderData = {
      amount: Math.round(amount * 100), // Convert to paise
      currency,
      receipt: `rcpt_${orderId || Date.now()}`,
      notes: {
        customer_id: customerId,
        order_id: orderId
      }
    };

    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${razorpayAuth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    });

    if (!razorpayResponse.ok) {
      const errorData = await razorpayResponse.json();
      console.error('Razorpay error:', errorData);
      return errorResponse('Failed to create payment order');
    }

    const razorpayOrder = await razorpayResponse.json();

    return successResponse({
      success: true,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error('Create payment error:', error);
    return errorResponse('Internal server error', 500);
  }
};

export { handler };
