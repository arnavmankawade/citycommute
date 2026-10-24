// CityCommute API. Exported as a factory so tests can inject a temp store, env and fetch.
const path = require("path");
const express = require("express");
const CC = require("../shared/core.js");
const { JsonStore } = require("./lib/store");
const { createProvider } = require("./lib/payments");
const { createGemini } = require("./lib/gemini");

const ROOT = path.join(__dirname, "..");
const DATA = {
  places: require(path.join(ROOT, "data/places.json")),
  hubs: require(path.join(ROOT, "data/hubs.json")),
  bus: require(path.join(ROOT, "data/bus.json"))
};
const DEVICE_RE = /^dev-[a-z0-9]{8,40}$/;
const SPEND_ACTIONS = new Set(["buy_metro", "buy_bus", "buy_pass", "remove_ticket"]);

function offlineAnswer(q) {
  const r = CC.retrieve(DATA, q), lines = r.context.split("\n");
  const head = lines.filter(l => /^(LOCATION|METRO|PMPML)/.test(l)).map(l => l.replace(/^(LOCATION|METRO|PMPML routes near [^:]+): ?/, ""));
  const pl = lines.filter(l => l.startsWith("- ")).slice(0, 6).map(l => { const f = l.slice(2).split(" | "); return `- **${f[0]}**: ${f.slice(1, 5).join(", ")}`; });
  return (head.length ? head.join("\n") + "\n" : "") + (pl.length ? "Top picks from CityCommute's data:\n" + pl.join("\n") : "I couldn't find that in CityCommute's data.");
}

function createApp({ env = process.env, storeFile, fetchImpl = globalThis.fetch } = {}) {
  const app = express();
  const store = new JsonStore(storeFile || env.CITYCOMMUTE_DB || path.join(__dirname, ".data", "db.json"));
  const pay = createProvider(env, fetchImpl);
  const gemini = createGemini(env, fetchImpl);
  const hits = new Map(); // simple per-device rate limit for chat

  app.disable("x-powered-by");
  app.use((req, res, next) => { res.set("X-Content-Type-Options", "nosniff"); res.set("Referrer-Policy", "same-origin"); next(); });

  // Razorpay webhook needs the raw body for signature checks, so register it before express.json().
  app.post("/api/payments/webhook", express.raw({ type: "application/json", limit: "100kb" }), async (req, res) => {
    if (!pay.verifyWebhook(req.body, req.get("X-Razorpay-Signature"))) return res.status(400).json({ error: "Bad signature." });
    let evt; try { evt = JSON.parse(req.body.toString("utf8")); } catch { return res.status(400).json({ error: "Bad JSON." }); }
    const ent = evt.payload && evt.payload.payment && evt.payload.payment.entity;
    if (evt.event === "payment.captured" && ent && ent.order_id) await creditOrder(ent.order_id, { paymentId: ent.id, method: ent.method || "Razorpay" }).catch(() => {});
    res.json({ ok: true });
  });

  app.use(express.json({ limit: "64kb" }));
  const device = (req, res, next) => {
    const id = req.get("X-Device-Id");
    if (!DEVICE_RE.test(id || "")) return res.status(400).json({ error: "Missing or invalid device id." });
    req.deviceId = id; next();
  };

  app.get("/api/health", (req, res) => res.json({ service: "citycommute", version: 1, payments: pay.name, chat: gemini ? "gemini" : "offline", model: gemini ? gemini.model : null, places: DATA.places.length, hubs: DATA.hubs.length }));

  app.get("/api/wallet", device, (req, res) => res.json({ state: store.getWallet(req.deviceId) || CC.emptyState() }));

  app.post("/api/wallet/:action", device, async (req, res) => {
    const action = req.params.action;
    if (!SPEND_ACTIONS.has(action)) return res.status(400).json({ error: "Money can only be added through a verified payment." });
    try {
      const out = await store.tx(db => {
        const { state, result } = CC.applyAction(db.wallets[req.deviceId] || CC.emptyState(), action, req.body || {});
        db.wallets[req.deviceId] = state; return { state, result };
      });
      res.json(out);
    } catch (e) { res.status(e.code === "insufficient_funds" ? 402 : 400).json({ error: e.message, code: e.code || "bad_request", shortfall: e.shortfall }); }
  });

  app.post("/api/payments/order", device, async (req, res) => {
    const amount = Math.round(Number(req.body && req.body.amount));
    if (!(amount >= 10 && amount <= CC.LIMITS.maxTopup)) return res.status(400).json({ error: `Top up between ₹10 and ₹${CC.LIMITS.maxTopup}.` });
    const cur = store.getWallet(req.deviceId) || CC.emptyState();
    if (cur.balance + amount > CC.LIMITS.maxBalance) return res.status(400).json({ error: `Wallet balance can't go over ₹${CC.LIMITS.maxBalance}.` });
    try {
      const o = await pay.createOrder({ amount, receipt: "cc_" + Date.now() });
      await store.tx(db => { db.orders[o.orderId] = { device: req.deviceId, amount, status: "created", method: String(req.body.method || "UPI").slice(0, 20), createdAt: new Date().toISOString() }; });
      res.json(Object.assign({ orderId: o.orderId, amount: o.amountPaise, currency: "INR" }, pay.publicInfo()));
    } catch (e) { res.status(502).json({ error: e.message }); }
  });

  async function creditOrder(orderId, { paymentId, method }) {
    return store.tx(db => {
      const o = db.orders[orderId];
      if (!o) { const e = new Error("Unknown payment order."); e.status = 404; throw e; }
      if (o.status === "paid") return { state: db.wallets[o.device] || CC.emptyState(), result: { alreadyPaid: true } }; // idempotent
      const { state, result } = CC.applyAction(db.wallets[o.device] || CC.emptyState(), "topup", { amount: o.amount, method: method || o.method, provider: pay.name, paymentRef: paymentId || orderId });
      db.wallets[o.device] = state; o.status = "paid"; o.paidAt = new Date().toISOString(); o.paymentId = paymentId || null;
      return { state, result };
    });
  }

  app.post("/api/payments/verify", device, async (req, res) => {
    const b = req.body || {}, o = store.getOrder(b.orderId);
    if (!o || o.device !== req.deviceId) return res.status(404).json({ error: "Unknown payment order." });
    if (!pay.verify(b)) return res.status(400).json({ error: "Payment could not be verified." });
    try { res.json(await creditOrder(b.orderId, { paymentId: b.razorpay_payment_id, method: b.method })); }
    catch (e) { res.status(e.status || 400).json({ error: e.message }); }
  });

  app.get("/api/search", (req, res) => {
    const q = String(req.query.q || "").toLowerCase().trim();
    if (q.length < 2) return res.json({ hubs: [], places: [] });
    const hubs = DATA.hubs.filter(h => [h.n, h.full, ...h.a].some(a => a.toLowerCase().includes(q))).slice(0, 8);
    const places = DATA.places.filter(p => (p.n + " " + p.s + " " + (p.loc || "")).toLowerCase().includes(q)).sort((a, b) => CC.score(b) - CC.score(a)).slice(0, 20);
    res.json({ hubs, places });
  });

  app.get("/api/nearby", (req, res) => {
    const hub = DATA.hubs.find(h => h.id === req.query.hub);
    const center = hub ? [hub.lat, hub.lng] : CC.ST[req.query.station] || null;
    if (!center) return res.status(400).json({ error: "Pass ?hub=<id> or ?station=<name>." });
    const rad = Math.min(5000, Math.max(200, Number(req.query.radius) || 1500)), cat = req.query.cat;
    const list = DATA.places.map(p => Object.assign({ dist: Math.round(CC.hav(center, [p.lat, p.lng])) }, p)).filter(p => p.dist <= rad && (!cat || p.c === cat))
      .sort((a, b) => CC.score(b) - CC.score(a)).slice(0, 60);
    res.json({ center, radius: rad, count: list.length, places: list });
  });

  app.post("/api/chat", device, async (req, res) => {
    const now = Date.now(), h = (hits.get(req.deviceId) || []).filter(t => now - t < 60000);
    if (h.length >= 12) return res.status(429).json({ error: "Too many questions in a minute. Try again shortly." });
    h.push(now); hits.set(req.deviceId, h);
    const msgs = Array.isArray(req.body && req.body.messages) ? req.body.messages.slice(-9) : [];
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== "user" || !String(last.content || "").trim()) return res.status(400).json({ error: "Send a question." });
    const q = String(last.content).slice(0, 500), ret = CC.retrieve(DATA, q);
    if (!gemini) return res.json({ reply: offlineAnswer(q), engine: "offline", hub: ret.hub });
    try {
      const reply = await gemini.ask({ system: CC.SYSTEM_PROMPT, history: msgs.slice(0, -1), question: q, context: ret.context });
      res.json({ reply, engine: "gemini", model: gemini.model, hub: ret.hub });
    } catch (e) {
      res.json({ reply: offlineAnswer(q) + "\n\n(Gemini isn't reachable right now, so this answer comes straight from CityCommute's data.)", engine: "offline", hub: ret.hub, warning: e.message });
    }
  });

  app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));
  // Never serve the server's own code, data or env files as static content.
  app.use((req, res, next) => /^\/(server|node_modules|\.git|\.env)(\/|$)/i.test(decodeURIComponent(req.path)) ? res.status(404).end() : next());
  app.use(express.static(ROOT, { index: "index.html", extensions: ["html"], dotfiles: "ignore" }));
  app.use((err, req, res, next) => { res.status(err.status || 500).json({ error: err.type === "entity.too.large" ? "Request too large." : "Server error." }); });
  return app;
}
module.exports = { createApp, offlineAnswer };
