# 🚆 RailVoy — Intelligent Railway Reservation & AI Decision-Support Platform

> **Sem-3 Mini Project** | MERN + FastAPI + Machine Learning | Production-Grade Architecture

RailVoy is a full-stack railway reservation system that goes beyond a simple booking form. Every core interaction — waitlist handling, delay response, seat allocation, food selection, and fare calculation — is treated as a decision problem that the system actively reasons about, with explanations surfaced to the passenger in plain language.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend (Vite + TS)               │
│   Train Search · Seat Matrix · Booking · Payment · Tickets  │
│   Admin Dashboard · Live Tracker · AI Insights Drawer       │
└─────────────────────┬───────────────────────────────────────┘
                      │ REST + Socket.IO
┌─────────────────────▼───────────────────────────────────────┐
│              Express.js Backend API (Node.js)                │
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────────┐ │
│  │ Auth/JWT/    │ │ Seat Inventory│ │  Fare Engine        │ │
│  │ Google OAuth │ │ ACID Mutex   │ │  Dynamic Pricing    │ │
│  └──────────────┘ └──────────────┘ │  Google Calendar    │ │
│  ┌──────────────┐ ┌──────────────┐ │  Surge Detection    │ │
│  │ Booking/PNR  │ │ Socket.IO    │ └─────────────────────┘ │
│  │ Waitlist/RAC │ │ Real-Time    │                          │
│  └──────────────┘ └──────────────┘                          │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP (internal)
┌─────────────────────▼───────────────────────────────────────┐
│              FastAPI AI Microservice (Python)                 │
│                                                              │
│  • XGBoost Waitlist Confirmation Probability Predictor      │
│  • Floor-Protected Dynamic Pricing Engine                    │
│  • NetworkX + Q-Learning Delay Replanner                    │
└─────────────────────────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                     MongoDB (Atlas / Local)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ Features

### Core Reservation
- 🔐 **Authentication** — JWT-based session management with role-based access (passenger / admin)
- 🔍 **Train Search** — Real-time search with departure/arrival, date, class, and train number filters
- 🪑 **Seat Matrix** — Live coach layout with berth-type visualization and real-time occupancy
- 🎫 **Booking** — Multi-passenger booking with PNR generation and security passcode
- ❌ **Cancellation** — Full/partial cancellation with automatic waitlist promotion
- 📲 **e-Tickets** — Downloadable e-ticket with QR-code style display

### AI Decision-Support
- 📊 **Waitlist Prediction** — XGBoost ML model predicts confirmation probability with confidence intervals
- 💰 **Dynamic Pricing** — Demand-aware fare calculation (Uber/Ola style) with hard floor protection matching Indian Railways statutory base fares
- 📅 **Festival Surge** — Google Calendar API integration tracks Indian festivals & school vacations for automatic surge multipliers
- 🚄 **Delay Replanning** — NetworkX route graph + Q-Learning policy evaluates train delays and recommends faster alternatives
- 🍽️ **Smart Meal Pricing** — Meal charges only applied when journey intersects official catering hours (Breakfast 7-10, Lunch 12-14, Dinner 19-21). Meal price varies by train category (Rajdhani/Duronto/Shatabdi/Express/Mail/Passenger).
- 🏷️ **Coupon System** — Admin-created time-bound coupons only; no default codes in system

### Production-Grade Internals
- ⚡ **Concurrency Control** — Per-train mutex (Promise-chaining) prevents double-booking race conditions
- 🔒 **ACID Transactions** — 4-phase booking: Payment Hold → Seat Reserve → Bank Debit → DB Write → Confirm
- ⏱️ **Fare Lock** — HMAC-signed 5-minute fare lock tokens prevent price changes during checkout
- 📈 **Booking Velocity** — 15-minute rolling window tracks booking bursts per train (surge tier escalation)
- 🗺️ **Route Graph** — BFS/Dijkstra across train network for multi-hop connectivity queries
- 🔌 **Socket.IO** — Real-time delay alerts and seat availability pushed to connected clients

### Admin Dashboard
- 🚂 Train & Station management (CRUD)
- 🎟️ Coupon code creation with time-based validity
- 🗺️ Route connectivity graph explorer (BFS multi-hop)
- 📊 Revenue analytics and demand analytics

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons |
| Backend | Node.js 20, Express.js, Socket.IO, JWT, bcrypt |
| AI Service | Python 3.12, FastAPI, XGBoost, scikit-learn, NetworkX |
| Database | MongoDB 7 (Atlas or local) |
| DevOps | Docker, docker-compose, Nginx |

---

## 🚀 Quick Start

### Option A: Docker (Recommended — Single Command)

```bash
# Clone and start everything
git clone <repo-url>
cd RailVoy
docker-compose up --build
```

Then open:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **AI Service**: http://localhost:8000/docs (Swagger UI)

### Option B: Manual Development

**Prerequisites:** Node.js 20+, Python 3.12+, MongoDB running locally

```bash
# 1. Install all dependencies
npm run install:all
pip install -r ai_service/requirements.txt

# 2. Configure backend
cp backend/.env.example backend/.env
# Edit backend/.env with your MONGO_URI and JWT_SECRET

# 3. Seed the database
npm run seed

# 4. Start all services at once
npm install   # installs concurrently
npm run dev
```

Services start at:
- Frontend: http://localhost:5173
- Backend: http://localhost:5000
- AI Service: http://localhost:8000

---

## 🔑 Environment Variables

### `backend/.env`
```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/railvoy
JWT_SECRET=your_super_secret_key_here
FASTAPI_URL=http://127.0.0.1:8000
# Optional: Enable live festival surge from Google Calendar
# GOOGLE_CALENDAR_API_KEY=your_google_api_key
```

### `ai_service/.env`
```env
AI_SERVICE_HOST=0.0.0.0
AI_SERVICE_PORT=8000
CORS_ORIGINS=http://localhost:5173,http://localhost:5000
```

---

## 🧠 How AI Features Work (Internally)

### 1. Waitlist Confirmation Probability (XGBoost)
- Model features: `[waitlist_position, class_tier, days_until_travel, historical_cancellation_rate]`
- Trained on synthetic IRCTC waitlist patterns (900 samples)
- Adjusted by real-time `occupancyRate` from seat inventory
- Returns probability with 95% confidence interval + recommended action

### 2. Dynamic Pricing (Floor-Protected Surge)
Pricing formula: `finalFare = max(statutory_base, baseFare × classMultiplier × surgeMultiplier)`

Surge factors applied in order:
1. **Booking velocity** — bookings in last 15 min per train (0%–60% surge)
2. **Calendar surge** — Indian festivals/vacations via Google Calendar API (15%–45%)
3. **Peak hours** — 06:00-09:30 and 17:00-21:00 (20% surge)
4. **Occupancy** — seat fill rate > 70% starts adding 5%–40% surge
5. **Waitlist scarcity** — high WL probability triggers 8% scarcity premium

### 3. Q-Learning Delay Replanner
- State space: `(delay_bucket, time_advantage_of_alt_train)`
- Action space: `STAY | TRANSFER | SEEK_ANOTHER`
- Pre-trained offline (250 episodes) with reward = time saved − transfer penalty
- Online: given a live delay, looks up Q-table to recommend optimal action

### 4. ACID Seat Booking
```
Phase 1: generateFareLock()        → HMAC token, 5-min TTL
Phase 2: reserveSeat()             → per-train mutex, atomic hold
Phase 3: Payment processing        → simulated bank debit
Phase 4: verifyAndConsumeFareLock()→ token burned atomically
Phase 5: confirmReservation()      → reserved → booked
Phase 6: DB write + Socket.IO emit → PNR persisted, clients notified
```

If any phase fails → automatic rollback via `releaseReservation()` + bank refund.

### 5. Meal Logic
- Journey departure + arrival times checked against `isMealTimeEligible()`:
  - Breakfast: 07:00–10:00 | Lunch: 12:00–14:00 | Dinner: 19:00–21:00
- Meal price varies by train category:
  - Rajdhani/Duronto: ₹195–₹350 (included in fare, premium add-ons)
  - Shatabdi/Vande Bharat: ₹155–₹225
  - Mail/Express: ₹85–₹145
  - Passenger/Local: No meal service
- Cold drinks and individual beverages: **explicitly blocked**

---

## 📁 Project Structure

```
RailVoy/
├── docker-compose.yml          # Single-command deployment
├── package.json                # Monorepo scripts (npm run dev)
│
├── backend/                    # Express.js API
│   ├── config/db.js            # MongoDB + in-memory fallback
│   ├── models/                 # Mongoose schemas
│   ├── routes/                 # REST endpoints
│   ├── services/
│   │   ├── fareService.js      # Dynamic pricing engine
│   │   ├── seatInventoryService.js  # ACID seat allocation
│   │   ├── aiProxyService.js   # FastAPI proxy client
│   │   └── mailService.js      # Nodemailer email
│   ├── middleware/             # JWT auth, rate limiting
│   └── server.js              # App entry point
│
├── ai_service/                 # FastAPI AI Microservice
│   ├── main.py                 # FastAPI app + endpoints
│   ├── predictor.py            # XGBoost waitlist predictor
│   ├── pricing.py              # Dynamic pricing engine
│   ├── delay_replanner.py      # NetworkX + Q-Learning
│   └── explanation.py         # Human-readable AI explanations
│
├── frontend/                   # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx             # Root component + state
│   │   ├── components/
│   │   │   ├── TrainSearch.tsx      # Search form
│   │   │   ├── TrainCard.tsx        # Result card with AI insights
│   │   │   ├── SeatMatrixModal.tsx  # Live coach layout
│   │   │   ├── BookingModal.tsx     # Booking + meal selection
│   │   │   ├── PaymentModal.tsx     # Payment simulation
│   │   │   ├── TicketViewer.tsx     # PNR + e-ticket
│   │   │   ├── LiveTracker.tsx      # Real-time train position
│   │   │   ├── AdminDashboard.tsx   # Admin CRUD + analytics
│   │   │   └── AIInsightsDrawer.tsx # AI explanation panel
│   │   └── types.ts            # TypeScript interfaces
│   └── nginx.conf             # Nginx SPA + API proxy config
│
└── dataset/                    # Seed data (trains, stations, fares)
    ├── trains.json
    ├── stations.json
    ├── fare_rules.json
    └── google_calendar_events.json
```

---

## 🧪 API Documentation

The FastAPI AI service exposes interactive Swagger docs at **http://localhost:8000/docs**

Key backend endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | JWT login |
| GET | `/api/trains/search` | Train search with AI fare |
| GET | `/api/trains/route-connectivity` | BFS route graph query |
| POST | `/api/bookings/quote` | Fare lock + seat hold |
| POST | `/api/bookings/create` | ACID booking creation |
| POST | `/api/bookings/cancel` | Cancel + promote waitlist |
| POST | `/api/bookings/transfer` | Delay-based ticket transfer |
| GET | `/api/bookings/seat-stats/:trainNo/:class/:date` | Live seat inventory |
| GET | `/api/admin/trains` | Admin train management |
| POST | `/api/admin/coupons` | Create time-bound coupon |

---

## 👥 Team & Acknowledgements

- **Platform**: Indian Railways inspiration (IRCTC, NTES, Where is My Train)
- **AI Models**: XGBoost, scikit-learn, NetworkX, Q-Learning (custom implementation)
- **Pricing Model**: Inspired by Uber/Ola demand-surge pricing with statutory floor protection

---

*RailVoy reframes railway reservation as a network optimization and decision-support problem — not a form-and-database exercise.*
