import { Router, type Request, type Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

const router = Router();

// Create Order
router.post("/order/create", async (req: Request, res: Response): Promise<void> => {
  const { customerId, items, shippingAddress, billingAddress, paymentMethod, subtotal, shippingCost, tax, total } = req.body;

  if (!customerId || !items || items.length === 0) {
    res.status(400).json({ success: false, error: "Customer ID and items are required" });
    return;
  }

  try {
    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // Create order
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_id: customerId,
        order_number: orderNumber,
        order_status: "pending",
        payment_status: paymentMethod === "cod" ? "pending" : "awaiting_payment",
        payment_method: paymentMethod || "online",
        subtotal: subtotal || 0,
        shipping_cost: shippingCost || 0,
        tax_amount: tax || 0,
        total_amount: total || 0,
        currency: "INR",
        shipping_address: shippingAddress,
        billing_address: billingAddress || shippingAddress,
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error("Failed to create order:", orderError);
      res.status(500).json({ success: false, error: "Failed to create order" });
      return;
    }

    // Create order items
    const orderItems = items.map((item: {
      productId: string;
      variantId?: string;
      quantity: number;
      unitPrice: number;
      productName: string;
      variantName?: string;
      imageUrl?: string;
    }) => ({
      order_id: order.id,
      product_id: item.productId,
      variant_id: item.variantId || null,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: item.unitPrice * item.quantity,
      product_name_snapshot: item.productName,
      variant_name_snapshot: item.variantName || null,
      image_url_snapshot: item.imageUrl || null,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from("order_items")
      .insert(orderItems);

    if (itemsError) {
      console.error("Failed to create order items:", itemsError);
      // Don't fail the entire order, items can be reconciled later
    }

    // Create order event
    await supabaseAdmin.from("order_events").insert({
      order_id: order.id,
      event_type: "order_created",
      actor: "customer",
      notes: `Order ${orderNumber} created`,
    });

    res.json({
      success: true,
      order: {
        id: order.id,
        order_number: orderNumber,
        status: order.order_status,
        total: order.total_amount,
      },
    });
  } catch (err) {
    console.error("Order creation failed:", err);
    res.status(500).json({ success: false, error: "Failed to create order" });
  }
});

// Get Order by ID
router.get("/order/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(`
        *,
        order_items (
          *,
          product:products (name, slug),
          variant:product_variants (name)
        )
      `)
      .eq("id", id)
      .single();

    if (error || !order) {
      res.status(404).json({ success: false, error: "Order not found" });
      return;
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error("Failed to fetch order:", err);
    res.status(500).json({ success: false, error: "Failed to fetch order" });
  }
});

export default router;
