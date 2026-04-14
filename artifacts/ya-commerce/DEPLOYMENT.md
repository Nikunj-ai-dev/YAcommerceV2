# YA Commerce - Deployment Guide

## 📦 Production-Ready E-Commerce Store

Complete e-commerce platform with React + Vite frontend, Supabase backend, and serverless functions for auth & payments.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Supabase account
- Razorpay account
- Brevo (SendinBlue) account for emails
- Meta Business account for WhatsApp
- Google Cloud account for OAuth (optional)

---

## 📝 Environment Setup

### 1. Copy Environment Variables

```bash
cp .env.example .env
```

### 2. Fill in Environment Variables

#### Supabase
1. Create project at [supabase.com](https://supabase.com)
2. Go to Settings > API
3. Copy:
   - `VITE_SUPABASE_URL` - Project URL
   - `VITE_SUPABASE_ANON_KEY` - anon public key
   - `SUPABASE_SERVICE_ROLE_KEY` - service_role secret key

#### Run Migration
Run the SQL migration in Supabase SQL Editor:
```bash
cat supabase-migrations/001_temp_otps.sql
```
Paste and execute in your Supabase project.

#### Brevo (Email)
1. Sign up at [brevo.com](https://www.brevo.com)
2. Go to SMTP & API > API Keys
3. Create new API key
4. Set:
   - `BREVO_API_KEY`
   - `BREVO_SENDER_EMAIL` (verified sender)
   - `BREVO_SENDER_NAME`

#### Meta WhatsApp
1. Go to [Meta Business Suite](https://business.facebook.com)
2. Set up WhatsApp Business API
3. Get:
   - `META_WHATSAPP_PHONE_NUMBER_ID`
   - `META_WHATSAPP_ACCESS_TOKEN`
   - `META_WHATSAPP_VERIFY_TOKEN`
4. Create WhatsApp template named `otp_message` with body: `Your YA Commerce login code is: {{1}}`

#### Razorpay
1. Sign up at [razorpay.com](https://razorpay.com)
2. Go to Settings > API Keys
3. Generate keys:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `VITE_RAZORPAY_KEY_ID` (same as KEY_ID, for frontend)

#### Google OAuth (Optional)
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials
3. Add authorized redirect URI: `https://your-domain.com/api/auth/google/callback`
4. Set:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

---

## 🏗️ AWS App Runner Deployment (Recommended)

### Why App Runner?
- This is NOT a static site - it needs serverless functions
- App Runner handles both frontend + functions
- Auto-scaling, SSL, CI/CD built-in

### Steps

1. **Build Docker Image** (or use App Runner source deployment)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "serve"]
```

2. **Push to AWS App Runner**

Option A: Source Code Deployment
- Connect GitHub repository
- App Runner auto-detects `apprunner.yaml`
- Configure environment variables in console

Option B: Docker/ECR Deployment (Recommended)
```bash
# 1. Create ECR repository (one-time)
aws ecr create-repository --repository-name ya-commerce --region us-east-1

# 2. Get ECR login
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# 3. Build with build args for environment variables
docker build \
  --build-arg VITE_SUPABASE_URL="your-supabase-url" \
  --build-arg VITE_SUPABASE_ANON_KEY="your-anon-key" \
  --build-arg VITE_RAZORPAY_KEY_ID="your-razorpay-key" \
  -t ya-commerce .

# 4. Tag and push
docker tag ya-commerce:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/ya-commerce:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/ya-commerce:latest

# 5. Create App Runner service from ECR image in AWS Console or CLI
```

**Important:** The frontend environment variables (VITE_* prefix) need to be passed at build time since they get bundled into the JavaScript. Runtime-only env vars should use the non-VITE prefix.

3. **Create App Runner Service**
```bash
aws apprunner create-service \
  --service-name ya-commerce \
  --source-configuration file://apprunner-config.json
```

4. **Configure Environment Variables**
Add all variables from `.env.example` in App Runner console

5. **Custom Domain** (Optional)
- Add custom domain in App Runner console
- Update DNS records as instructed

---

## 🌐 Netlify Deployment (Alternative)

### Steps

1. **Connect Repository**
```bash
netlify init
```

2. **Configure Build**
- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

3. **Set Environment Variables**
```bash
netlify env:set VITE_SUPABASE_URL "your-url"
netlify env:set VITE_SUPABASE_ANON_KEY "your-key"
# ... add all variables
```

4. **Deploy**
```bash
netlify deploy --prod
```

---

## 🔧 Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run serve
```

### Testing Serverless Functions Locally

Install Netlify CLI:
```bash
npm install -g netlify-cli
netlify dev
```

Functions will be available at `http://localhost:8888/.netlify/functions/`

---

## 📚 API Endpoints

### Authentication
- `POST /api/auth/email/send-otp` - Send email OTP
- `POST /api/auth/email/verify-otp` - Verify email OTP
- `POST /api/auth/phone/send-otp` - Send phone OTP (WhatsApp)
- `POST /api/auth/phone/verify-otp` - Verify phone OTP
- `GET /api/auth/google/callback` - Google OAuth callback

### Payments
- `POST /api/payment/create-order` - Create Razorpay order
- `POST /api/payment/verify` - Verify payment signature

### Orders
- `POST /api/order/create` - Create new order

---

## 🔒 Security Checklist

- [x] Environment variables not in code
- [x] Supabase RLS policies enabled
- [x] Rate limiting on OTP endpoints
- [x] OTP expiry (5 minutes)
- [x] Payment signature verification
- [x] Phone verification required for orders
- [x] HTTPS only in production
- [x] CORS properly configured
- [x] Input validation on all endpoints

---

## 📊 Database Schema

The complete Supabase schema is provided in the attached SQL file.
Key tables:
- `customers` - User profiles
- `products`, `product_variants` - Product catalog
- `orders`, `order_items` - Order management
- `shipments`, `shipment_tracking_events` - Shipping & tracking
- `returns` - Return management
- `product_reviews` - Product reviews
- `support_tickets` - Customer support
- `temp_otp` - Temporary OTP storage

---

## 🎨 Features Implemented

### Customer Features
- ✅ Multi-method authentication (Email OTP, Phone OTP, Google)
- ✅ Product browsing with filters and search
- ✅ Shopping cart with persistence
- ✅ Guest & registered checkout
- ✅ Multiple payment options (Razorpay, COD)
- ✅ Order tracking with real-time updates
- ✅ Product reviews with media upload
- ✅ Returns & refunds
- ✅ Support tickets with attachments
- ✅ Wishlist
- ✅ Multiple addresses
- ✅ Order history

### Technical Features
- ✅ React + TypeScript + Vite
- ✅ Tailwind CSS + shadcn/ui
- ✅ Supabase (PostgreSQL + Auth + Storage)
- ✅ Serverless functions (Netlify/AWS)
- ✅ Real-time inventory management
- ✅ Media upload to S3 via presigned URLs
- ✅ Email notifications (Brevo)
- ✅ WhatsApp notifications (Meta)
- ✅ Payment gateway integration (Razorpay)
- ✅ SEO optimized
- ✅ Mobile responsive
- ✅ Production-ready

---

## 🐛 Troubleshooting

### Functions Not Working
1. Check environment variables are set
2. Verify Netlify/App Runner configuration
3. Check function logs in console
4. Ensure CORS headers are correct

### OTP Not Sending
1. Verify Brevo/WhatsApp API keys
2. Check sender email is verified in Brevo
3. Verify WhatsApp template is approved
4. Check rate limits

### Payment Failing
1. Verify Razorpay keys (test vs live)
2. Check signature verification
3. Ensure webhook URL is configured
4. Check Razorpay dashboard for errors

### Images Not Uploading
1. Verify S3 presign server is running: https://aykqayvu7k.us-east-1.awsapprunner.com
2. Check CORS policy on S3 bucket
3. Verify file size limits
4. Check network errors in browser console

---

## 📞 Support

For issues or questions:
1. Check [Supabase Docs](https://supabase.com/docs)
2. Check [Netlify Docs](https://docs.netlify.com)
3. Check [AWS App Runner Docs](https://docs.aws.amazon.com/apprunner/)

---

## 📄 License

Proprietary - YA Commerce © 2025

---

## 🎯 Next Steps After Deployment

1. ✅ Test all auth methods
2. ✅ Test payment flow end-to-end
3. ✅ Add products via Supabase
4. ✅ Configure shipping zones & methods
5. ✅ Set up email templates
6. ✅ Configure WhatsApp templates
7. ✅ Test order fulfillment workflow
8. ✅ Enable Google Analytics (optional)
9. ✅ Set up monitoring & alerts
10. ✅ Perform security audit

**Your YA Commerce store is now production-ready! 🎉**
