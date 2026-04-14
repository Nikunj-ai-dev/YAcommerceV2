import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import { supabaseAdmin } from "../lib/supabase.js";

const router = Router();

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";

let razorpay: Razorpay | null = null;

function getRazorpay(): Razorpay {
  if (!razorpay) {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error("Razorpay credentials not configured");
    }
    razorpay = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET,
    });
  }
  return razorpay;
}

// Create Razorpay Order
router.post("/payment/create-order", async (req: Request, res: Response): Promise<void> => {
  const { orderId, amount, currency, customerId } = req.body;

  if (!orderId || !amount) {
    res.status(400).json({ success: false, error: "Order ID and amount are required" });
    return;
  }

  try {
    const rzp = getRazorpay();
    const razorpayOrder = await rzp.orders.create({
      amount: Math.round(amount * 100), // Convert to paise
      currency: currency || "INR",
      receipt: orderId,
      notes: { 
        order_id: orderId,
        customer_id: customerId || "",
      },
    });

    res.json({
      success: true,
      orderId: razorpayOrder.id,
      amount: amount,
      currency: currency || "INR",
      key: RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("Failed to create Razorpay order:", err);
    res.status(500).json({ success: false, error: "Payment order creation failed" });
  }
});

// Verify Razorpay Payment
router.post("/payment/verify", async (req: Request, res: Response): Promise<void> => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
    res.status(400).json({ success: false, message: "Missing payment details" });
    return;
  }

  // Verify signature
  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    console.warn(`Payment signature verification failed for order ${orderId}`);
    res.status(400).json({ success: false, message: "Payment verification failed" });
    return;
  }

  try {
    // Update order status
    const { error: orderError } = await supabaseAdmin
      .from("orders")
      .update({
        payment_status: "captured",
        order_status: "confirmed",
      })
      .eq("id", orderId);

    if (orderError) {
      console.error("Failed to update order:", orderError);
    }

    // Get order details to record payment amount
    const { data: orderData } = await supabaseAdmin
      .from("orders")
      .select("total_amount")
      .eq("id", orderId)
      .single();

    // Create payment record
    await supabaseAdmin.from("payments").insert({
      order_id: orderId,
      payment_provider: "razorpay",
      provider_payment_id: razorpay_payment_id,
      provider_order_id: razorpay_order_id,
      payment_method: "online",
      payment_status: "captured",
      paid_amount: orderData?.total_amount || 0,
      currency: "INR",
      payment_timestamp: new Date().toISOString(),
      verification_status: "verified",
    });

    // Create order event
    await supabaseAdmin.from("order_events").insert({
      order_id: orderId,
      event_type: "payment_confirmed",
      actor: "system",
      notes: `Payment confirmed via Razorpay (${razorpay_payment_id})`,
    });

    res.json({ success: true, message: "Payment verified successfully" });
  } catch (err) {
    console.error("Failed to update order after payment verification:", err);
    res.status(500).json({ success: false, message: "Payment verified but order update failed" });
  }
});

export default router;
