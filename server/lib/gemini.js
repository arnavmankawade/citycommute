// Gemini client for the Ask CityCommute assistant. Uses the REST generateContent endpoint,
// so there's no SDK dependency. Set GEMINI_API_KEY (and optionally GEMINI_MODEL).
function createGemini(env = process.env, fetchImpl = globalThis.fetch) {
  const key = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL || "gemini-2.5-flash";
  if (!key) return null;
  return {
    model,
    async ask({ system, history, question, context }) {
      const contents = [];
      for (const m of history || []) {
        if (!m || !m.content) continue;
        const role = m.role === "assistant" ? "model" : "user";
        if (!contents.length && role !== "user") continue;
        const last = contents[contents.length - 1];
        if (last && last.role === role) last.parts[0].text += "\n" + m.content; else contents.push({ role, parts: [{ text: String(m.content).slice(0, 2000) }] });
      }
      const final = `CONTEXT:\n${context}\n\nQUESTION: ${question}`;
      if (contents.length && contents[contents.length - 1].role === "user") contents[contents.length - 1].parts[0].text += "\n\n" + final;
      else contents.push({ role: "user", parts: [{ text: final }] });
      const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.4, maxOutputTokens: 800 } })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j.error && j.error.message) || `Gemini request failed (${r.status}).`);
      const text = (((j.candidates || [])[0] || {}).content || {}).parts?.map(p => p.text || "").join("").trim();
      if (!text) throw new Error("Gemini returned an empty answer.");
      return text;
    }
  };
}
module.exports = { createGemini };
