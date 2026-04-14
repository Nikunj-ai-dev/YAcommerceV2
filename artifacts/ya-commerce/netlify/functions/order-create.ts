import { Handler } from '@netlify/functions';
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
      customerId,
      items,
      shippingAddressId,
      shippingMethodId,
      paymentMode,
      couponCode,
      subtotal,
      tax,
      shipping,
      total
    } = JSON.parse(event.body || '{}');

    if (!customerId || !items || !items.length) {
      return errorResponse('Invalid order data');
    }

    if (!shippingAddressId) {
      return errorResponse('Shipping address required');
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify customer exists and phone is verified
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    if (customerError || !customer) {
      return errorResponse('Customer not found');
    }

    if (!customer.phone_verified) {
      return errorResponse('Phone verification required to place order', 403);
    }

    // Get shipping address
    const { data: address } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('id', shippingAddressId)
      .single();

    if (!address) {
      return errorResponse('Invalid shipping address');
    }

    // Get shipping method
    const { data: shippingMethod } = await supabase
      .from('shipping_methods')
      .select('*')
      .eq('id', shippingMethodId)
      .single();

    // Calculate server-side totals (NEVER trust frontend amounts)
    let calculatedSubtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const { data: variant } = await supabase
        .from('product_variants')
        .select('*, products(*)')
        .eq('id', item.variantId)
        .single();

      if (!variant) continue;

      const product = variant.products as any;
      const unitPrice = variant.price || product.base_price;
      const lineTotal = unitPrice * item.quantity;
      calculatedSubtotal += lineTotal;

      orderItems.push({
        product_id_snapshot: product.id,
        product_name_snapshot: product.name,
        variant_id_snapshot: variant.id,
        variant_name_snapshot: variant.variant_name,
        sku_snapshot: variant.sku,
        barcode_snapshot: variant.barcode,
        quantity: item.quantity,
        unit_price: unitPrice,
        compare_price: variant.compare_at_price || product.compare_at_price,
        cost_price_snapshot: variant.cost_price,
        line_total: lineTotal,
        tax_rate_snapshot: product.gst_rate,
        hsn_code_snapshot: product.hsn_code,
        weight_kg_snapshot: variant.weight_kg,
        is_returnable: true,
        is_refundable: true
      });
    }

    const calculatedTax = calculatedSubtotal * 0.18; // 18% GST
    const shippingCost = shippingMethod ? Number(shippingMethod.base_rate || 0) : 0;
    const codFee = paymentMode === 'cod' && shippingMethod ? Number(shippingMethod.cod_fee || 0) : 0;
    const calculatedTotal = calculatedSubtotal + calculatedTax + shippingCost + codFee;

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_id: customerId,
        order_status: 'pending',
        payment_status: paymentMode === 'cod' ? 'cod_pending' : 'pending',
        fulfillment_status: 'unfulfilled',
        source_channel: 'website',
        is_cod: paymentMode === 'cod',
        cod_amount: paymentMode === 'cod' ? calculatedTotal : null,
        shipping_method_id: shippingMethodId,
        shipping_method_snapshot: shippingMethod,
        currency: 'INR',
        subtotal: calculatedSubtotal,
        tax_total: calculatedTax,
        shipping_total: shippingCost,
        cod_fee: codFee,
        grand_total: calculatedTotal,
        name_snapshot: address.full_name,
        email_snapshot: customer.email,
        phone_snapshot: address.phone_number || customer.phone,
        billing_address_snapshot: address,
        shipping_address_snapshot: address,
        delivery_instructions: address.delivery_instructions,
        purchase_date: new Date().toISOString()
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error('Order creation error:', orderError);
      return errorResponse('Failed to create order');
    }

    // Insert order items
    const itemsWithOrderId = orderItems.map(item => ({
      ...item,
      order_id: order.id
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(itemsWithOrderId);

    if (itemsError) {
      console.error('Order items error:', itemsError);
    }

    // Create order event
    await supabase
      .from('order_events')
      .insert({
        order_id: order.id,
        event_type: 'order_placed',
        actor: 'customer',
        actor_id: customerId,
        notes: `Order placed via website (${paymentMode})`
      });

    // Reserve inventory
    for (const item of items) {
      await supabase.rpc('reserve_inventory', {
        p_variant_id: item.variantId,
        p_quantity: item.quantity
      }).catch(err => console.error('Inventory reservation error:', err));
    }

    return successResponse({
      success: true,
      orderId: order.id,
      orderNumber: order.order_number,
      total: calculatedTotal,
      paymentMode
    });

  } catch (error) {
    console.error('Order creation error:', error);
    return errorResponse('Internal server error', 500);
  }
};

export { handler };
