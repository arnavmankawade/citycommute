// Start the CityCommute server: serves the site and the /api endpoints.
//   cd server && npm install && npm start      →  http://localhost:3000
// Optional env (see ../.env.example): GEMINI_API_KEY, GEMINI_MODEL, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, PORT
const fs = require("fs");
const path = require("path");

// Minimal .env loader (no dependency): KEY=value lines in ../.env
const envFile = path.join(__dirname, "..", ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const { createApp } = require("./app");
const port = Number(process.env.PORT) || 3000;
const app = createApp();
app.listen(port, () => {
  console.log(`CityCommute running at http://localhost:${port}`);
  console.log(`  payments: ${process.env.RAZORPAY_KEY_ID ? "Razorpay (test mode)" : "mock (no keys set)"}`);
  console.log(`  assistant: ${process.env.GEMINI_API_KEY ? "Gemini (" + (process.env.GEMINI_MODEL || "gemini-2.5-flash") + ")" : "offline answers (set GEMINI_API_KEY for Gemini)"}`);
});
