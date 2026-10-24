/* CityCommute shared core: fares, wallet rules, place retrieval and the assistant prompt.
   Used by the browser page (inlined at build time as window.CC_CORE) and by the Node server (require). */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CC_CORE = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- Metro network ----------
  const ST = {
    "PCMC Bhavan": [18.6295, 73.8030], "Sant Tukaram Nagar": [18.6145, 73.8157], "Nashik Phata": [18.6094, 73.8201], "Kasarwadi": [18.5997, 73.8273],
    "Phugewadi": [18.5911, 73.8311], "Dapodi": [18.5838, 73.8338], "Bopodi": [18.5697, 73.8381], "Khadki": [18.5624, 73.8420], "Shivaji Nagar": [18.5325, 73.8492],
    "District Court": [18.5268, 73.8579], "Kasba Peth": [18.5216, 73.8597], "Mahatma Phule Mandai": [18.5127, 73.8574], "Swargate": [18.4997, 73.8575],
    "Vanaz": [18.5072, 73.8052], "Anand Nagar": [18.5095, 73.8140], "Paud Phata": [18.5091, 73.8219], "SNDT College": [18.5073, 73.8287],
    "Garware College": [18.5118, 73.8377], "Deccan Gymkhana": [18.5162, 73.8443], "Chhatrapati Sambhaji Udyan": [18.5201, 73.8476], "PMC Bhavan": [18.5227, 73.8535],
    "RTO Pune": [18.5300, 73.8653], "Pune Railway Station": [18.5297, 73.8726], "Ruby Hall Clinic": [18.5327, 73.8778], "Bund Garden": [18.5408, 73.8836],
    "Yerawada": [18.5453, 73.8867], "Kalyani Nagar": [18.5451, 73.9058], "Ramwadi": [18.5571, 73.9087]
  };
  const LINES = {
    purple: { name: "Purple Line", color: "var(--purple)", stations: ["PCMC Bhavan", "Sant Tukaram Nagar", "Nashik Phata", "Kasarwadi", "Phugewadi", "Dapodi", "Bopodi", "Khadki", "Shivaji Nagar", "District Court", "Kasba Peth", "Mahatma Phule Mandai", "Swargate"] },
    aqua: { name: "Aqua Line", color: "var(--aqua)", stations: ["Vanaz", "Anand Nagar", "Paud Phata", "SNDT College", "Garware College", "Deccan Gymkhana", "Chhatrapati Sambhaji Udyan", "PMC Bhavan", "District Court", "RTO Pune", "Pune Railway Station", "Ruby Hall Clinic", "Bund Garden", "Yerawada", "Kalyani Nagar", "Ramwadi"] }
  };
  const XCHG = "District Court";
  const ALL = Object.keys(ST);

  function hav(a, b) {
    const R = 6371000, r = Math.PI / 180, dp = (b[0] - a[0]) * r, dl = (b[1] - a[1]) * r;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const linesOf = s => Object.keys(LINES).filter(k => LINES[k].stations.includes(s));
  const walkMin = m => Math.max(1, Math.round(m * 1.3 / 80));

  function route(a, b) {
    if (!ST[a] || !ST[b]) return null;
    if (a === b) return { segs: [], hops: 0, change: false, km: 0 };
    const la = linesOf(a), lb = linesOf(b), common = la.find(l => lb.includes(l));
    const seg = (line, x, y) => {
      const s = LINES[line].stations, i = s.indexOf(x), j = s.indexOf(y);
      const path = i < j ? s.slice(i, j + 1) : s.slice(j, i + 1).reverse();
      return { line, from: x, to: y, path, hops: path.length - 1, towards: i < j ? s[s.length - 1] : s[0] };
    };
    const segs = common ? [seg(common, a, b)] : [seg(la[0], a, XCHG), seg(lb[0], XCHG, b)];
    const hops = segs.reduce((t, s) => t + s.hops, 0);
    const km = segs.reduce((t, s) => { let d = 0; for (let k = 1; k < s.path.length; k++) d += hav(ST[s.path[k - 1]], ST[s.path[k]]); return t + d; }, 0) / 1000 * 1.1;
    return { segs, hops, change: segs.length > 1, km };
  }
  // Fitted to two published fares (Vanaz–Ruby Hall ₹25, PCMC–District Court ₹20); range ₹10–₹35.
  const fare = h => h <= 0 ? 0 : h <= 2 ? 10 : h <= 5 ? 15 : h <= 9 ? 20 : h <= 12 ? 25 : h <= 15 ? 30 : 35;
  const rideMin = r => r && r.hops ? Math.round(5 + r.hops * 2.3 + (r.change ? 7 : 0)) : 0;
  // PMPML slabs from 1 June 2025
  const busFare = km => km <= 5 ? 10 : km <= 10 ? 20 : km <= 15 ? 30 : km <= 20 ? 40 : 50;
  const BUS_PASSES = {
    daily: { label: "PMPML daily pass (Pune & PCMC)", price: 70, days: 1 },
    daily_pmrda: { label: "PMPML daily pass (PMRDA)", price: 150, days: 1 },
    monthly: { label: "PMPML monthly pass", price: 1500, days: 30 }
  };
  const isWeekend = iso => { const d = new Date(iso + "T00:00:00"); const g = d.getDay(); return g === 0 || g === 6; };

  function metroQuote({ from, to, pax = 1, legs = 1, student = false, date }) {
    const r = route(from, to);
    if (!r || !r.hops) throw new Error("Pick two different metro stations.");
    pax = Math.max(1, Math.min(6, parseInt(pax, 10) || 1)); legs = legs === 2 ? 2 : 1;
    const wk = date ? isWeekend(date) : false, base = fare(r.hops), per = Math.round(base * ((student || wk) ? 0.7 : 1));
    return { route: r, hops: r.hops, base, per, pax, legs, weekend: wk, student: !!student, total: per * pax * legs };
  }
  function busQuote({ km, pax = 1 }) {
    const k = Math.max(0.5, Math.min(60, Number(km) || 0)); pax = Math.max(1, Math.min(6, parseInt(pax, 10) || 1));
    const per = busFare(k);
    return { km: Math.round(k * 10) / 10, per, pax, total: per * pax };
  }

  // ---------- Wallet (test mode) ----------
  const LIMITS = { maxTopup: 5000, maxBalance: 10000, keepTxns: 60, keepTickets: 30 };
  const emptyState = () => ({ balance: 0, txns: [], tickets: [], createdAt: new Date().toISOString() });
  const refId = (p) => p + "-" + Date.now().toString(36).toUpperCase().slice(-5) + Math.random().toString(36).slice(2, 5).toUpperCase();

  /** Pure reducer. Returns {state, result}; throws Error with a viewer-facing message. */
  function applyAction(prev, action, p, ctx = {}) {
    const now = ctx.now || new Date().toISOString();
    const s = JSON.parse(JSON.stringify(prev || emptyState()));
    const txn = (type, amount, desc, extra) => { const t = Object.assign({ id: refId("TX"), type, amount, desc, at: now, status: "success" }, extra || {}); s.txns.unshift(t); s.txns = s.txns.slice(0, LIMITS.keepTxns); return t; };
    const spend = (amount, desc) => {
      if (s.balance < amount) { const e = new Error(`Not enough balance. You need ₹${amount - s.balance} more.`); e.code = "insufficient_funds"; e.shortfall = amount - s.balance; throw e; }
      s.balance -= amount; return txn("debit", amount, desc);
    };
    const addTicket = t => { s.tickets.unshift(t); s.tickets = s.tickets.slice(0, LIMITS.keepTickets); return t; };
    switch (action) {
      case "topup": {
        const amt = Math.round(Number(p.amount));
        if (!(amt >= 10)) throw new Error("Top up at least ₹10.");
        if (amt > LIMITS.maxTopup) throw new Error(`Top up at most ₹${LIMITS.maxTopup} at a time.`);
        if (s.balance + amt > LIMITS.maxBalance) throw new Error(`Wallet balance can't go over ₹${LIMITS.maxBalance}.`);
        s.balance += amt;
        const t = txn("credit", amt, `Wallet top-up via ${p.method || "UPI"} (test)`, { paymentRef: p.paymentRef || null, provider: p.provider || "mock" });
        return { state: s, result: { txn: t } };
      }
      case "buy_metro": {
        const q = metroQuote(p);
        const t = spend(q.total, `Metro ${p.from} → ${p.to}${q.legs > 1 ? " (return)" : ""} × ${q.pax}`);
        const ticket = addTicket({ id: refId("MT"), kind: "metro", from: p.from, to: p.to, pax: q.pax, legs: q.legs, date: p.date || now.slice(0, 10), total: q.total,
          lines: q.route.segs.map(x => x.line), hops: q.hops, txn: t.id, issuedAt: now, validFor: "Test ticket, not valid for travel" });
        return { state: s, result: { ticket, txn: t } };
      }
      case "buy_bus": {
        if (!p.route) throw new Error("Pick a bus route.");
        const q = busQuote(p);
        const t = spend(q.total, `PMPML route ${p.route}: ${p.fromStop} → ${p.toStop} × ${q.pax}`);
        const ticket = addTicket({ id: refId("BT"), kind: "bus", route: p.route, from: p.fromStop, to: p.toStop, pax: q.pax, km: q.km, total: q.total, txn: t.id,
          date: p.date || now.slice(0, 10), issuedAt: now, validFor: "Test ticket, not valid for travel" });
        return { state: s, result: { ticket, txn: t } };
      }
      case "buy_pass": {
        const pass = BUS_PASSES[p.type];
        if (!pass) throw new Error("Pick a pass.");
        const t = spend(pass.price, pass.label);
        const start = p.date || now.slice(0, 10);
        const end = new Date(Date.parse(start + "T00:00:00Z") + (pass.days - 1) * 864e5).toISOString().slice(0, 10);
        const ticket = addTicket({ id: refId("PS"), kind: "pass", type: p.type, label: pass.label, total: pass.price, from: start, to: end, txn: t.id, issuedAt: now, validFor: "Test pass, not valid for travel" });
        return { state: s, result: { ticket, txn: t } };
      }
      case "remove_ticket": {
        s.tickets = s.tickets.filter(t => t.id !== p.id);
        return { state: s, result: {} };
      }
      case "reset": return { state: emptyState(), result: {} };
      default: throw new Error("Unknown action.");
    }
  }

  // ---------- Places helpers ----------
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  function istNow() { const n = new Date(); return new Date(n.getTime() + (330 + n.getTimezoneOffset()) * 60000); }
  const dayIdx = d => (d.getDay() + 6) % 7;
  function toMin(t, mer) { const m = String(t).match(/(\d{1,2}):(\d{2})/); if (!m) return null; let h = +m[1] % 12; if (mer === "PM") h += 12; return h * 60 + +m[2]; }
  function parseDay(txt) {
    if (!txt || /Closed/i.test(txt)) return [];
    if (/24 hours/i.test(txt)) return [[0, 1440]];
    return txt.split(/,\s*/).map(seg => {
      const [a, b] = seg.split(/\s*–\s*/); if (!b) return null;
      const mb = (b.match(/AM|PM/) || [""])[0], ma = (a.match(/AM|PM/) || [mb])[0];
      let s = toMin(a, ma), e = toMin(b, mb); if (s == null || e == null) return null;
      if (e <= s) e += 1440; return [s, e];
    }).filter(Boolean);
  }
  const weekCache = new Map();
  function weekOf(p) {
    if (!p.h || !p.h.length) return null;
    if (weekCache.has(p.id)) return weekCache.get(p.id);
    const w = DAYS.map(d => { const line = p.h.find(x => x.startsWith(d + ":")); return line ? parseDay(line.slice(d.length + 1).trim()) : []; });
    weekCache.set(p.id, w); return w;
  }
  function openAt(p, di, min) {
    const w = weekOf(p); if (!w) return null;
    if (w[di].some(([s, e]) => min >= s && min < e)) return true;
    return w[(di + 6) % 7].some(([s, e]) => e > 1440 && min + 1440 < e);
  }
  const score = p => ((p.r || 4) * (p.rc || 0) + 4.2 * 60) / ((p.rc || 0) + 60);
  const CAFE = ["Café", "Irani café", "Dessert", "Bakery"];

  const DISHES = [
    { k: "misal", label: "Misal & snacks", re: /misal|vada ?pav|vadapav|pohe|snacks|alpopahar|amruttulya|vadewala|sabudana/i, subs: ["Local favourite"] },
    { k: "thali", label: "Thalis", re: /thali|bhojan|bhoj|khanaval|dining hall|boarding house/i, subs: ["Thali"] },
    { k: "biryani", label: "Biryani", re: /biryani|biriyani/i },
    { k: "south", label: "South Indian", re: /dosa|udupi|udipi|idli|south|madras|vaishali|roopali|kamath|sagar|anna\b|darshini/i },
    { k: "irani", label: "Irani cafés", re: /irani|yezdan|goodluck|vohuman|marz-o-rin|kayani/i, subs: ["Irani café"] },
    { k: "cafe", label: "Cafés & coffee", re: /cafe|café|coffee|brew(?!ery)|roast/i, subs: ["Café"] },
    { k: "bakery", label: "Bakeries", re: /bakery|bakehouse|patisserie|bakers/i, subs: ["Bakery"] },
    { k: "dessert", label: "Desserts & ice cream", re: /ice ?cream|kulfi|dessert|creamery|waffle|gelato|sundae|falooda|cold drink/i, subs: ["Dessert"] },
    { k: "pizza", label: "Pizza & burgers", re: /pizza|pizzeria|burger/i },
    { k: "asian", label: "Chinese & Asian", re: /chinese|wok|asian|thai|sushi|korean|momo|noodle|ramen|japanese|dimsum|tibet/i },
    { k: "seafood", label: "Seafood & Malvani", re: /malvani|seafood|fish|coastal|konkan|machli|gomantak/i },
    { k: "pavbhaji", label: "Pav bhaji", re: /pav ?bhaji/i },
    { k: "bars", label: "Bars & breweries", re: /brew(ery|ing|s)\b|\bpub\b|\btaproom|\bbar\b|\bsocial\b/i, subs: ["Bar & pub"] },
    { k: "rooftop", label: "Rooftops", re: /rooftop|terrace|\bsky|high ?dive|top deck|360/i },
    { k: "veg", label: "Pure veg", re: /pure veg|\bveg\b|vegetarian|shudh/i }
  ];
  const matchDish = (p, d) => p.c === "eat" && (d.re.test(p.n) || (d.subs || []).includes(p.s));

  // ---------- Retrieval for the assistant ----------
  const CATWORDS = [
    [/\b(cafe|cafes|café|coffee)\b/i, p => p.c === "eat" && CAFE.includes(p.s)],
    [/\b(fun|games?|gaming|bowling|arcade|escape|cinema|movie|trampoline|karting)\b/i, p => p.c === "fun"],
    [/\b(shop|shopping|mall|market|books?|bookstore)\b/i, p => p.c === "shop"],
    [/\b(park|garden|lake|hill|walk|nature|trek)\b/i, p => p.c === "out"],
    [/\b(temple|heritage|museum|history|historic|sights?|monument)\b/i, p => p.c === "see"],
    [/\b(food|eat|restaurant|lunch|dinner|breakfast|hungry|snack)\b/i, p => p.c === "eat"]
  ];
  function findHub(hubs, q) {
    const s = " " + q.toLowerCase().replace(/[^a-z0-9 ]+/g, " ") + " ";
    let best = null, bestLen = 0;
    for (const h of hubs) for (const a of [h.n, h.full, ...(h.a || [])]) {
      const k = " " + a.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim() + " ";
      if (k.trim().length >= 3 && s.includes(k) && k.length > bestLen) { best = h; bestLen = k.length; }
    }
    return best;
  }
  function findStations(q) {
    const s = q.toLowerCase();
    return ALL.filter(x => s.includes(x.toLowerCase()) || (x === "RTO Pune" && s.includes("mangalwar")) || (x === "PCMC Bhavan" && /\bpcmc\b/.test(s)))
      .sort((a, b) => s.indexOf(a.toLowerCase()) - s.indexOf(b.toLowerCase()));
  }
  function placeLine(p, center, di, min) {
    const op = openAt(p, di, min), dist = center ? hav(center, [p.lat, p.lng]) : null;
    const hours = (p.h || []).find(x => x.startsWith(DAYS[di] + ":"));
    return `- ${p.n} | ${p.s}${p.loc ? " | " + p.loc : ""}${p.r ? ` | ${p.r}★ (${p.rc} reviews)` : ""}${p.pl ? " | " + "₹".repeat(p.pl) : ""}` +
      `${dist != null ? ` | ${dist < 1000 ? Math.round(dist / 10) * 10 + " m" : (dist / 1000).toFixed(1) + " km"} away` : ""}` +
      ` | nearest metro ${p.st} (${p.ds < 2500 ? walkMin(p.ds) + " min walk" : (p.ds / 1000).toFixed(1) + " km"})` +
      `${op === true ? " | open now" : op === false ? " | closed now" : ""}${hours ? " | today " + hours.slice(hours.indexOf(":") + 2) : ""}`;
  }
  /** Builds a compact, factual context block for the model from the app's own data. */
  function retrieve(data, question, opts = {}) {
    const { places, hubs, bus } = data, q = String(question || "").slice(0, 500);
    const now = opts.now ? new Date(opts.now) : istNow(), di = dayIdx(now), min = now.getHours() * 60 + now.getMinutes();
    const hub = findHub(hubs, q), stations = findStations(q);
    let center = null, label = "";
    if (hub) { center = [hub.lat, hub.lng]; label = `${hub.full} (${hub.t})`; }
    else if (stations.length >= 1) { const st = stations[stations.length - 1]; center = ST[st]; label = `${st} metro station`; }
    let pool = places.slice();
    const catFilters = CATWORDS.filter(([re]) => re.test(q)).map(([, f]) => f);
    const dish = DISHES.find(d => new RegExp("\\b" + d.label.split(/[ &]/)[0].toLowerCase(), "i").test(q) || (d.k !== "cafe" && d.k !== "veg" && d.re.test(q)));
    if (dish) pool = pool.filter(p => matchDish(p, dish));
    else if (catFilters.length) pool = pool.filter(p => catFilters.some(f => f(p)));
    if (/open now|right now|currently open|late night|open late/i.test(q)) pool = pool.filter(p => openAt(p, di, min) !== false);
    if (/cheap|budget|affordable|student/i.test(q)) pool = pool.filter(p => !p.pl || p.pl <= 2);
    let used, widened = false;
    if (center) {
      const withD = pool.map(p => [p, hav(center, [p.lat, p.lng])]);
      used = withD.filter(([, d]) => d <= 2500).sort((a, b) => (score(b[0]) - b[1] / 2500) - (score(a[0]) - a[1] / 2500)).slice(0, stations.length >= 2 && !catFilters.length && !dish ? 8 : 18).map(x => x[0]);
      if (!used.length && withD.length) { widened = true; used = withD.sort((a, b) => a[1] - b[1]).slice(0, 8).map(x => x[0]); }
    }
    else {
      const words = q.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
      const named = places.filter(p => words.some(w => p.n.toLowerCase().includes(w) || (p.loc || "").toLowerCase().includes(w)));
      used = (named.length ? named : pool).sort((a, b) => score(b) - score(a)).slice(0, 18);
    }
    const lines = [];
    lines.push(`Current time in Pune: ${DAYS[di]} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}.`);
    if (hub) {
      const near = ALL.map(s => [hav(center, ST[s]), s]).sort((a, b) => a[0] - b[0])[0];
      lines.push(`LOCATION: ${label}. Nearest metro: ${near[1]} (${(near[0] / 1000).toFixed(1)} km${near[0] < 2500 ? ", about " + walkMin(near[0]) + " min walk" : ""}).`);
    } else if (label) lines.push(`LOCATION: ${label}.`);
    if (stations.length >= 2) {
      const r = route(stations[0], stations[1]);
      if (r && r.hops) lines.push(`METRO ${stations[0]} → ${stations[1]}: ${r.segs.map(s => `${LINES[s.line].name} towards ${s.towards}, ${s.hops} stops to ${s.to}`).join("; then ")}. ${r.hops} stops, about ${rideMin(r)} min, fare about ₹${fare(r.hops)} (30% off for students and at weekends).`);
    }
    if (bus && stations.length) {
      const serving = bus.routes.filter(rt => rt.dirs.some(d => d.stops.some(x => x.toLowerCase().includes(stations[0].split(" ")[0].toLowerCase()))));
      if (serving.length) lines.push(`PMPML routes near ${stations[0]}: ${serving.map(r => r.no + " (" + r.name + ")").join(", ")}.`);
    }
    lines.push(used.length ? (widened ? `PLACES: nothing matching within 2.5 km, so these are the nearest matches elsewhere in Pune (${used.length}):` : `PLACES (${used.length}):`) : "PLACES: none matched in the CityCommute dataset.");
    used.forEach(p => lines.push(placeLine(p, center, di, min)));
    lines.push("FACTS: Metro runs 6 am–11 pm; fares ₹10–₹35; students and everyone at weekends get 30% off; District Court is the only interchange. PMPML fares ₹10/₹20/₹30/₹40 per 5 km slab; daily pass ₹70, monthly ₹1,500.");
    return { context: lines.join("\n"), places: used.map(p => p.id), hub: hub ? hub.id : null, stations };
  }
  const SYSTEM_PROMPT = "You are CityCommute's Pune guide. Answer questions about getting around Pune and about places to eat, have fun, shop and visit. " +
    "Use ONLY the CONTEXT provided with each question for facts about specific places, ratings, hours, fares and routes. If the context does not cover something, say you don't have it and suggest checking Google Maps or the PMPML or Pune Metro apps. " +
    "Never invent places, prices, phone numbers or timings. Keep answers short and practical: up to 6 bullet points, each with the place name in bold, what it is, rating, and how to get there (nearest metro and walking time). " +
    "Mention whether a place is open now when the context says so. Reply in the user's language (English, Hindi or Hinglish).";

  return { ST, LINES, XCHG, ALL, hav, linesOf, walkMin, route, fare, rideMin, busFare, BUS_PASSES, isWeekend, metroQuote, busQuote,
    LIMITS, emptyState, applyAction, DAYS, istNow, dayIdx, parseDay, openAt, score, CAFE, DISHES, matchDish, findHub, findStations, retrieve, SYSTEM_PROMPT };
});
