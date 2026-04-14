import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { supabaseAdmin } from "../lib/supabase.js";

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "noreply@yacommerce.com";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "YA Commerce";

function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

// Google OAuth URL
router.get("/auth/google/url", async (req: Request, res: Response): Promise<void> => {
  const redirectUri = (req.query.redirectUri as string) || `${req.protocol}://${req.get("host")}/api/auth/google/callback`;
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&access_type=offline&prompt=consent`;
  res.json({ url });
});

// Google OAuth Callback
router.get("/auth/google/callback", async (req: Request, res: Response): Promise<void> => {
  const code = req.query.code as string;
  const appUrl = process.env.APP_URL || process.env.URL || `${req.protocol}://${req.get("host")}`;

  if (!code) {
    res.redirect(`${appUrl}/auth?error=missing_code`);
    return;
  }

  try {
    const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/google/callback`;
    
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json() as Record<string, unknown>;
    if (!tokenData.access_token) {
      res.redirect(`${appUrl}/auth?error=token_exchange_failed`);
      return;
    }

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoRes.json() as Record<string, unknown>;

    const email = userInfo.email as string;
    const name = userInfo.name as string;
    const picture = userInfo.picture as string;

    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u) => u.email === email);

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        email_confirm: true,
        user_metadata: { full_name: name, avatar_url: picture, provider: "google" },
      });
    } else {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: name, avatar_url: picture, provider: "google" },
      });

      if (createError || !newUser.user) {
        res.redirect(`${appUrl}/auth?error=user_creation_failed`);
        return;
      }
      userId = newUser.user.id;
    }

    // Create or update customer record
    const { data: customerCheck } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!customerCheck) {
      const nameParts = (name || "").split(" ");
      await supabaseAdmin.from("customers").insert({
        user_id: userId,
        email,
        email_verified: true,
        first_name: nameParts[0] || "",
        last_name: nameParts.slice(1).join(" ") || "",
        profile_image: picture,
      });
    } else {
      await supabaseAdmin
        .from("customers")
        .update({ email_verified: true, profile_image: picture })
        .eq("id", customerCheck.id);
    }

    // Generate magic link for session
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (sessionError || !sessionData) {
      res.redirect(`${appUrl}/auth?error=session_creation_failed`);
      return;
    }

    // Redirect with success and token
    res.redirect(`${appUrl}/?auth=success&token=${sessionData.properties?.hashed_token || ""}`);
  } catch (error) {
    console.error("Google callback error:", error);
    res.redirect(`${appUrl}/auth?error=google_auth_failed`);
  }
});

// Google OAuth Callback (POST for frontend handling)
router.post("/auth/google/callback", async (req: Request, res: Response): Promise<void> => {
  const { code, redirectUri } = req.body;

  if (!code) {
    res.status(400).json({ success: false, error: "Missing authorization code" });
    return;
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json() as Record<string, unknown>;
    if (!tokenData.access_token) {
      res.status(400).json({ success: false, error: "Failed to exchange code" });
      return;
    }

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoRes.json() as Record<string, unknown>;

    const email = userInfo.email as string;
    const name = userInfo.name as string;
    const picture = userInfo.picture as string;

    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u) => u.email === email);

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        email_confirm: true,
        user_metadata: { full_name: name, avatar_url: picture, provider: "google" },
      });
    } else {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: name, avatar_url: picture, provider: "google" },
      });

      if (createError || !newUser.user) {
        res.status(500).json({ success: false, error: "Failed to create user" });
        return;
      }
      userId = newUser.user.id;
    }

    const { data: customerCheck } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!customerCheck) {
      const nameParts = (name || "").split(" ");
      await supabaseAdmin.from("customers").insert({
        user_id: userId,
        email,
        email_verified: true,
        first_name: nameParts[0] || "",
        last_name: nameParts.slice(1).join(" ") || "",
        profile_image: picture,
      });
    }

    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (sessionError) {
      res.status(500).json({ success: false, error: "Failed to generate session" });
      return;
    }

    res.json({
      success: true,
      session: sessionData,
      user: { id: userId, email, name, picture },
    });
  } catch (err) {
    console.error("Google auth callback failed:", err);
    res.status(500).json({ success: false, error: "Authentication failed" });
  }
});

// Send Email OTP
router.post("/auth/email/send-otp", async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  if (!email || typeof email !== "string") {
    res.status(400).json({ success: false, message: "Email is required" });
    return;
  }

  const otp = generateOtp();
  const hashedOtp = hashOtp(otp);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  // Delete existing OTP for this identifier
  await supabaseAdmin.from("temp_otp").delete().eq("identifier", email);

  // Store new OTP
  const { error: otpError } = await supabaseAdmin.from("temp_otp").insert({
    identifier: email,
    identifier_type: "email",
    otp_hash: hashedOtp,
    purpose: "login",
    expires_at: expiresAt,
    attempts: 0,
    created_at: new Date().toISOString(),
  });

  if (otpError) {
    console.error("Failed to store OTP:", otpError);
    res.status(500).json({ success: false, message: "Failed to generate OTP" });
    return;
  }

  try {
    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
        to: [{ email }],
        subject: "Your Login Code - YA Commerce",
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #1a1a1a; margin-bottom: 8px;">YA Commerce</h2>
            <p style="color: #555;">Your verification code is:</p>
            <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 16px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #d97706;">${otp}</span>
            </div>
            <p style="color: #888; font-size: 14px;">This code expires in 5 minutes. Do not share it with anyone.</p>
          </div>
        `,
      }),
    });

    if (!brevoRes.ok) {
      console.error("Brevo API error:", brevoRes.status);
      res.status(500).json({ success: false, message: "Failed to send email" });
      return;
    }

    res.json({ success: true, message: "Verification code sent to your email" });
  } catch (err) {
    console.error("Failed to send email OTP:", err);
    res.status(500).json({ success: false, message: "Failed to send verification code" });
  }
});

// Verify Email OTP
router.post("/auth/email/verify-otp", async (req: Request, res: Response): Promise<void> => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    res.status(400).json({ success: false, error: "Email and OTP are required" });
    return;
  }

  const hashedOtp = hashOtp(otp);

  const { data: otpRecord, error: otpError } = await supabaseAdmin
    .from("temp_otp")
    .select("*")
    .eq("identifier", email)
    .eq("identifier_type", "email")
    .single();

  if (otpError || !otpRecord) {
    res.status(400).json({ success: false, error: "Invalid or expired code" });
    return;
  }

  // Check expiry
  if (new Date(otpRecord.expires_at) < new Date()) {
    await supabaseAdmin.from("temp_otp").delete().eq("identifier", email);
    res.status(400).json({ success: false, error: "OTP has expired" });
    return;
  }

  // Check attempts
  const maxAttempts = otpRecord.max_attempts || 5;
  if (otpRecord.attempts >= maxAttempts) {
    await supabaseAdmin.from("temp_otp").delete().eq("identifier", email);
    res.status(400).json({ success: false, error: "Too many failed attempts" });
    return;
  }

  // Verify hash
  if (otpRecord.otp_hash !== hashedOtp) {
    await supabaseAdmin
      .from("temp_otp")
      .update({ attempts: otpRecord.attempts + 1 })
      .eq("identifier", email);
    res.status(400).json({ success: false, error: "Invalid OTP" });
    return;
  }

  // OTP verified - clean up
  await supabaseAdmin.from("temp_otp").delete().eq("identifier", email);

  // Find or create user
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find((u) => u.email === email);

  let userId: string;
  if (existingUser) {
    userId = existingUser.id;
    await supabaseAdmin.auth.admin.updateUserById(userId, { email_confirm: true });
  } else {
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { provider: "email" },
    });
    if (createError || !newUser.user) {
      res.status(500).json({ success: false, error: "Failed to create account" });
      return;
    }
    userId = newUser.user.id;
  }

  // Create or update customer
  const { data: customerCheck } = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!customerCheck) {
    await supabaseAdmin.from("customers").insert({
      user_id: userId,
      email,
      email_verified: true,
    });
  } else {
    await supabaseAdmin
      .from("customers")
      .update({ email_verified: true })
      .eq("id", customerCheck.id);
  }

  // Generate session
  const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (sessionError) {
    res.status(500).json({ success: false, error: "Failed to create session" });
    return;
  }

  res.json({
    success: true,
    session: sessionData,
    user: { id: userId, email },
  });
});

// Send Phone OTP
router.post("/auth/phone/send-otp", async (req: Request, res: Response): Promise<void> => {
  const { phone } = req.body;

  if (!phone || typeof phone !== "string") {
    res.status(400).json({ success: false, message: "Phone number is required" });
    return;
  }

  // Normalize phone number
  let normalizedPhone = phone.replace(/\D/g, "");
  if (!normalizedPhone.startsWith("91") && normalizedPhone.length === 10) {
    normalizedPhone = "91" + normalizedPhone;
  }

  const otp = generateOtp();
  const hashedOtp = hashOtp(otp);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  // Delete existing OTP
  await supabaseAdmin.from("temp_otp").delete().eq("identifier", normalizedPhone);

  // Store new OTP
  const { error: otpError } = await supabaseAdmin.from("temp_otp").insert({
    identifier: normalizedPhone,
    identifier_type: "phone",
    otp_hash: hashedOtp,
    purpose: "login",
    expires_at: expiresAt,
    attempts: 0,
    created_at: new Date().toISOString(),
  });

  if (otpError) {
    console.error("Failed to store OTP:", otpError);
    res.status(500).json({ success: false, message: "Failed to generate OTP" });
    return;
  }

  // TODO: Integrate WhatsApp API for sending OTP
  // For now, log the OTP (remove in production)
  console.log(`Phone OTP for ${normalizedPhone}: ${otp}`);

  res.json({ success: true, message: "Verification code sent to your WhatsApp" });
});

// Verify Phone OTP
router.post("/auth/phone/verify-otp", async (req: Request, res: Response): Promise<void> => {
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    res.status(400).json({ success: false, error: "Phone and OTP are required" });
    return;
  }

  // Normalize phone number
  let normalizedPhone = phone.replace(/\D/g, "");
  if (!normalizedPhone.startsWith("91") && normalizedPhone.length === 10) {
    normalizedPhone = "91" + normalizedPhone;
  }

  const hashedOtp = hashOtp(otp);

  const { data: otpRecord, error: otpError } = await supabaseAdmin
    .from("temp_otp")
    .select("*")
    .eq("identifier", normalizedPhone)
    .eq("identifier_type", "phone")
    .single();

  if (otpError || !otpRecord) {
    res.status(400).json({ success: false, error: "Invalid or expired code" });
    return;
  }

  // Check expiry
  if (new Date(otpRecord.expires_at) < new Date()) {
    await supabaseAdmin.from("temp_otp").delete().eq("identifier", normalizedPhone);
    res.status(400).json({ success: false, error: "OTP has expired" });
    return;
  }

  // Check attempts
  const maxAttempts = otpRecord.max_attempts || 5;
  if (otpRecord.attempts >= maxAttempts) {
    await supabaseAdmin.from("temp_otp").delete().eq("identifier", normalizedPhone);
    res.status(400).json({ success: false, error: "Too many failed attempts" });
    return;
  }

  // Verify hash
  if (otpRecord.otp_hash !== hashedOtp) {
    await supabaseAdmin
      .from("temp_otp")
      .update({ attempts: otpRecord.attempts + 1 })
      .eq("identifier", normalizedPhone);
    res.status(400).json({ success: false, error: "Invalid OTP" });
    return;
  }

  // OTP verified - clean up
  await supabaseAdmin.from("temp_otp").delete().eq("identifier", normalizedPhone);

  // Create dummy email for phone users
  const dummyEmail = `${normalizedPhone}@phone.yacommerce.local`;
  
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
  let existingUser = existingUsers?.users?.find((u) => u.email === dummyEmail);
  
  if (!existingUser) {
    const { data: customerByPhone } = await supabaseAdmin
      .from("customers")
      .select("user_id")
      .eq("phone", normalizedPhone)
      .maybeSingle();
    if (customerByPhone?.user_id) {
      existingUser = existingUsers?.users?.find((u) => u.id === customerByPhone.user_id);
    }
  }

  let userId: string;
  if (existingUser) {
    userId = existingUser.id;
  } else {
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: dummyEmail,
      email_confirm: true,
      user_metadata: { provider: "phone", phone: normalizedPhone },
    });
    if (createError || !newUser.user) {
      res.status(500).json({ success: false, error: "Failed to create account" });
      return;
    }
    userId = newUser.user.id;
  }

  // Create or update customer
  const { data: customerCheck } = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!customerCheck) {
    await supabaseAdmin.from("customers").insert({
      user_id: userId,
      email: dummyEmail,
      phone: normalizedPhone,
      phone_verified: true,
    });
  } else {
    await supabaseAdmin
      .from("customers")
      .update({ phone: normalizedPhone, phone_verified: true })
      .eq("id", customerCheck.id);
  }

  // Generate session
  const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: dummyEmail,
  });

  if (sessionError) {
    res.status(500).json({ success: false, error: "Failed to create session" });
    return;
  }

  res.json({
    success: true,
    session: sessionData,
    user: { id: userId, phone: normalizedPhone },
  });
});

export default router;
