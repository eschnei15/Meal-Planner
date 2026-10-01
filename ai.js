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
async function aiCheckMeal({ name, ingredients, instructions, activeRules, allergies, dislikes, maxTime, spiceLevel, skillLevel, equipment }) {
  if (!enabled()) return null;
  try {
    const prompt = `You are checking one real recipe against a household's requirements before it's served to them. Be strict and literal-minded about allergies and dietary law; be reasonable (not overly strict) about time/spice/skill/equipment, since those are preferences, not safety rules.
RECIPE: "${name}"
INGREDIENTS: ${ingredients.join(", ")}
INSTRUCTIONS: ${instructions.join(" ")}
ACTIVE DIETARY RULES: ${activeRules.join(", ") || "none"}
ALLERGIES (must never be present): ${allergies || "none"}
DISLIKES (avoid if reasonably possible): ${dislikes || "none"}
Max time they have per meal: ${maxTime ? maxTime + " minutes" : "no limit given"}
Spice tolerance: ${spiceLevel || "no preference given"}
Their cooking skill level: ${skillLevel || "no preference given"} (don't exclude a recipe just for being simple, only if it's clearly too advanced)
Kitchen equipment they have: ${equipment && equipment.length ? equipment.join(", ") : "not specified — assume a normal kitchen (stove, oven, basic pots/pans) is fine"}
Does this recipe, as actually written, satisfy every dietary rule, avoid every allergen, and reasonably fit the time/spice/skill/equipment constraints? Consider things a simple keyword scan might miss (e.g. an ingredient that doesn't literally say "pork" but is pork, a hidden dairy/meat combination, or a step requiring a specific appliance).
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

// Rough nutrition estimate for a full recipe. Returns
// { calories, protein, carbs, fat, perServing, note } or null if AI is off
// or the call fails. This is explicitly an AI estimate, not a lookup against
// a verified nutrition database — the caller/UI should label it as such.
async function aiNutrition({ name, ingredients, servings = 4 }) {
  if (!enabled()) return null;
  try {
    const prompt = `Estimate the nutrition for this recipe, assuming it serves ${servings} people total.
RECIPE: "${name}"
INGREDIENTS: ${ingredients.map(i => `${i.measure || ""} ${i.item}`).join(", ")}
Give your best realistic estimate PER SERVING (not for the whole pot). Round to sensible whole numbers.
Return ONLY JSON: {"calories": number, "protein": number, "carbs": number, "fat": number}`;
    const text = await callAI(prompt, 150);
    const data = JSON.parse(text);
    return { ...data, servings, note: "AI estimate, not a verified nutrition-database lookup — use as a rough guide only." };
  } catch (e) {
    console.error("aiNutrition failed:", e.message);
    return null;
  }
}

module.exports = { enabled, aiCheckMeal, aiSubstitute, aiNutrition };
