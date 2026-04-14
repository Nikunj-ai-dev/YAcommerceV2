import { Router, type Request, type Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

const router = Router();

// Get Store Settings
router.get("/store/settings", async (_req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from("store_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      // Return default settings if none found
      res.json({
        storeName: "YA Commerce",
        logoUrl: null,
        supportEmail: "support@yacommerce.com",
        supportPhone: null,
        codEnabled: true,
        freeShippingAbove: 499,
        returnWindowDays: 7,
        currency: "INR",
      });
      return;
    }

    res.json({
      storeName: data.store_name,
      logoUrl: data.logo_url,
      supportEmail: data.support_email,
      supportPhone: data.support_phone,
      codEnabled: data.cod_enabled,
      freeShippingAbove: data.free_shipping_above,
      returnWindowDays: data.return_window_days,
      currency: data.default_currency,
    });
  } catch (err) {
    console.error("Failed to fetch store settings:", err);
    res.json({
      storeName: "YA Commerce",
      currency: "INR",
      codEnabled: true,
      freeShippingAbove: 499,
      returnWindowDays: 7,
    });
  }
});

export default router;
