# YA Commerce

<div align="center">

![YA Commerce Logo](https://via.placeholder.com/150x150/f59e0b/ffffff?text=YA)

**Production-Ready E-Commerce Platform**

[![React](https://img.shields.io/badge/React-18-blue)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Latest-green)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-cyan)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red)](LICENSE)

[Features](#-features) •
[Tech Stack](#-tech-stack) •
[Getting Started](#-getting-started) •
[Deployment](#-deployment) •
[Documentation](#-documentation)

</div>

---

## 📖 Overview

YA Commerce is a complete, production-ready e-commerce platform built with modern technologies. It features a beautiful React frontend, robust Supabase backend, serverless functions for auth & payments, and comprehensive order management.

### ✨ Key Highlights

- 🔐 **Multi-Method Authentication** - Email OTP, Phone OTP (WhatsApp), Google OAuth
- 💳 **Integrated Payments** - Razorpay (UPI, Cards, Wallets) + Cash on Delivery
- 📦 **Full Order Management** - Real-time tracking, shipments, returns, refunds
- ⭐ **Product Reviews** - With photo/video uploads
- 🎫 **Support System** - Ticketing with file attachments
- 📱 **Fully Responsive** - Mobile-first design
- 🚀 **Production-Ready** - Security, rate limiting, error handling built-in

---

## 🎯 Features

### Customer Features

#### Shopping Experience
- Browse products with advanced filters (category, price, rating)
- Search functionality
- Product detail pages with image galleries
- Variant selection (size, color, etc.)
- Real-time stock availability
- Add to cart with quantity selection
- Wishlist management
- Guest & registered checkout

#### Authentication
- Email OTP login (via Brevo)
- Phone OTP login (via WhatsApp - Meta Business)
- Google OAuth sign-in
- Account linking (prevents duplicate accounts)
- Phone verification required for orders

#### Checkout & Payments
- Multiple shipping addresses
- Address management
- Shipping method selection
- Coupon/discount application
- Payment options:
  - Razorpay (UPI, Cards, Net Banking, Wallets)
  - Cash on Delivery (COD)
- Order summary with tax & shipping calculations

#### Order Management
- Order history
- Real-time order tracking with timeline
- Shipment tracking (carrier, AWB, tracking number)
- Delivery status updates
- Order details & invoices
- Return requests
- Refund tracking

#### Reviews & Support
- Write product reviews with ratings
- Upload photos/videos with reviews
- Create support tickets
- Attach files to support tickets
- Track ticket status
- Ticket messaging system

### Admin Features (Backend)
*All managed via Supabase dashboard*
- Product management
- Inventory tracking
- Order fulfillment
- Customer management
- Shipping configuration
- Analytics & reports

---

## 🛠️ Tech Stack

### Frontend
- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS + shadcn/ui components
- **Routing:** Wouter (lightweight React router)
- **State Management:** React Context + TanStack Query
- **Forms:** React Hook Form + Zod validation
- **Icons:** Lucide React

### Backend
- **Database:** PostgreSQL (via Supabase)
- **Auth:** Supabase Auth
- **Storage:** AWS S3 (via presigned URLs)
- **Serverless Functions:** Netlify Functions / AWS Lambda

### Integrations
- **Email:** Brevo (SendinBlue) API
- **SMS/WhatsApp:** Meta WhatsApp Business API
- **Payments:** Razorpay
- **OAuth:** Google

### Infrastructure
- **Hosting:** AWS App Runner (recommended) or Netlify
- **Database:** Supabase (managed PostgreSQL)
- **Storage:** AWS S3
- **CDN:** Automatic (via hosting provider)

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- Supabase account
- Razorpay account (test mode works)
- Brevo account (for emails)
- Meta Business account (for WhatsApp)
- Google Cloud account (for OAuth - optional)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd ya-commerce
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
```

Edit `.env` and fill in all required values. See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed setup instructions.

4. **Run database migrations**

Execute the SQL in `supabase-migrations/001_temp_otps.sql` in your Supabase SQL editor.

5. **Import Supabase schema**

Execute the complete schema from `physical_store_schema_1776092233716.sql` in Supabase.

6. **Start development server**
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Testing Locally

To test serverless functions locally:

```bash
npm install -g netlify-cli
netlify dev
```

Functions will be available at `http://localhost:8888/.netlify/functions/`

---

## 📦 Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for comprehensive deployment instructions.

### Quick Deploy Options

#### AWS App Runner (Recommended)
```bash
# Using apprunner.yaml
aws apprunner create-service --cli-input-json file://apprunner-config.json
```

#### Netlify
```bash
netlify init
netlify deploy --prod
```

---

## 📚 Documentation

### Project Structure

```
ya-commerce/
├── src/
│   ├── components/
│   │   ├── layout/          # Header, Footer, Layout
│   │   ├── shared/          # Reusable components
│   │   └── ui/              # shadcn/ui components
│   ├── contexts/            # React contexts (Auth, Cart)
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utilities (API, Supabase, formatters)
│   ├── pages/               # Page components
│   ├── App.tsx              # Main app component
│   └── main.tsx             # Entry point
├── netlify/
│   └── functions/           # Serverless functions
├── supabase-migrations/     # Database migrations
├── public/                  # Static assets
├── .env.example             # Environment variables template
├── netlify.toml             # Netlify configuration
├── apprunner.yaml           # AWS App Runner configuration
├── DEPLOYMENT.md            # Deployment guide
└── README.md                # This file
```

### API Documentation

See [DEPLOYMENT.md](DEPLOYMENT.md#-api-endpoints) for complete API documentation.

### Database Schema

The complete database schema is in the attached `physical_store_schema_1776092233716.sql` file.

Key tables:
- **customers** - User profiles and authentication
- **products, product_variants** - Product catalog
- **orders, order_items** - Order management
- **shipments, shipment_tracking_events** - Shipping & tracking
- **returns** - Return/refund management
- **product_reviews** - Customer reviews
- **support_tickets, ticket_messages** - Support system
- **carts, cart_items** - Shopping cart
- **customer_addresses** - Shipping addresses
- **payments** - Payment records
- **temp_otp** - Temporary OTP storage

---

## 🔒 Security

- ✅ Environment variables for all secrets
- ✅ Supabase Row Level Security (RLS) policies
- ✅ Rate limiting on OTP endpoints
- ✅ OTP expiry (5 minutes)
- ✅ Maximum OTP attempts (3)
- ✅ Payment signature verification
- ✅ Input validation on all forms
- ✅ SQL injection protection (Supabase)
- ✅ XSS protection (React)
- ✅ HTTPS only in production
- ✅ CORS properly configured
- ✅ Phone verification for orders

---

## 🧪 Testing

### Manual Testing Checklist

- [ ] Email OTP login flow
- [ ] Phone OTP login flow (WhatsApp)
- [ ] Google OAuth login
- [ ] Product browsing and search
- [ ] Add to cart and cart management
- [ ] Checkout flow
- [ ] Razorpay payment
- [ ] Cash on Delivery order
- [ ] Order tracking
- [ ] Product review submission with photos
- [ ] Support ticket creation with attachments
- [ ] Return request
- [ ] Address management
- [ ] Wishlist functionality

---

## 🐛 Known Issues & Limitations

1. **WhatsApp Template Required** - Meta WhatsApp requires pre-approved templates. Create template named `otp_message` with body: `Your YA Commerce login code is: {{1}}`

2. **S3 Upload Server** - Media uploads use external S3 presign server at `https://aykqayvu7k.us-east-1.awsapprunner.com`. In production, host your own.

3. **Inventory Management** - Currently manual via Supabase dashboard. Admin panel can be added.

4. **Real-time Notifications** - Email/WhatsApp notifications implemented. Push notifications not yet added.

---

## 🤝 Contributing

This is a proprietary project. For bug reports or feature requests, please contact the development team.

---

## 📄 License

Proprietary - YA Commerce © 2025. All rights reserved.

---

## 👥 Team

Built by a senior full-stack development team specializing in e-commerce solutions.

---

## 📞 Support

For technical support or questions:
- Review the [DEPLOYMENT.md](DEPLOYMENT.md) guide
- Check Supabase documentation: https://supabase.com/docs
- Check Netlify documentation: https://docs.netlify.com
- Check AWS App Runner documentation: https://docs.aws.amazon.com/apprunner/

---

## 🎯 Roadmap

### Phase 1 ✅ (Current)
- [x] Complete frontend with all pages
- [x] Multi-method authentication
- [x] Payment integration (Razorpay)
- [x] Order management
- [x] Product reviews with media
- [x] Support system
- [x] Deployment configurations

### Phase 2 (Future)
- [ ] Admin dashboard
- [ ] Real-time inventory alerts
- [ ] Push notifications
- [ ] Advanced analytics
- [ ] Email templates customization
- [ ] Loyalty program
- [ ] Bulk order management
- [ ] Multi-warehouse support
- [ ] API for third-party integrations

---

<div align="center">

**Made with ❤️ for modern e-commerce**

[⬆ Back to Top](#ya-commerce)

</div>
