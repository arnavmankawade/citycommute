# CityCommute

Pune metro companion for the OpenAI Metro Hackathon (Urban Mobility / Civic & community track). It helps newcomers and locals travel by metro and find food, fun and sights near every station.

## Stack
- One static page: `index.html` holds all HTML, CSS and vanilla JS. No framework, no build step, no API keys.
- Data is embedded in `index.html` as `<script type="application/json">` blocks: `placesData` (305 places), `imgData` (photo credits) and `busData` (PMPML routes + feeder shuttles). `data/places.json`, `data/photos.json` and `data/bus.json` are copies of the same data.
- Photos live in `img/` and come from Wikimedia Commons (CC licences). Every photo must show its credit (`credit(key)` helper).
- Run it with `python3 -m http.server 8000`. Deploy it to Vercel or GitHub Pages as a static site.

## Page sections, in order
Hero (team skyline photo + canvas metro animation) → station ticker → statement → Postcards + Taste of Pune (`#sights`) → Day out (`#dayout`) → Explore map (`#explore`) → Plan (`#plan`) → Tickets (`#tickets`) → Bus (`#bus`) → Guide (`#guide`). A floating pill dock links to each section.

## Key data and functions (inside the main script)
- `ST`: station → [lat, lng]. `LINES.purple` / `LINES.aqua`: ordered station lists. `XCHG = "District Court"` is the only interchange.
- Place record: `{n name, c category (eat|fun|out|see), s subcategory, st nearest station, d metres, w walk min, alt, loc, a address, lat, lng, r rating, rc review count, pl price level, id Google place_id, h weekday hours[]}`.
- `route(a, b)` → metro segments, hops and km. `fare(hops)` → ₹10–₹35, fitted to published fares. `rideMin(r)` → ride time.
- `openAt(place, dayIdx, minutes)` → true / false / null, from Google hours text in IST (`istNow()`).
- `buildDay()` → greedy day-out planner: mood slots, open-on-arrival check, budget, metro hops.
- Buses: `BUS.routes[].dirs[]` = `{from,to,first,last,trips,stops[]}`; `stopStation(stopName)` maps bus stops to metro stations; `routesAt(station)`, `directBus(a,b)`, `headway(route,dir)`. Next departures are estimated from first bus + frequency; label them as estimates.
- Explore map: SVG drawn from lat/lng (`px`/`unpx`). `selectStation`, `dropPin`, `visiblePlaces` (filters), `paintScale` (marker sizes in screen pixels).

## Facts (verified Oct 2026; re-check before changing)
- Purple Line: 13 open stations, PCMC Bhavan → Swargate. Range Hills is not open yet.
- Aqua Line: 16 stations, Vanaz → Ramwadi. RTO Pune is the same stop as Mangalwar Peth.
- Metro runs 6 am–11 pm. Students and everyone at weekends get 30% off (the discounts don't stack).
- PMPML fares since 1 June 2025: ₹10 / ₹20 / ₹30 / ₹40 per 5 km slab. Daily pass ₹70 (PMRDA ₹150), monthly ₹1,500.

## Rules
- Never invent ratings, hours, prices, phone numbers or places. Use `null` and show "not listed".
- Label estimates as estimates: road times, auto/cab prices, day-out spend, bus departures (marked "Sample").
- Ticket booking is a prototype. Keep the "not valid for travel" labels. Never collect payment details.
- Design: DM Sans + DM Mono, colours as tokens on `:root` with dark-mode overrides, line colours as the only accents, mobile-first with no horizontal scroll, respect `prefers-reduced-motion`.
- Wrap `localStorage` in try/catch (keys `cc_saved_places`, `cc_tickets2`).
- When adding photos, use freely licensed images only, and add them to `imgData`, `data/photos.json` and `CREDITS.md`.
