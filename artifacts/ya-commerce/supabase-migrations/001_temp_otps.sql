-- Migration: This file is no longer needed as temp_otp table already exists in Supabase
-- The actual table structure from Supabase is:
--
-- CREATE TABLE public.temp_otp (
--   id uuid NOT NULL DEFAULT uuid_generate_v4(),
--   identifier text NOT NULL,
--   identifier_type text NOT NULL CHECK (identifier_type = ANY (ARRAY['email'::text, 'phone'::text])),
--   otp_hash text NOT NULL,
--   purpose text NOT NULL,
--   attempts integer DEFAULT 0,
--   max_attempts integer DEFAULT 5,
--   expires_at timestamp with time zone NOT NULL,
--   consumed boolean DEFAULT false,
--   ip_address inet,
--   user_agent text,
--   created_at timestamp with time zone DEFAULT now(),
--   CONSTRAINT temp_otp_pkey PRIMARY KEY (id)
-- );
--
-- Note: The application code has been updated to use 'temp_otp' table (the actual table name)
-- instead of 'temp_otps' which was incorrect.

-- Optional: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_temp_otp_identifier ON public.temp_otp(identifier);
CREATE INDEX IF NOT EXISTS idx_temp_otp_expires ON public.temp_otp(expires_at);
CREATE INDEX IF NOT EXISTS idx_temp_otp_identifier_type ON public.temp_otp(identifier_type);

-- Function to auto-delete expired OTPs (if it doesn't exist)
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS void AS $$
BEGIN
  DELETE FROM public.temp_otp WHERE expires_at < NOW() OR consumed = true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE public.temp_otp IS 'Temporary storage for OTP codes during authentication';
