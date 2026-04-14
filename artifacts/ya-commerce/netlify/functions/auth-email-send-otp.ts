import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { successResponse, errorResponse, generateOTP, hashOTP, isValidEmail, checkRateLimit } from './utils';

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return successResponse({}, 200);
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const { email } = JSON.parse(event.body || '{}');

    if (!email || !isValidEmail(email)) {
      return errorResponse('Invalid email address');
    }

    // Rate limiting
    if (!checkRateLimit(`email-otp:${email}`, 3, 300000)) {
      return errorResponse('Too many requests. Please try again later.', 429);
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Generate OTP
    const otp = generateOTP();
    const hashedOtp = hashOTP(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Delete any existing OTP for this identifier first
    await supabase.from('temp_otp').delete().eq('identifier', email);

    // Store OTP in database using the actual temp_otp table from Supabase
    const { error: otpError } = await supabase
      .from('temp_otp')
      .insert({
        identifier: email,
        identifier_type: 'email',
        otp_hash: hashedOtp,
        purpose: 'login',
        expires_at: expiresAt.toISOString(),
        attempts: 0,
        created_at: new Date().toISOString()
      });

    if (otpError) {
      console.error('OTP storage error:', otpError);
      return errorResponse('Failed to generate OTP');
    }

    // Send OTP via Brevo
    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY!,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: {
          name: process.env.BREVO_SENDER_NAME || 'YA Commerce',
          email: process.env.BREVO_SENDER_EMAIL || 'noreply@yacommerce.com'
        },
        to: [{ email }],
        subject: 'Your Login Code - YA Commerce',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .otp-box { background: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; }
                .otp-code { font-size: 32px; font-weight: bold; letter-spacing: 8px; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
              </style>
            </head>
            <body>
              <div class="container">
                <h2>Your Login Code</h2>
                <p>Hello,</p>
                <p>Use the following code to sign in to your YA Commerce account:</p>
                <div class="otp-box">
                  <div class="otp-code">${otp}</div>
                </div>
                <p>This code will expire in 5 minutes.</p>
                <p>If you didn't request this code, please ignore this email.</p>
                <div class="footer">
                  <p>© ${new Date().getFullYear()} YA Commerce. All rights reserved.</p>
                </div>
              </div>
            </body>
          </html>
        `
      })
    });

    if (!brevoResponse.ok) {
      console.error('Brevo API error:', await brevoResponse.text());
      return errorResponse('Failed to send email');
    }

    return successResponse({
      success: true,
      message: 'OTP sent to your email'
    });

  } catch (error) {
    console.error('Email OTP error:', error);
    return errorResponse('Internal server error', 500);
  }
};

export { handler };
