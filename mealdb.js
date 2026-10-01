// mealdb.js — thin wrapper around TheMealDB's free public API.
// Uses the shared free test key "1". You can request your own free/patron key
// later at themealdb.com/api.php and swap it in via the MEALDB_KEY env var.

const KEY = process.env.MEALDB_KEY || "1";
const BASE = `https://www.themealdb.com/api/json/v1/${KEY}`;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TheMealDB request failed: ${res.status}`);
  return res.json();
}

// Search meals whose ingredient list includes this single ingredient
async function filterByIngredient(ingredient) {
  const data = await getJson(`${BASE}/filter.php?i=${encodeURIComponent(ingredient)}`);
  return data.meals || [];
}

async function randomMeal() {
  const data = await getJson(`${BASE}/random.php`);
  return (data.meals || [])[0] || null;
}

// Full recipe detail by id, normalized into { id, name, area, category, thumb,
// instructions, ingredients: [{item, measure}] }
async function lookupMeal(id) {
  const data = await getJson(`${BASE}/lookup.php?i=${encodeURIComponent(id)}`);
  const m = (data.meals || [])[0];
  if (!m) return null;
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const item = (m[`strIngredient${i}`] || "").trim();
    const measure = (m[`strMeasure${i}`] || "").trim();
    if (item) ingredients.push({ item, measure });
  }
  return {
    id: m.idMeal,
    name: m.strMeal,
    area: m.strArea,
    category: m.strCategory,
    thumb: m.strMealThumb,
    instructions: (m.strInstructions || "").split(/\r?\n+/).map(s => s.trim()).filter(Boolean),
    ingredients,
    source: m.strSource || m.strYoutube || null
  };
}

module.exports = { filterByIngredient, randomMeal, lookupMeal };
