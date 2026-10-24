const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const { createApp } = require("../app");

const DEV = "dev-testdevice123";
function start(env = {}, fetchImpl) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cc-")), "db.json");
  const app = createApp({ env, storeFile: file, fetchImpl });
  return new Promise(res => { const srv = app.listen(0, () => res({ srv, base: `http://127.0.0.1:${srv.address().port}` })); });
}
const call = (base, method, p, body, dev = DEV, headers = {}) =>
  fetch(base + p, { method, headers: Object.assign({ "Content-Type": "application/json", "X-Device-Id": dev }, headers), body: body ? JSON.stringify(body) : undefined })
    .then(async r => ({ status: r.status, json: await r.json().catch(() => null) }));

let S;
before(async () => { S = await start({}); });
after(() => S.srv.close());

test("health reports mock payments and offline chat with no keys", async () => {
  const r = await call(S.base, "GET", "/api/health");
  assert.equal(r.json.service, "citycommute");
  assert.equal(r.json.payments, "mock");
  assert.equal(r.json.chat, "offline");
  assert.ok(r.json.places > 500);
});

test("wallet starts empty and rejects bad device ids", async () => {
  assert.equal((await call(S.base, "GET", "/api/wallet")).json.state.balance, 0);
  assert.equal((await call(S.base, "GET", "/api/wallet", null, "nope")).status, 400);
});

test("money can't be added without a verified payment", async () => {
  const r = await call(S.base, "POST", "/api/wallet/topup", { amount: 500 });
  assert.equal(r.status, 400);
});

test("buying with no balance returns 402 with the shortfall", async () => {
  const r = await call(S.base, "POST", "/api/wallet/buy_metro", { from: "Vanaz", to: "Swargate", pax: 1, legs: 1, date: "2026-10-26" });
  assert.equal(r.status, 402);
  assert.equal(r.json.code, "insufficient_funds");
  assert.equal(r.json.shortfall, 25);
});

test("mock top-up then metro, bus and pass purchases", async () => {
  const o = await call(S.base, "POST", "/api/payments/order", { amount: 300, method: "UPI" });
  assert.equal(o.json.provider, "mock");
  const v = await call(S.base, "POST", "/api/payments/verify", { orderId: o.json.orderId, provider: "mock" });
  assert.equal(v.json.state.balance, 300);
  const again = await call(S.base, "POST", "/api/payments/verify", { orderId: o.json.orderId, provider: "mock" });
  assert.equal(again.json.state.balance, 300, "verifying twice must not credit twice");
  const m = await call(S.base, "POST", "/api/wallet/buy_metro", { from: "Vanaz", to: "Swargate", pax: 2, legs: 1, date: "2026-10-26" });
  assert.equal(m.json.result.ticket.total, 50);
  const b = await call(S.base, "POST", "/api/wallet/buy_bus", { route: "199", fromStop: "Vanaz Corner", toStop: "Deccan Corner", km: 4.2, pax: 1 });
  assert.equal(b.json.result.ticket.total, 10);
  const p = await call(S.base, "POST", "/api/wallet/buy_pass", { type: "daily", date: "2026-10-26" });
  assert.equal(p.json.state.balance, 300 - 50 - 10 - 70);
  assert.equal(p.json.state.tickets.length, 3);
});

test("another device can't verify someone else's order", async () => {
  const o = await call(S.base, "POST", "/api/payments/order", { amount: 100 });
  const v = await call(S.base, "POST", "/api/payments/verify", { orderId: o.json.orderId }, "dev-otherdevice99");
  assert.equal(v.status, 404);
});

test("top-up limits are enforced", async () => {
  assert.equal((await call(S.base, "POST", "/api/payments/order", { amount: 5 })).status, 400);
  assert.equal((await call(S.base, "POST", "/api/payments/order", { amount: 9000 })).status, 400);
});

test("chat answers from data when Gemini isn't configured", async () => {
  const r = await call(S.base, "POST", "/api/chat", { messages: [{ role: "user", content: "cafes near mitwpu" }] });
  assert.equal(r.json.engine, "offline");
  assert.equal(r.json.hub, "mitwpu");
  assert.match(r.json.reply, /Anand Nagar/);
});

test("nearby and search endpoints", async () => {
  const n = await call(S.base, "GET", "/api/nearby?hub=coep&cat=eat");
  assert.ok(n.json.count > 5 && n.json.places.every(p => p.c === "eat"));
  const s = await call(S.base, "GET", "/api/search?q=hinjewadi");
  assert.equal(s.json.hubs[0].id, "hinjewadi");
});

test("server files are not served as static content", async () => {
  for (const p of ["/server/app.js", "/server/.data/db.json", "/.env"]) assert.equal((await fetch(S.base + p)).status, 404, p);
  assert.equal((await fetch(S.base + "/shared/core.js")).status, 200);
});

test("chat uses Gemini when a key is set, with grounded context", async () => {
  let sent;
  const fakeFetch = async (url, opts) => { sent = { url, opts }; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Try **Rainbow Fizz Cafe**." }] } }] }), { status: 200 }); };
  const G = await start({ GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-2.5-flash" }, fakeFetch);
  const r = await call(G.base, "POST", "/api/chat", { messages: [{ role: "user", content: "cafes near mitwpu" }] });
  G.srv.close();
  assert.equal(r.json.engine, "gemini");
  assert.match(r.json.reply, /Rainbow Fizz/);
  assert.match(sent.url, /gemini-2\.5-flash:generateContent$/);
  assert.equal(sent.opts.headers["x-goog-api-key"], "test-key");
  const body = JSON.parse(sent.opts.body);
  assert.match(body.systemInstruction.parts[0].text, /Pune guide/);
  assert.match(body.contents.at(-1).parts[0].text, /CONTEXT:[\s\S]*MIT World Peace University/);
});

test("Razorpay: order via API, signature verified, live keys refused", async () => {
  const secret = "test_secret_abc";
  const fakeFetch = async (url, opts) => {
    assert.equal(url, "https://api.razorpay.com/v1/orders");
    assert.equal(JSON.parse(opts.body).amount, 20000);
    return new Response(JSON.stringify({ id: "order_RZP123", amount: 20000 }), { status: 200 });
  };
  const R = await start({ RAZORPAY_KEY_ID: "rzp_test_KEY", RAZORPAY_KEY_SECRET: secret }, fakeFetch);
  const o = await call(R.base, "POST", "/api/payments/order", { amount: 200 });
  assert.equal(o.json.provider, "razorpay"); assert.equal(o.json.keyId, "rzp_test_KEY");
  const bad = await call(R.base, "POST", "/api/payments/verify", { orderId: "order_RZP123", razorpay_payment_id: "pay_1", razorpay_signature: "deadbeef" });
  assert.equal(bad.status, 400);
  const sig = crypto.createHmac("sha256", secret).update("order_RZP123|pay_1").digest("hex");
  const good = await call(R.base, "POST", "/api/payments/verify", { orderId: "order_RZP123", razorpay_order_id: "order_RZP123", razorpay_payment_id: "pay_1", razorpay_signature: sig });
  assert.equal(good.json.state.balance, 200);
  R.srv.close();
  assert.throws(() => createApp({ env: { RAZORPAY_KEY_ID: "rzp_live_X", RAZORPAY_KEY_SECRET: "s" }, storeFile: path.join(os.tmpdir(), "x.json") }), /live Razorpay key/);
});

test("Razorpay webhook credits once with a valid signature", async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ id: "order_W1", amount: 10000 }), { status: 200 });
  const W = await start({ RAZORPAY_KEY_ID: "rzp_test_K", RAZORPAY_KEY_SECRET: "s1", RAZORPAY_WEBHOOK_SECRET: "wh" }, fakeFetch);
  await call(W.base, "POST", "/api/payments/order", { amount: 100 });
  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_W", order_id: "order_W1", method: "upi" } } } });
  const sig = crypto.createHmac("sha256", "wh").update(body).digest("hex");
  const post = s => fetch(W.base + "/api/payments/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-Razorpay-Signature": s }, body });
  assert.equal((await post("bad")).status, 400);
  assert.equal((await post(sig)).status, 200);
  await post(sig);
  const w = await call(W.base, "GET", "/api/wallet");
  W.srv.close();
  assert.equal(w.json.state.balance, 100);
});
