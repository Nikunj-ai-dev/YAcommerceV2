import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { successResponse, errorResponse, hashOTP, isValidPhone, normalizePhone } from './utils';

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return successResponse({}, 200);
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const { phone, otp } = JSON.parse(event.body || '{}');

    if (!phone || !isValidPhone(phone)) {
      return errorResponse('Invalid phone number');
    }

    if (!otp || otp.length !== 6) {
      return errorResponse('Invalid OTP');
    }

    const normalizedPhone = normalizePhone(phone);

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify OTP using the actual temp_otp table from Supabase
    const hashedOtp = hashOTP(otp);
    const { data: otpRecord, error: otpError } = await supabase
      .from('temp_otp')
      .select('*')
      .eq('identifier', normalizedPhone)
      .eq('identifier_type', 'phone')
      .single();

    if (otpError || !otpRecord) {
      return errorResponse('Invalid or expired OTP');
    }

    // Check expiry
    if (new Date(otpRecord.expires_at) < new Date()) {
      await supabase.from('temp_otp').delete().eq('identifier', normalizedPhone);
      return errorResponse('OTP has expired');
    }

    // Check attempts (using max_attempts from schema which defaults to 5)
    const maxAttempts = otpRecord.max_attempts || 5;
    if (otpRecord.attempts >= maxAttempts) {
      await supabase.from('temp_otp').delete().eq('identifier', normalizedPhone);
      return errorResponse('Too many failed attempts');
    }

    // Verify hash
    if (otpRecord.otp_hash !== hashedOtp) {
      await supabase
        .from('temp_otp')
        .update({ attempts: otpRecord.attempts + 1 })
        .eq('identifier', normalizedPhone);
      return errorResponse('Invalid OTP');
    }

    // OTP verified - mark as consumed and clean up
    await supabase.from('temp_otp').update({ consumed: true }).eq('identifier', normalizedPhone);
    await supabase.from('temp_otp').delete().eq('identifier', normalizedPhone);

    // Check if customer exists by phone
    let { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', normalizedPhone)
      .maybeSingle();

    let userId = customer?.user_id;
    let email = customer?.email;

    // If no customer with this phone, create one
    if (!customer) {
      // Create temporary email (phone-based)
      email = `${normalizedPhone}@yacommerce.temp`;

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: false,
        phone: `+91${normalizedPhone}`,
        phone_confirm: true,
        user_metadata: { phone_verified: true }
      });

      if (authError || !authData.user) {
        console.error('Auth user creation error:', authError);
        return errorResponse('Failed to create user');
      }

      userId = authData.user.id;

      // Create customer record
      const { error: customerError } = await supabase
        .from('customers')
        .insert({
          user_id: userId,
          email,
          phone: normalizedPhone,
          email_verified: false,
          phone_verified: true
        });

      if (customerError) {
        console.error('Customer creation error:', customerError);
      }
    } else if (!userId) {
      // Customer exists but no auth user - create and link
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: email || `${normalizedPhone}@yacommerce.temp`,
        email_confirm: !!email,
        phone: `+91${normalizedPhone}`,
        phone_confirm: true,
        user_metadata: { phone_verified: true }
      });

      if (authError || !authData.user) {
        console.error('Auth user creation error:', authError);
        return errorResponse('Failed to create user');
      }

      userId = authData.user.id;

      // Link to customer
      await supabase
        .from('customers')
        .update({ user_id: userId, phone_verified: true })
        .eq('phone', normalizedPhone);
    } else {
      // Customer and auth user exist - just update phone_verified
      await supabase
        .from('customers')
        .update({ phone_verified: true })
        .eq('phone', normalizedPhone);
    }

    // Generate session token
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email!,
    });

    if (sessionError || !sessionData) {
      console.error('Session generation error:', sessionError);
      return errorResponse('Failed to create session');
    }

    return successResponse({
      success: true,
      session: sessionData,
      phone_verified: true
    });

  } catch (error) {
    console.error('Phone verify OTP error:', error);
    return errorResponse('Internal server error', 500);
  }
};

export { handler };
