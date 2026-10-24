# CityCommute

**Pune's metro, and everything worth stopping for.**

**Live site:** https://arnavmankawade.github.io/citycommute/

CityCommute is a city guide and transit companion for Pune, built for the OpenAI Metro Hackathon (Urban Mobility / Civic & community track). Search any big place in Pune, like MIT-WPU, Hinjewadi, Koregaon Park or the airport, and see the food, fun, shops and sights around it, the nearest metro station and the buses that get you there. Then pay for the ride from one wallet, or just ask the assistant.

## Features

- **City-wide places.** 826 real places (Google Maps data) around 55 big locations (13 colleges, 5 IT parks, 6 malls, 23 neighbourhoods, hangouts, attractions and transport hubs) and all 28 metro stations. Every place has its rating, review count, price level, opening hours, locality, nearest metro and walking time.
- **Search anything.** "mitwpu", "biryani", "Hinjewadi", "bowling": search matches places, locations (with aliases like `mit wpu`, `sppu`, `coep`), dishes and stations.
- **Explore map.** Pick a location type and place, tap a metro station, or drop a pin anywhere. Filter by food, cafés, fun, shops, outdoors and heritage, open now, 4.5★ and up, budget and walking distance.
- **Eat like a Punekar.** 15 food types (cafés, misal and snacks, thalis, biryani, South Indian, Irani cafés, bakeries, desserts, Chinese and Asian, rooftops and more), each with counts and the top-rated spot. Tap one to see it across Pune.
- **Day-out builder.** Mood, time and budget in; a metro-linked plan out, with every stop checked as open when you arrive.
- **Journey planner.** Compares metro, PMPML bus (names a real direct route when one exists), auto, cab and walking.
- **PMPML buses.** 8 major routes with every stop, first and last buses, frequencies and metro connections, plus Pune Metro's 11 feeder shuttles.
- **Pay & ride (test mode).** A wallet for metro tickets, PMPML tickets and PMPML day or monthly passes. You can top up, pay, see your payment history and show a code at the gate. Payments go through the backend (mock, or Razorpay test mode).
- **Ask CityCommute.** An assistant for any Pune location question. It uses Gemini on the backend, grounded on CityCommute's own data, so it doesn't invent places.

## Architecture

```
index.html          the app: HTML, CSS and JS, with data embedded (works as a static page too)
shared/core.js      shared logic used by the page AND the server: fares, wallet rules, place retrieval, assistant prompt
server/             Node + Express backend
  app.js            API routes
  lib/payments.js   mock provider or Razorpay Orders API + signature/webhook verification
  lib/gemini.js     Gemini generateContent client
  lib/store.js      JSON-file store (swap for Postgres/Firestore in production)
  test/             API tests (node --test)
data/places.json    826 places   data/hubs.json  55 locations   data/bus.json  PMPML routes + feeders
img/                photos (Wikimedia Commons, credited in CREDITS.md)
```

The page detects the backend automatically. When it's served by `server/` it uses the API for the wallet and chat. Opened on its own, it falls back to browser storage and offline answers from the data.

### API

| Method | Path | What it does |
|---|---|---|
| GET | `/api/health` | Service info: payment provider, chat engine, data counts |
| GET | `/api/wallet` | Wallet state for the device (`X-Device-Id` header) |
| POST | `/api/wallet/:action` | `buy_metro`, `buy_bus`, `buy_pass`, `remove_ticket` (402 if balance is short) |
| POST | `/api/payments/order` | Create a top-up order (₹10–₹5,000) |
| POST | `/api/payments/verify` | Verify payment (Razorpay HMAC signature) and credit the wallet once |
| POST | `/api/payments/webhook` | Razorpay `payment.captured` webhook (signature checked) |
| POST | `/api/chat` | Ask the assistant; server retrieves context from the data and calls Gemini |
| GET | `/api/nearby?hub=mitwpu&cat=eat` | Places near a location or `?station=` |
| GET | `/api/search?q=` | Search locations and places |

Money can only enter a wallet through a verified payment. The spend endpoints can't add balance.

## Run it

```bash
cd server
npm install
cp ../.env.example ../.env      # optional: add GEMINI_API_KEY and Razorpay TEST keys
npm start                       # http://localhost:3000
npm test                        # 13 API tests
```

- **Gemini:** get a key at Google AI Studio and set `GEMINI_API_KEY` (model defaults to `gemini-2.5-flash`). Without a key, the assistant answers straight from the data.
- **Razorpay:** set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to **test** keys (`rzp_test_…`). The server refuses live keys unless you set `ALLOW_LIVE_PAYMENTS=true`. Without keys, top-ups use the built-in mock.

### Deploy

- **Full app (with backend):** any Node host such as Render, Railway or Fly.io. Root directory `server`, start command `npm start`, and set the env vars there.
- **Static only:** Vercel or GitHub Pages serving the repo root. Wallet and chat then run in the browser without the backend.

## Accuracy notes

- Station names, line order, hours and fare rules come from the public sources in [CREDITS.md](CREDITS.md).
- Metro fares are estimated from the number of stops and match published fares (₹10–₹35). PMPML fares use the June 2025 slabs.
- Road times, auto and cab prices, day-out spending, bus next departures and bus-ticket distances are estimates.
- Payments are test mode only, and tickets are not valid for travel.

## Credits

See [CREDITS.md](CREDITS.md).
