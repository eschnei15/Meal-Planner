// ai.js — optional AI layer. Inert (returns null) unless you set an API key
// as an environment variable on your host. The rest of the app works fully
// without it (rules.js does plain keyword filtering + a built-in
// substitution table) — a key just makes both smarter.
//
// Two providers are supported. Set ONE of these env vars:
//   GEMINI_API_KEY     — Google's Gemini, genuinely free tier, no credit
//                         card required. This is the recommended default.
//   ANTHROPIC_API_KEY  — Claude, paid per-use, only needed if you want it
//                         specifically. If both are set, Gemini is used.

const GEMINI_MODEL = "gemini-2.5-flash-lite"; // free tier, higher rate limit
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

function provider() {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  return null;
}
function enabled() {
  return provider() !== null;
}

async function callGemini(prompt, maxTokens = 500) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 }
    })
  });
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
  return text.trim().replace(/^```json\s*|\s*```$/g, "");
}

async function callClaude(prompt, maxTokens = 500) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).map(b => b.text || "").join("").trim();
  return text.replace(/^```json\s*|\s*```$/g, "");
}

async function callAI(prompt, maxTokens = 500) {
  const p = provider();
  if (p === "gemini") return callGemini(prompt, maxTokens);
  if (p === "claude") return callClaude(prompt, maxTokens);
  throw new Error("No AI provider configured");
}

// Ask the AI to double-check whether a full recipe actually meets the rules.
// Returns { ok:boolean, reason:string } or null if AI is off / call fails.
async function aiCheckMeal({ name, ingredients, instructions, activeRules, allergies, dislikes }) {
  if (!enabled()) return null;
  try {
    const prompt = `You are checking one real recipe against a household's dietary rules before it's served to them. Be strict and literal-minded — this matters for allergies and religious dietary law.
RECIPE: "${name}"
INGREDIENTS: ${ingredients.join(", ")}
INSTRUCTIONS: ${instructions.join(" ")}
ACTIVE DIETARY RULES: ${activeRules.join(", ") || "none"}
ALLERGIES (must never be present): ${allergies || "none"}
DISLIKES (avoid if reasonably possible): ${dislikes || "none"}
Does this recipe, as written, satisfy every rule and avoid every allergen? Consider things a simple keyword scan might miss (e.g. an ingredient name that doesn't literally say "pork" but is pork, or a hidden dairy/meat combination).
Return ONLY JSON: {"ok": true or false, "reason": "one short sentence, empty string if ok"}`;
    const text = await callAI(prompt, 200);
    return JSON.parse(text);
  } catch (e) {
    console.error("aiCheckMeal failed:", e.message);
    return null; // caller should fall back to the keyword check
  }
}

// Ask the AI for smarter, context-aware ingredient substitutes.
// Returns { subs: [{item, note}] } or null if AI is off / call fails.
async function aiSubstitute({ ingredient, recipeName, otherIngredients, activeRules, allergies, dislikes }) {
  if (!enabled()) return null;
  try {
    const prompt = `The person doesn't have "${ingredient}" for the recipe "${recipeName}". Other ingredients in the dish: ${otherIngredients.join(", ")}.
Their dietary rules: ${activeRules.join(", ") || "none"}. Allergies (never suggest): ${allergies || "none"}. Dislikes: ${dislikes || "none"}.
Suggest up to 3 realistic substitutes that obey every rule above. For each, give a short honest note on how it changes flavor or texture, and adjust quantity/method only if truly necessary.
Return ONLY JSON: {"subs":[{"item":"","note":""}]}`;
    const text = await callAI(prompt, 400);
    return JSON.parse(text);
  } catch (e) {
    console.error("aiSubstitute failed:", e.message);
    return null; // caller should fall back to the hardcoded table
  }
}

module.exports = { enabled, aiCheckMeal, aiSubstitute };
