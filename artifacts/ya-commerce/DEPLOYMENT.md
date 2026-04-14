# YA Commerce - AWS App Runner Deployment Guide

## Overview

This is a unified deployment with Express.js serving both the API backend and the React frontend. AWS App Runner handles auto-scaling, SSL, and CI/CD.

---

## Prerequisites

- AWS Account with App Runner access
- Docker installed (for local testing)
- Supabase account with database set up
- Razorpay account
- Brevo account for emails
- Google Cloud account for OAuth (optional)

---

## Environment Variables

### Build-time Variables (VITE_ prefix)
These are bundled into the frontend JavaScript at build time:
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon/public key
- `VITE_RAZORPAY_KEY_ID` - Razorpay key ID (public)

### Runtime Variables
These are used by the Express server at runtime:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (secret)
- `RAZORPAY_KEY_ID` - Razorpay key ID
- `RAZORPAY_KEY_SECRET` - Razorpay secret key
- `BREVO_API_KEY` - Brevo API key
- `BREVO_SENDER_EMAIL` - Verified sender email
- `BREVO_SENDER_NAME` - Sender display name
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth secret
- `APP_URL` - Your app's public URL (for OAuth redirects)
- `PORT` - Server port (App Runner sets this to 8080)

---

## Deployment Options

### Option 1: ECR + App Runner (Recommended)

#### Step 1: Create ECR Repository
```bash
aws ecr create-repository --repository-name ya-commerce --region us-east-1
```

#### Step 2: Build Docker Image
```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build with build-time env vars
docker build \
  --build-arg VITE_SUPABASE_URL="https://your-project.supabase.co" \
  --build-arg VITE_SUPABASE_ANON_KEY="your-anon-key" \
  --build-arg VITE_RAZORPAY_KEY_ID="rzp_live_xxx" \
  -t ya-commerce .
```

#### Step 3: Push to ECR
```bash
docker tag ya-commerce:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/ya-commerce:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/ya-commerce:latest
```

#### Step 4: Create App Runner Service
In AWS Console:
1. Go to AWS App Runner
2. Create Service > Container Registry > Amazon ECR
3. Select your image
4. Configure:
   - Port: 8080
   - CPU: 1 vCPU (adjust as needed)
   - Memory: 2 GB (adjust as needed)
5. Add Runtime Environment Variables (all the non-VITE ones)
6. Deploy

### Option 2: Source Code Deployment

App Runner can build from GitHub directly using `apprunner.yaml`:

1. Connect your GitHub repository
2. App Runner will use `apprunner.yaml` configuration
3. Set build-time env vars in App Runner build settings
4. Set runtime env vars in App Runner service settings

---

## Local Development

```bash
# Install dependencies
npm install

# Run both client and server in dev mode
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

---

## API Endpoints

All API endpoints are served from the Express server under `/api`:

### Authentication
- `GET /api/healthz` - Health check
- `GET /api/auth/google/url` - Get Google OAuth URL
- `GET /api/auth/google/callback` - Google OAuth callback
- `POST /api/auth/google/callback` - Google OAuth (frontend handling)
- `POST /api/auth/email/send-otp` - Send email OTP
- `POST /api/auth/email/verify-otp` - Verify email OTP
- `POST /api/auth/phone/send-otp` - Send phone OTP
- `POST /api/auth/phone/verify-otp` - Verify phone OTP

### Payments
- `POST /api/payment/create-order` - Create Razorpay order
- `POST /api/payment/verify` - Verify payment signature

### Orders
- `POST /api/order/create` - Create new order
- `GET /api/order/:id` - Get order details

### Store
- `GET /api/store/settings` - Get store settings

---

## Database Schema

The app uses Supabase with the following key tables:
- `customers` - User profiles
- `products`, `product_variants` - Product catalog
- `orders`, `order_items` - Order management
- `payments` - Payment records
- `order_events` - Order history/timeline
- `temp_otp` - Temporary OTP storage
- `store_settings` - Store configuration

Run the SQL migrations in `supabase-migrations/` in your Supabase SQL Editor.

---

## Health Check

App Runner uses the health check endpoint:
```
GET /api/healthz
```
Returns: `{ "status": "ok", "timestamp": "..." }`

---

## Troubleshooting

### Container not starting
- Check PORT is set to 8080
- Verify all required env vars are set
- Check App Runner logs for errors

### OTP not sending
- Verify BREVO_API_KEY is correct
- Check sender email is verified in Brevo
- Check App Runner logs for API errors

### Payment failing
- Verify Razorpay keys (test vs live mode)
- Check signature verification in logs
- Ensure orderId matches

### OAuth not working
- Verify Google OAuth credentials
- Check redirect URI matches: `https://your-domain/api/auth/google/callback`
- Ensure APP_URL is set correctly

---

## Security Notes

- All sensitive keys are runtime environment variables
- SUPABASE_SERVICE_ROLE_KEY never exposed to client
- CORS enabled for API routes
- Payment signatures verified server-side
- OTPs expire after 5 minutes
- Rate limiting should be configured in App Runner

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              AWS App Runner                      │
│  ┌─────────────────────────────────────────┐   │
│  │         Express.js Server               │   │
│  │  ┌─────────────┐  ┌─────────────────┐   │   │
│  │  │  API Routes │  │  Static Files   │   │   │
│  │  │  /api/*     │  │  React SPA      │   │   │
│  │  └──────┬──────┘  └────────────────┘   │   │
│  └─────────┼───────────────────────────────┘   │
│            │                                    │
└────────────┼────────────────────────────────────┘
             │
             ▼
    ┌────────────────┐    ┌──────────────┐
    │   Supabase     │    │  Razorpay    │
    │  (PostgreSQL)  │    │  (Payments)  │
    └────────────────┘    └──────────────┘
```

---

**Your YA Commerce store is ready for production on AWS App Runner!**
