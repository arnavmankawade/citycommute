// Payment providers. "mock" needs no keys. "razorpay" uses Razorpay's Orders API in test mode
// (set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to rzp_test_ keys). Card or UPI details never touch this server:
// the browser opens Razorpay Checkout, and we only verify the signed result.
const crypto = require("crypto");

function timingSafeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function createProvider(env = process.env, fetchImpl = globalThis.fetch) {
  const keyId = env.RAZORPAY_KEY_ID, secret = env.RAZORPAY_KEY_SECRET;
  if (keyId && secret) {
    if (!/^rzp_test_/.test(keyId) && env.ALLOW_LIVE_PAYMENTS !== "true") throw new Error("Refusing to start with a live Razorpay key. Use rzp_test_ keys, or set ALLOW_LIVE_PAYMENTS=true deliberately.");
    return {
      name: "razorpay",
      publicInfo: () => ({ provider: "razorpay", keyId }),
      async createOrder({ amount, receipt }) {
        const r = await fetchImpl("https://api.razorpay.com/v1/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(keyId + ":" + secret).toString("base64") },
          body: JSON.stringify({ amount: Math.round(amount * 100), currency: "INR", receipt, notes: { app: "citycommute" } })
        });
        const j = await r.json();
        if (!r.ok) throw new Error((j.error && j.error.description) || "Could not create the payment order.");
        return { orderId: j.id, amountPaise: j.amount };
      },
      verify({ orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
        if (!razorpay_payment_id || !razorpay_signature) return false;
        if (razorpay_order_id && razorpay_order_id !== orderId) return false;
        const expected = crypto.createHmac("sha256", secret).update(orderId + "|" + razorpay_payment_id).digest("hex");
        return timingSafeEq(expected, razorpay_signature);
      },
      verifyWebhook(rawBody, signature) {
        const ws = env.RAZORPAY_WEBHOOK_SECRET;
        if (!ws || !signature) return false;
        const expected = crypto.createHmac("sha256", ws).update(rawBody).digest("hex");
        return timingSafeEq(expected, signature);
      }
    };
  }
  return {
    name: "mock",
    publicInfo: () => ({ provider: "mock" }),
    async createOrder({ amount }) { return { orderId: "order_mock_" + crypto.randomBytes(6).toString("hex"), amountPaise: Math.round(amount * 100) }; },
    verify() { return true; },
    verifyWebhook() { return false; }
  };
}
module.exports = { createProvider, timingSafeEq };
