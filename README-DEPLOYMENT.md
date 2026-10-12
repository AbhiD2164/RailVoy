# RailVoy — Multi-App System Architecture, Development & Deployment Guide

> **Architecture Overview**: The RailVoy platform consists of 3 distinct, decoupled applications plus an AI service, each running independently with their own frontends and backends to ensure clean separation of concerns, user identity isolation, and banking security.

---

## 📐 System Architecture & Port Allocation

| Component | Layer | Dev Port | Role & Responsibility |
|---|---|---|---|
| **RailVoy Reservation** | Frontend | **5173** | Passenger reservation UI, search, sequential booking wizard |
| **RailVoy Reservation** | Backend | **5000** | Core booking engine, trains database, dynamic fares, ACID reservations |
| **RailVoy-Pay** | Frontend | **5174** | Dedicated payment portal, wallet balance, 4-digit MPIN management |
| **RailVoy-Pay** | Backend | **4001** | Secure debit authorization, bcrypt MPIN verification, ledger |
| **RailVoy-Accounts** | Frontend | **5175** | Digital Railway Passenger ID card, Security Inbox (OTP / alerts) |
| **RailVoy-Accounts** | Backend | **4002** | Railway ID issuance, 7-day persistent session JWT, alert dispatch |
| **AI Intelligence** | Backend | **8000** | Python/FastAPI — fare prediction, delay reallocation suggestions |

---

## 🖥️ Running All Applications on the Same Desktop

### Method 1: Multiple Terminal Windows (Recommended for Development)

Open **7 PowerShell terminal tabs/windows** in your IDE or Windows Terminal:

```powershell
# Tab 1: RailVoy Main Backend
cd "d:\Sem-3 Mini Project\RailVoy\backend"
node server.js

# Tab 2: RailVoy Main Frontend
cd "d:\Sem-3 Mini Project\RailVoy\frontend"
npm run dev

# Tab 3: RailVoy-Pay Backend
cd "d:\Sem-3 Mini Project\RailVoy-Pay\backend"
node server.js

# Tab 4: RailVoy-Pay Frontend
cd "d:\Sem-3 Mini Project\RailVoy-Pay\frontend"
npm run dev

# Tab 5: RailVoy-Accounts Backend
cd "d:\Sem-3 Mini Project\RailVoy-Accounts\backend"
node server.js

# Tab 6: RailVoy-Accounts Frontend
cd "d:\Sem-3 Mini Project\RailVoy-Accounts\frontend"
npm run dev

# Tab 7: AI Service (Python FastAPI)
cd "d:\Sem-3 Mini Project\RailVoy\ai-service"
uvicorn main:app --reload --port 8000
```

### Method 2: Concurrently via Root `package.json`

Run all services simultaneously from a single terminal:

```powershell
cd "d:\Sem-3 Mini Project"
npm run dev:all
```

*(Ensure `concurrently` is installed in the root workspace)*

---

## 🌐 Application URLs

| Application | URL | Features |
|---|---|---|
| **RailVoy Reservation** | http://localhost:5173 | Search trains, book seats, view tickets, admin panel |
| **RailVoy-Pay** | http://localhost:5174 | Register wallet, set 4-digit MPIN, add funds, view ledger |
| **RailVoy-Accounts** | http://localhost:5175 | Issue Railway Passenger ID, view 7-day session, check Security Inbox |

---

## 🔑 Demo & Test Credentials

| Service | Identifier | Password / PIN | Description |
|---|---|---|---|
| **RailVoy Admin** | `admin@railvoy.com` | `admin123` | System Administrator with train coach management |
| **RailVoy-Accounts** | `RVACC-IN994821` | `Railway@123` | Demo Railway passenger account with 7-day session |
| **RailVoy-Pay** | `RVPAY-DEMO1001` | MPIN: `1234` | Demo payment wallet with ₹50,000 pre-loaded balance |

---

## 📡 Real-Time Indian Railways Data & Feasibility Analysis

### Can real-time Indian Railways data be obtained 100% free of cost?

**Executive Summary:**
No official, reliable real-time API is available completely free of cost for Indian Railways data due to commercial and security policies maintained by CRIS (Centre for Railway Information Systems) and IRCTC.

| Data Category | Free Feasibility | Official Status | Practical Solution / Alternatives |
|---|---|---|---|
| **Train Schedules & Routes** | ✅ Free / Open | Public domain timetables | Bundled in RailVoy dataset (`dataset/trains.json`). Can also use free tier of [RailwayAPI.com](https://railwayapi.com). |
| **Live Train Running Status** | ⚠️ Limited / Unofficial | Restricted by CRIS | Free tier APIs (e.g., RapidAPI IRCTC wrappers) provide ~50-100 free requests/month. Scraping NTES is prone to IP bans and violates terms. |
| **Live PNR & Seat Availability** | ❌ No Free Access | Strictly restricted to IRCTC B2B | IRCTC charges licensing fees and security deposits for live seat and booking APIs. |
| **Dynamic Pricing** | ❌ Not available | IR does not use airline-style dynamic pricing | IR uses a fixed Slab Tatkal/Premium Tatkal scheme, which RailVoy accurately computes via its internal fare engine. |

**Recommended Architecture:**
- **Development/Academic Mode (Current):** Use RailVoy's built-in simulation engine with ACID seat matrix, dynamic pricing AI model, and real-time socket events.
- **Production Mode:** Plug in official IRCTC B2B partner APIs or a licensed aggregator (e.g., EaseMyTrip, ConfirmTkt APIs) using the environment variables detailed below.

---

## 🛠️ Production Deployment & Tweaks Required

When transitioning the project from local development to production platforms (Vercel, Docker, Render, etc.), make the following adjustments:

### 1. Inter-Service Communication & URLs
In development, services communicate via `http://localhost:4001` and `http://localhost:4002`. In production, set these via environment variables:

In `RailVoy/backend/routes/authRoutes.js`, `bankingRoutes.js`, and `bookingRoutes.js`:
```javascript
const ACCOUNTS_SERVICE_URL = process.env.RAILVOY_ACCOUNTS_URL || 'http://localhost:4002';
const PAY_SERVICE_URL = process.env.RAILVOY_PAY_URL || 'http://localhost:4001';
```

### 2. Environment Variables Configuration

#### RailVoy Main Backend (`RailVoy/backend/.env`)
```env
PORT=5000
NODE_ENV=production
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/railvoy?retryWrites=true&w=majority
JWT_SECRET=production_super_secure_jwt_secret_key_railvoy_2026
FASTAPI_URL=https://railvoy-ai.onrender.com
CORS_ORIGIN=https://railvoy.vercel.app

# Cross-Service Microservice Endpoints
RAILVOY_ACCOUNTS_URL=https://railvoy-accounts.onrender.com
RAILVOY_PAY_URL=https://railvoy-pay.onrender.com

# Production External APIs
GOOGLE_CLIENT_ID=your_real_google_oauth_client_id.apps.googleusercontent.com
GOOGLE_CALENDAR_API_KEY=your_real_google_calendar_api_key
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_real_razorpay_secret
```

#### RailVoy-Pay Backend (`RailVoy-Pay/backend/.env`)
```env
PORT=4001
NODE_ENV=production
JWT_SECRET=production_secure_rvpay_jwt_secret_2026
CORS_ORIGIN=https://railvoy.vercel.app,https://railvoy-pay.vercel.app
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/rvpay
```

#### RailVoy-Accounts Backend (`RailVoy-Accounts/backend/.env`)
```env
PORT=4002
NODE_ENV=production
JWT_SECRET=production_secure_rvacc_jwt_secret_2026
CORS_ORIGIN=https://railvoy.vercel.app,https://railvoy-accounts.vercel.app
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/rvaccounts
```

### 3. Database Persistence
- Replace the development JSON file stores (`data/users.json`, `data/accounts.json`) with MongoDB Atlas instances by connecting Mongoose schemas.
- Remove demo seeding routines before launching to production.

### 4. Deployment Platform Instructions

#### A. Vercel (Frontends)
1. Deploy each frontend as an independent Vercel project:
   - `RailVoy/frontend`
   - `RailVoy-Pay/frontend`
   - `RailVoy-Accounts/frontend`
2. In each frontend, configure `vite.config.ts` or set `VITE_API_BASE_URL` in Vercel environment variables pointing to the respective Render backend URL.

#### B. Render / Railway (Backends)
1. Create separate Web Services for:
   - Main Backend (Node.js)
   - Pay Backend (Node.js)
   - Accounts Backend (Node.js)
   - AI Service (Python FastAPI)
2. Add environment variables specified in Section 2 to each service dashboard.

#### C. Docker Deployment
Use the updated `docker-compose.yml` to spin up all containers with internal DNS:
```bash
docker-compose up --build -d
```
All containers communicate through the Docker bridge network using container names instead of `localhost`.

---

## 🔒 Security & Privacy Enforcement Highlights

1. **Zero Financial Leakage**: No PINs, MPINs, or bank account numbers are displayed on screen or logged into the main RailVoy application. Payments are authorized either by external 4-digit MPIN or 6-digit OTP.
2. **ACID Transaction Commit**: The booking pipeline implements a two-phase commit:
   - Initial state: `PENDING`
   - Seat reservation holds inventory
   - Payment deduction confirms the transaction
   - On database or network error, inventory is automatically rolled back and released.
3. **No Technical Error Messages**: All system, database, and connection errors are intercepted and translated into clear, friendly guidance for the passenger.
4. **Identity & Inbox Isolation**: OTPs and security alerts are dispatched directly to the passenger's RailVoy-Accounts Security Inbox, keeping credentials out of the reservation flow.
5. **Catering & Pantry Enforcement**: Trains without pantry cars or journeys outside official meal windows automatically disable meal options and exclude food surcharges.
