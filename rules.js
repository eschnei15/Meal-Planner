// rules.js — plain-code (no AI) keyword filtering for dietary rules & allergies,
// plus a small hardcoded ingredient-substitution table.
// This is a best-effort keyword scan, NOT a certified dietary check.

const PORK = ["pork", "bacon", "ham", "lard", "prosciutto", "pancetta", "chorizo", "sausage"];
const SHELLFISH = ["shrimp", "prawn", "crab", "lobster", "clam", "mussel", "oyster", "scallop", "squid", "octopus"];
const MEAT = ["beef", "chicken", "pork", "lamb", "turkey", "duck", "veal", "bacon", "ham", "sausage", "mince", "steak", "meatball", "goat"];
const FISH = ["fish", "salmon", "tuna", "cod", "tilapia", "anchovy", "sardine", "trout", "halibut", "mackerel"];
const DAIRY = ["milk", "cheese", "butter", "cream", "yog", "ghee", "paneer", "mascarpone", "ricotta", "mozzarella", "parmesan", "buttermilk"];
const EGG = ["egg"];
const GLUTEN = ["flour", "bread", "pasta", "noodle", "breadcrumb", "soy sauce", "barley", "wheat", "spaghetti", "macaroni", "couscous", "tortilla", "bun", "pastry"];
const ALCOHOL = ["wine", "beer", "rum", "vodka", "whisk", "brandy", "sherry", "liqueur"];

// Preset rule -> a check function(ingredientNames[]) -> true if VIOLATES the rule
const PRESET_CHECKS = {
  "Kosher": (ings) => {
    const has = (list) => ings.some(i => list.some(k => i.includes(k)));
    if (has(PORK) || has(SHELLFISH)) return true;
    // crude meat+dairy same-dish check
    if (has(MEAT) && has(DAIRY)) return true;
    return false;
  },
  "Halal": (ings) => {
    const has = (list) => ings.some(i => list.some(k => i.includes(k)));
    return has(PORK) || has(ALCOHOL);
  },
  "Vegetarian": (ings) => {
    const has = (list) => ings.some(i => list.some(k => i.includes(k)));
    return has(MEAT) || has(FISH) || has(SHELLFISH);
  },
  "Vegan": (ings) => {
    const has = (list) => ings.some(i => list.some(k => i.includes(k)));
    return has(MEAT) || has(FISH) || has(SHELLFISH) || has(DAIRY) || has(EGG) || ings.some(i => i.includes("honey"));
  },
  "Gluten-free": (ings) => {
    const has = (list) => ings.some(i => list.some(k => i.includes(k)));
    return has(GLUTEN);
  },
  "Dairy-free": (ings) => {
    const has = (list) => ings.some(i => list.some(k => i.includes(k)));
    return has(DAIRY);
  }
};

// Decide if a meal (array of lowercase ingredient names) violates ANY active rule,
// any user allergy, or any user dislike. Returns { violates:boolean, reasons:[] }
function checkMeal(ingredientNames, activeRuleLabels, allergyText, dislikeText) {
  const ings = ingredientNames.map(s => s.toLowerCase());
  const reasons = [];

  for (const label of activeRuleLabels) {
    if (PRESET_CHECKS[label] && PRESET_CHECKS[label](ings)) reasons.push(`violates ${label}`);
  }
  const custom = (text) => (text || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  for (const a of custom(allergyText)) {
    if (ings.some(i => i.includes(a))) reasons.push(`contains allergen "${a}"`);
  }
  for (const d of custom(dislikeText)) {
    if (ings.some(i => i.includes(d))) reasons.push(`contains disliked item "${d}"`);
  }
  return { violates: reasons.length > 0, reasons };
}

// Small hardcoded substitution table. Each entry: tags describe what the substitute IS,
// so the server can filter out any substitute that would itself violate the person's rules.
const SUBS = {
  "butter": [{ item: "olive oil", note: "Use about 3/4 the amount. Loses richness, adds a savory, fruitier note.", tags: [] },
             { item: "margarine (dairy-free)", note: "Closest 1:1 swap for baking texture.", tags: [] }],
  "milk": [{ item: "unsweetened almond milk", note: "1:1 swap; slightly thinner, nutty undertone.", tags: [] },
           { item: "oat milk", note: "1:1 swap; creamier than almond, very mild flavor.", tags: [] }],
  "cream": [{ item: "full-fat coconut milk", note: "1:1; adds a faint coconut note, works well in curries and soups.", tags: [] }],
  "cheese": [{ item: "nutritional yeast", note: "Use sparingly for a cheesy, umami note — not a melt substitute.", tags: [] },
             { item: "dairy-free cheese shreds", note: "Closest melt/texture match, milder flavor.", tags: [] }],
  "yogurt": [{ item: "coconut yogurt", note: "1:1; tangy, slightly sweeter.", tags: [] }],
  "buttermilk": [{ item: "lemon juice + plant milk", note: "1 tbsp lemon juice + 1 cup plant milk, rest 5 min.", tags: [] }],
  "chicken": [{ item: "chickpeas", note: "Use the same weight; milder, denser bite, absorbs sauce well.", tags: ["meat-free"] },
              { item: "firm tofu, cubed", note: "Press well first; neutral flavor, takes on marinade.", tags: ["meat-free"] }],
  "beef": [{ item: "mushrooms, chopped", note: "Cremini or portobello; deep umami, meaty chew.", tags: ["meat-free"] },
           { item: "lentils", note: "Great in anything ground-beef-style like chili or bolognese.", tags: ["meat-free"] }],
  "pork": [{ item: "chicken thighs", note: "Similar richness, shorter cook time.", tags: ["meat"] },
           { item: "jackfruit", note: "Shreds like pulled pork; needs extra seasoning.", tags: ["meat-free"] }],
  "shrimp": [{ item: "white fish, cubed", note: "Cook slightly less time; milder flavor.", tags: ["fish"] },
             { item: "king oyster mushrooms, sliced", note: "Surprisingly similar bite when seared.", tags: ["meat-free"] }],
  "bacon": [{ item: "smoked paprika + olive oil", note: "Won't replace texture, but brings the smoky note.", tags: [] }],
  "egg": [{ item: "1 tbsp ground flaxseed + 3 tbsp water (per egg)", note: "Works for baking, not for scrambles.", tags: ["vegan"] },
          { item: "1/4 cup unsweetened applesauce (per egg)", note: "Best in sweet baked goods.", tags: ["vegan"] }],
  "flour": [{ item: "1:1 gluten-free flour blend", note: "Best straight swap for most baking.", tags: ["gluten-free"] },
            { item: "almond flour", note: "Denser, moister result; use ~25% less liquid.", tags: ["gluten-free"] }],
  "breadcrumbs": [{ item: "crushed crackers or cornflakes", note: "Similar crunch for coatings.", tags: [] },
                  { item: "rolled oats, pulsed", note: "Works for meatballs/meatloaf binding.", tags: [] }],
  "pasta": [{ item: "zucchini noodles", note: "Much lighter, cooks in minutes, won't hold heavy sauce as well.", tags: ["gluten-free"] },
            { item: "rice", note: "Swap the format entirely — great under a saucy dish.", tags: ["gluten-free"] }],
  "soy sauce": [{ item: "coconut aminos", note: "1:1, slightly sweeter, gluten-free.", tags: ["gluten-free"] },
                { item: "tamari", note: "1:1, usually gluten-free — check the label.", tags: ["gluten-free"] }],
  "wine": [{ item: "grape juice + 1 tsp vinegar", note: "Mimics acidity and sweetness without alcohol.", tags: ["no-alcohol"] },
           { item: "broth", note: "Neutral option, loses the acidity wine brings.", tags: ["no-alcohol"] }],
  "onion": [{ item: "1 tsp onion powder (per onion)", note: "No texture, but carries the flavor.", tags: [] },
            { item: "leek, chopped", note: "Milder, slightly sweeter.", tags: [] }],
  "garlic": [{ item: "1/4 tsp garlic powder (per clove)", note: "No texture, milder flavor.", tags: [] }],
  "lemon": [{ item: "lime", note: "1:1, slightly more floral/tart.", tags: [] },
            { item: "white vinegar, a splash", note: "Just for the acidity, not the flavor.", tags: [] }],
  "cilantro": [{ item: "parsley", note: "Similar fresh, green note without the soapy-to-some flavor.", tags: [] }],
};

function getSubstitutes(ingredientName) {
  const key = Object.keys(SUBS).find(k => ingredientName.toLowerCase().includes(k));
  return key ? SUBS[key] : null;
}

module.exports = { checkMeal, getSubstitutes, PRESET_CHECKS: Object.keys(PRESET_CHECKS) };
