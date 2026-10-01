const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const { filterByIngredient, filterByArea, randomMeal, lookupMeal } = require("./mealdb");
const { checkMeal, getSubstitutes, PRESET_CHECKS } = require("./rules");
const ai = require("./ai");

const app = express();
app.use(express.json());
app.use(cookieParser());

// --- Optional password gate ---------------------------------------------
// Set the SITE_PASSWORD environment variable on your host to turn this on.
// Leave it unset and the gate disappears entirely — no code change needed
// to remove it later.
const SITE_PASSWORD = process.env.SITE_PASSWORD || null;

app.get("/login", (req, res) => {
  if (!SITE_PASSWORD) return res.redirect("/");
  res.type("html").send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Chef's Table — Sign in</title>
  <style>body{font:16px system-ui,sans-serif;background:#faf6f0;color:#2b2622;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  form{background:#fff;border:1px solid #e6dccf;border-radius:14px;padding:24px;width:90%;max-width:320px}
  input{width:100%;padding:10px;border:1px solid #e6dccf;border-radius:8px;margin:10px 0;box-sizing:border-box}
  button{width:100%;padding:10px;border:0;border-radius:8px;background:#b5482a;color:#fff;font-weight:600}
  p.err{color:#c0392b}</style></head><body>
  <form method="POST" action="/login"><h2>Chef's Table</h2>
  <input type="password" name="password" placeholder="Password" autofocus>
  <button type="submit">Enter</button>
  ${req.query.bad ? '<p class="err">Wrong password, try again.</p>' : ""}
  </form></body></html>`);
});
app.post("/login", express.urlencoded({ extended: false }), (req, res) => {
  if (!SITE_PASSWORD) return res.redirect("/");
  if (req.body.password === SITE_PASSWORD) {
    res.cookie("pw_ok", "yes", { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 30 });
    return res.redirect("/");
  }
  res.redirect("/login?bad=1");
});
app.use((req, res, next) => {
  if (!SITE_PASSWORD) return next(); // gate is off entirely if no password is set
  if (req.path === "/login" || req.cookies.pw_ok === "yes") return next();
  return res.redirect("/login");
});
// --------------------------------------------------------------------------

app.use(express.static(path.join(__dirname, "public")));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const norm = (s) => (s || "").toLowerCase().trim();

function pantryHas(pantryText, ingredientName) {
  const p = norm(pantryText);
  const words = norm(ingredientName).split(/\s+/).filter(w => w.length > 2);
  return words.some(w => p.includes(w));
}

// Try to find one valid meal for a day/slot given profile constraints.
async function findMeal({ pantryItems, activeRules, allergies, dislikes, usedNames, sameDayCategories, maxTime, spiceLevel, skillLevel, equipment, preferAreas = [] }) {
  const candidates = new Map(); // id -> {id,name}
  // Weak "liked cuisine" nudge: try a couple of their favorite cuisines
  // first. This is a soft bias, not a filter — it just means liked-style
  // dishes get tried before the general pool, not that others are excluded.
  for (const area of preferAreas.slice(0, 2)) {
    try {
      const found = await filterByArea(area);
      for (const f of found.slice(0, 5)) candidates.set(f.idMeal, f);
    } catch (e) { /* ignore */ }
  }
  // Pull candidates from a few priority pantry ingredients next (use-soon items float to the front)
  for (const p of pantryItems.slice(0, 3)) {
    try {
      const found = await filterByIngredient(p.replace(/\(use soon\)/i, "").trim());
      for (const f of found.slice(0, 6)) candidates.set(f.idMeal, f);
    } catch (e) { /* ignore a single failed lookup */ }
  }
  // Top up with a few random meals for variety / when pantry is sparse
  for (let i = 0; i < 4 && candidates.size < 10; i++) {
    try {
      const r = await randomMeal();
      if (r) candidates.set(r.idMeal, r);
    } catch (e) { /* ignore */ }
  }

  const tryDetail = async (detail) => {
    if (!detail) return null;
    const ingNames = detail.ingredients.map(i => i.item);
    const instructionsText = (detail.instructions || []).join(" ");
    const check = checkMeal(ingNames, activeRules, allergies, dislikes, {
      maxTime, spiceLevel, skillLevel, equipment, instructionsText, stepsCount: (detail.instructions || []).length
    });
    if (check.violates) return null;
    // If an AI key is set, use it as a smarter second check (catches things
    // a keyword/heuristic scan can miss). If AI is off or the call fails,
    // the free check above is what decides — the recipe still gets served.
    const aiResult = await ai.aiCheckMeal({ name: detail.name, ingredients: ingNames, instructions: detail.instructions, activeRules, allergies, dislikes, maxTime, spiceLevel, skillLevel, equipment });
    if (aiResult && aiResult.ok === false) return null;
    detail.estMinutes = check.estMinutes;
    detail.complexity = check.complexity;
    detail.spiceLevel = check.spiceLevel;
    if (aiResult) detail.aiChecked = true;
    return detail;
  };

  for (const c of candidates.values()) {
    if (usedNames.has(norm(c.strMeal))) continue;
    let detail;
    try { detail = await lookupMeal(c.idMeal); } catch (e) { continue; }
    if (!detail || sameDayCategories.has(detail.category)) continue; // keep the day varied
    const result = await tryDetail(detail);
    if (result) return result;
  }

  // Fallback: a few more random tries, relaxing the same-day-category rule last
  for (let i = 0; i < 6; i++) {
    let r;
    try { r = await randomMeal(); } catch (e) { continue; }
    if (!r || usedNames.has(norm(r.strMeal))) continue;
    let detail;
    try { detail = await lookupMeal(r.idMeal); } catch (e) { continue; }
    const result = await tryDetail(detail);
    if (result) return result;
  }
  return null; // genuinely couldn't find anything that fits
}

function annotateHave(meal, pantryText) {
  return {
    ...meal,
    ingredients: meal.ingredients.map(i => ({ ...i, have: pantryHas(pantryText, i.item) }))
  };
}

app.get("/api/rules", (req, res) => res.json({ presets: PRESET_CHECKS }));

app.post("/api/plan", async (req, res) => {
  try {
    const {
      days = 5,
      mealTypes = ["Lunch", "Dinner"],
      activeRules = [],
      allergies = "",
      dislikes = "",
      pantry = "",
      usedNamesHistory = [],
      batch = false,
      mealModes = {}, // { Lunch: "Packed to go (eaten cold)", Dinner: "At home (eaten fresh)" }
      maxTime = null,       // minutes, or null for no limit
      spiceLevel = "",      // "Mild" | "Medium" | "Hot"
      skillLevel = "",      // "Beginner" | "Intermediate" | "Advanced"
      equipment = [],       // e.g. ["oven","stovetop","blender"]
      preferAreas = []      // weak cuisine-learning hint from liked meals, e.g. ["Italian"]
    } = req.body;

    const pantryItems = pantry.split(/\n|,/).map(s => s.trim()).filter(Boolean)
      .sort((a, b) => /use soon/i.test(b) - /use soon/i.test(a)); // use-soon first
    const usedNames = new Set(usedNamesHistory.map(norm));
    const plan = [];
    let prevDinner = null, leftoverPortionsLeft = 0;

    for (let d = 0; d < Math.min(7, Math.max(1, days)); d++) {
      const sameDayCategories = new Set();
      const meals = [];
      for (const type of mealTypes) {
        const mode = mealModes[type] || "At home (eaten fresh)";
        // Batch reuse: a packed lunch can pull from last night's dinner leftovers
        if (batch && /packed/i.test(mode) && prevDinner && leftoverPortionsLeft > 0) {
          meals.push({
            type, name: `Leftover ${prevDinner.name}`, isLeftover: true,
            category: prevDinner.category, area: prevDinner.area, thumb: prevDinner.thumb,
            mode, ingredients: [],
            instructions: ["Pack and reheat (or eat cold, per your preference) a portion from last night's " + prevDinner.name + "."],
            source: prevDinner.source, id: prevDinner.id
          });
          leftoverPortionsLeft--;
          continue;
        }
        const found = await findMeal({ pantryItems, activeRules, allergies, dislikes, usedNames, sameDayCategories, maxTime, spiceLevel, skillLevel, equipment, preferAreas });
        if (!found) {
          meals.push({ type, name: null, mode, error: "Couldn't find a recipe that fits all your filters right now — try relaxing a filter or check back (TheMealDB's catalog is limited compared to an AI, so very narrow filters can come up empty)." });
          continue;
        }
        usedNames.add(norm(found.name));
        sameDayCategories.add(found.category);
        const withHave = annotateHave(found, pantry);
        const mealObj = { type, mode, isLeftover: false, ...withHave };
        meals.push(mealObj);
        if (/dinner/i.test(type)) { prevDinner = found; if (batch) leftoverPortionsLeft = 1; }
      }
      plan.push({ day: `Day ${d + 1}`, meals });
      await sleep(150); // be polite to the free API
    }
    res.json({ plan });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Something went wrong building the plan. Please try again." });
  }
});

// "Not feeling this" — find one fresh replacement meal for a single slot.
app.post("/api/swap-meal", async (req, res) => {
  try {
    const {
      type = "Dinner", pantry = "", activeRules = [], allergies = "", dislikes = "",
      usedNamesHistory = [], sameDayNames = [], maxTime = null, spiceLevel = "",
      skillLevel = "", equipment = [], preferAreas = []
    } = req.body;

    const pantryItems = pantry.split(/\n|,/).map(s => s.trim()).filter(Boolean)
      .sort((a, b) => /use soon/i.test(b) - /use soon/i.test(a));
    // Exclude both the long-term history AND whatever else is already in this
    // specific day, so the replacement doesn't just duplicate a sibling meal.
    const usedNames = new Set([...usedNamesHistory, ...sameDayNames].map(norm));

    const found = await findMeal({
      pantryItems, activeRules, allergies, dislikes, usedNames,
      sameDayCategories: new Set(), maxTime, spiceLevel, skillLevel, equipment, preferAreas
    });
    if (!found) {
      return res.json({ meal: { type, name: null, error: "Couldn't find a different recipe that fits your filters right now — try again or relax a filter." } });
    }
    const withHave = annotateHave(found, pantry);
    res.json({ meal: { type, isLeftover: false, ...withHave } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Something went wrong finding a replacement. Please try again." });
  }
});

app.post("/api/substitute", express.json(), async (req, res) => {
  const { item = "", recipeName = "", otherIngredients = [], activeRules = [], allergies = "", dislikes = "", excludeTags = [] } = req.body;

  if (ai.enabled()) {
    const aiResult = await ai.aiSubstitute({ ingredient: item, recipeName, otherIngredients, activeRules, allergies, dislikes });
    if (aiResult && aiResult.subs && aiResult.subs.length) {
      return res.json({ subs: aiResult.subs, source: "ai" });
    }
    // AI on but returned nothing useful — fall through to the table below
  }
  const subs = getSubstitutes(item);
  if (!subs) return res.json({ subs: [], note: "No match in our simple substitution list for that ingredient — try a similar item you already have on hand.", source: "table" });
  const filtered = subs.filter(s => !s.tags.some(t => excludeTags.includes(t)));
  res.json({ subs: filtered, source: "table" });
});

app.post("/api/nutrition", async (req, res) => {
  const { name = "", ingredients = [], servings = 4 } = req.body;
  if (!ai.enabled()) {
    return res.json({ available: false, note: "Nutrition estimates need a free Gemini (or Claude) key set — see README Step 5. Without one, there's no nutrition data source wired up." });
  }
  const result = await ai.aiNutrition({ name, ingredients, servings });
  if (!result) return res.json({ available: false, note: "Couldn't generate an estimate right now — try again." });
  res.json({ available: true, ...result });
});

app.get("/api/meal/:id", async (req, res) => {
  try {
    const m = await lookupMeal(req.params.id);
    if (!m) return res.status(404).json({ error: "Not found" });
    res.json(m);
  } catch (e) { res.status(500).json({ error: "Lookup failed" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Chef's Table running on port ${PORT}`));
