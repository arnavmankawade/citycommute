# CityCommute

Pune city guide + transit companion for the OpenAI Metro Hackathon (Urban Mobility / Civic & community). Find food, fun, shops and sights around any big Pune place, get there by metro or PMPML bus, pay from a test-mode wallet, and ask a Gemini assistant.

## Layout
- `index.html`: the whole frontend (HTML/CSS/vanilla JS). Data is embedded as `<script type="application/json">` blocks: `placesData`, `hubsData`, `imgData`, `busData`, and `shared/core.js` is inlined as `window.CC_CORE`. When editing data, change `data/*.json` and keep the embedded copies in sync.
- `shared/core.js`: single source of truth for fares (`route`, `fare`, `busFare`, `metroQuote`, `busQuote`, `BUS_PASSES`), wallet rules (`applyAction` reducer, `LIMITS`), opening hours (`openAt`), dish matching (`DISHES`, `matchDish`), assistant retrieval (`retrieve`) and `SYSTEM_PROMPT`. UMD: `require()` in Node, `window.CC_CORE` in the browser.
- `server/`: Express API (`app.js`), payments (`lib/payments.js`: mock or Razorpay test), Gemini (`lib/gemini.js`), JSON store (`lib/store.js`), tests in `server/test`. Run `cd server && npm install && npm start`; `npm test`.

## Data
- Place: `{n, c (eat|fun|shop|out|see), s subcategory, st nearest station, ds metres to station, w walk min, hub nearest location id, dh metres, loc locality, a address, lat, lng, r rating, rc reviews, pl price level, id Google place_id, t types, h weekday hours[]}`.
- Hub (big location): `{id, n, full, t (College|IT park|Mall|Neighbourhood|Hangout|Attraction|Transport), lat, lng, a aliases[]}`. Search matches aliases, e.g. `mitwpu`.
- Bus: `routes[].dirs[] = {from,to,first,last,trips,stops[]}`, `feeders[]`. `stopStation()` maps stop names to metro stations.

## Frontend storage modes (Store in index.html)
1. `server`: `/api/health` answers `{service:"citycommute"}` → wallet and chat go through the API (device id in `X-Device-Id`).
2. `account`: the hosted artifact runtime provides `db` + `user` → wallet saved at `data/users/<id>/wallet`; chat uses the runtime `sample` AI.
3. `local`: localStorage, with offline chat answers from `retrieve()`.

## Facts (verified Oct 2026)
- Purple Line: 13 open stations, PCMC Bhavan → Swargate (Range Hills not open). Aqua Line: 16 stations, Vanaz → Ramwadi. RTO Pune = Mangalwar Peth. Only interchange: District Court.
- Metro 6 am–11 pm; fares ₹10–₹35; 30% off for students and at weekends (not stacked).
- PMPML fares since 1 June 2025: ₹10/₹20/₹30/₹40 per 5 km. Daily pass ₹70 (PMRDA ₹150), monthly ₹1,500.

## Rules
- Never invent places, ratings, hours, prices or routes; the assistant must answer from `retrieve()` context.
- Label estimates (road times, auto/cab prices, spend, next departures, bus distances).
- Payments are test mode. Never collect card/UPI details in our UI; wallet credit only via `/api/payments/verify` or the webhook. Keep the live-key guard.
- Design: DM Sans + DM Mono, colour tokens with dark mode, metro line colours as accents, mobile-first, no horizontal scroll, respect reduced motion. Credit every photo.
