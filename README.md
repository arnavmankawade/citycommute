# CityCommute

**Pune's metro, and everything worth stopping for.**

CityCommute is a civic and community web app built for the OpenAI Metro Hackathon (Urban Mobility track). It helps newcomers and locals get around Pune by metro, and shows what to eat, do and see around every station.

## Features

- **Day-out builder.** Pick a start station, a mood (Foodie, Chill, Culture or Play), how much time you have and a budget. CityCommute chains real places along the metro, checks that each one is open when you arrive, and keeps the plan within budget. It shows the train to take, arrival times and the total cost.
- **Tap-anywhere map.** Tap a station, choose an area like Koregaon Park or Camp, or drop a pin anywhere on the map. You see every place within walking distance and the nearest metro station.
- **305 real places** around all 28 stations: food, cafés, gaming cafés, escape rooms, bowling, cinemas, parks, hills, temples and heritage sites. Each has its rating, price level, opening hours and walking time.
- **Live "open now"**, worked out in Pune time from opening hours.
- **Postcards** of 12 landmarks, each linked to its nearest station.
- **Journey planner** comparing metro, PMPML bus, auto, cab and walking by time, cost and comfort.
- **Metro ticket booking (prototype).** Fares with student and weekend discounts, and sample tickets saved in the browser. These tickets are not valid for travel.
- **PMPML bus** fare finder, passes and metro–bus connections.
- **Newcomer guide** with hours, fares, discounts and lines under construction.
- Works on phones, supports dark mode and respects reduced-motion settings.

## Tech

A single static page: HTML, CSS and vanilla JavaScript, with no build step and no API keys. The place data is embedded in `index.html` (and also kept in `data/places.json`). Photos are in `img/`.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .
# or
python3 -m http.server 8000
```

## Deploy

- **Vercel:** import this repo; no settings are needed (framework preset "Other").
- **GitHub Pages:** Settings → Pages → Deploy from branch → `main`, folder `/ (root)`.

## Project structure

```
index.html          the app (styles, scripts and embedded place data)
img/                landmark, food and metro photos (Wikimedia Commons)
data/places.json    the 305 places, each linked to its nearest station
data/photos.json    photo authors, licences and sources
CREDITS.md          photo credits and data sources
```

## Accuracy notes

- Station names, line order, hours and fare rules come from public sources listed in [CREDITS.md](CREDITS.md).
- Metro fares are estimated from the number of stops and match published fares (₹10–₹35).
- Road travel times, auto and cab prices, day-out spending and bus departures are estimates.
- Walking times are straight-line distance plus 30% for real streets.

## Credits

See [CREDITS.md](CREDITS.md) for photo authors and licences, and for the data sources.
