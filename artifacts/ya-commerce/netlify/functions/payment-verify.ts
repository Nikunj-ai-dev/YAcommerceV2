import { Handler } from '@netlify/functions';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { successResponse, errorResponse } from './utils';

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return successResponse({}, 200);
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId
    } = JSON.parse(event.body || '{}');

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return errorResponse('Missing payment verification parameters');
    }

    // Verify signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return errorResponse('Invalid payment signature', 400);
    }

    // Signature verified - update order in database
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    if (orderId) {
      // Update order payment status
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          payment_status: 'captured',
          order_status: 'confirmed'
        })
        .eq('id', orderId);

      if (orderError) {
        console.error('Order update error:', orderError);
      }

      // Create/update payment record
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          order_id: orderId,
          payment_provider: 'razorpay',
          provider_payment_id: razorpay_payment_id,
          provider_order_id: razorpay_order_id,
          payment_method: 'online',
          payment_status: 'captured',
          payment_timestamp: new Date().toISOString(),
          is_cod: false,
          gateway_response: {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature
          }
        });

      if (paymentError) {
        console.error('Payment record error:', paymentError);
      }

      // Create order event
      await supabase
        .from('order_events')
        .insert({
          order_id: orderId,
          event_type: 'payment_confirmed',
          actor: 'system',
          notes: `Payment confirmed via Razorpay (${razorpay_payment_id})`
        });
    }

    return successResponse({
      success: true,
      verified: true,
      payment_id: razorpay_payment_id
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    return errorResponse('Internal server error', 500);
  }
};

export { handler };
