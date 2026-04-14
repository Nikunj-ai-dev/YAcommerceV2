import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { successResponse, errorResponse } from './utils';

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return successResponse({}, 200);
  }

  if (event.httpMethod !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const { code, state } = event.queryStringParameters || {};

    if (!code) {
      return errorResponse('Missing authorization code');
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Exchange code for tokens
    const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

    if (sessionError || !sessionData.session) {
      console.error('Session exchange error:', sessionError);
      return errorResponse('Failed to authenticate with Google');
    }

    const { user } = sessionData.session;
    const email = user.email!;
    const profileImage = user.user_metadata?.avatar_url || user.user_metadata?.picture;

    // Check if customer exists
    let { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (!customer) {
      // Create new customer
      const { error: customerError } = await supabase
        .from('customers')
        .insert({
          user_id: user.id,
          email,
          email_verified: true,
          phone_verified: false,
          profile_image: profileImage,
          first_name: user.user_metadata?.full_name?.split(' ')[0] || user.user_metadata?.name?.split(' ')[0],
          last_name: user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || user.user_metadata?.name?.split(' ').slice(1).join(' ')
        });

      if (customerError) {
        console.error('Customer creation error:', customerError);
      }
    } else if (!customer.user_id) {
      // Link existing customer to Google auth
      await supabase
        .from('customers')
        .update({
          user_id: user.id,
          email_verified: true,
          profile_image: profileImage || customer.profile_image
        })
        .eq('email', email);
    } else {
      // Update existing customer
      await supabase
        .from('customers')
        .update({
          email_verified: true,
          profile_image: profileImage || customer.profile_image
        })
        .eq('user_id', user.id);
    }

    // Redirect to homepage with success
    const appUrl = process.env.APP_URL || process.env.URL || 'http://localhost:3000';
    return {
      statusCode: 302,
      headers: {
        'Location': `${appUrl}/?auth=success`,
        'Set-Cookie': `sb-access-token=${sessionData.session.access_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`
      },
      body: ''
    };

  } catch (error) {
    console.error('Google callback error:', error);
    const appUrl = process.env.APP_URL || process.env.URL || 'http://localhost:3000';
    return {
      statusCode: 302,
      headers: {
        'Location': `${appUrl}/auth?error=google_auth_failed`
      },
      body: ''
    };
  }
};

export { handler };
