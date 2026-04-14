import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { successResponse, errorResponse, generateOTP, hashOTP, isValidPhone, normalizePhone, checkRateLimit } from './utils';

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return successResponse({}, 200);
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const { phone } = JSON.parse(event.body || '{}');

    if (!phone || !isValidPhone(phone)) {
      return errorResponse('Invalid phone number');
    }

    const normalizedPhone = normalizePhone(phone);

    // Rate limiting
    if (!checkRateLimit(`phone-otp:${normalizedPhone}`, 3, 300000)) {
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
    await supabase.from('temp_otp').delete().eq('identifier', normalizedPhone);

    // Store OTP using the actual temp_otp table from Supabase
    const { error: otpError } = await supabase
      .from('temp_otp')
      .insert({
        identifier: normalizedPhone,
        identifier_type: 'phone',
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

    // Send OTP via Meta WhatsApp API
    const whatsappResponse = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: `91${normalizedPhone}`,
          type: 'template',
          template: {
            name: 'otp_message', // You need to create this template in Meta Business
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: otp }
                ]
              }
            ]
          }
        })
      }
    );

    if (!whatsappResponse.ok) {
      const errorText = await whatsappResponse.text();
      console.error('WhatsApp API error:', errorText);
      
      // Fallback: Send as regular text message (if template fails)
      const fallbackResponse = await fetch(
        `https://graph.facebook.com/v18.0/${process.env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: `91${normalizedPhone}`,
            type: 'text',
            text: {
              body: `Your YA Commerce login code is: ${otp}\n\nThis code will expire in 5 minutes.\n\nDo not share this code with anyone.`
            }
          })
        }
      );

      if (!fallbackResponse.ok) {
        return errorResponse('Failed to send OTP');
      }
    }

    return successResponse({
      success: true,
      message: 'OTP sent to your WhatsApp'
    });

  } catch (error) {
    console.error('Phone OTP error:', error);
    return errorResponse('Internal server error', 500);
  }
};

export { handler };
