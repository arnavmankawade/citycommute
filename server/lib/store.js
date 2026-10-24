// Tiny JSON-file store for wallets and payment orders.
// Good enough for a prototype; swap for Postgres/Firestore in production (same get/put surface).
const fs = require("fs");
const path = require("path");

class JsonStore {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try { this.data = JSON.parse(fs.readFileSync(file, "utf8")); } catch { this.data = { wallets: {}, orders: {} }; }
    this.data.wallets ||= {}; this.data.orders ||= {};
    this.queue = Promise.resolve();
  }
  getWallet(id) { return this.data.wallets[id] || null; }
  getOrder(id) { return this.data.orders[id] || null; }
  // Serialise writes so concurrent requests can't interleave read-modify-write.
  tx(fn) {
    const run = this.queue.then(() => { const out = fn(this.data); this.flush(); return out; });
    this.queue = run.catch(() => {});
    return run;
  }
  flush() {
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}
module.exports = { JsonStore };
