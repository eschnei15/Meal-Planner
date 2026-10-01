# Chef's Table — Setup & Deployment Guide

A free, independent weekly meal planner. No AI, no API key, no monthly cost.
It pulls real recipes from TheMealDB (a free public recipe database) and applies
your dietary rules, allergies, dislikes and pantry in plain code.

**Important honesty note:** dietary filtering (kosher, halal, vegan, etc.) works by
scanning each recipe's ingredient list for keywords (no pork, no shellfish, no
obvious meat+dairy combos, etc.). It is a best-effort filter, not a certified
kosher/halal check — always verify labels and hechsher yourself.

---

## What you're setting up

- **No local software required.** You don't need to install Node.js, Git, or
  anything else on your computer — everything below happens in a web browser.
- Two free accounts: **GitHub** (to hold the code) and **Render** (to run it).
- Total time: about 15–20 minutes.

---

## Step 1 — Create a GitHub account (skip if you have one)

1. Go to https://github.com/join and sign up (free).
2. Confirm your email.

## Step 2 — Create a new repository and upload the code

1. Click the **+** in the top right of GitHub → **New repository**.
2. Name it `chefs-table` (or anything you like). Leave it **Public** or
   **Private**, either works. Click **Create repository**.
3. On the new (empty) repo page, click **uploading an existing file**.
4. Drag in every file and folder from the project I gave you
   (`server.js`, `rules.js`, `mealdb.js`, `package.json`, `README.md`, and the
   `public` folder with `index.html` inside it) — keep the same folder
   structure, don't flatten it.
5. Scroll down, click **Commit changes**.

## Step 3 — Create a Render account and deploy

1. Go to https://render.com and sign up (free) — "Sign up with GitHub" is the
   fastest option and links the two automatically.
2. From the Render dashboard, click **New +** → **Web Service**.
3. Choose **Build and deploy from a Git repository**, then select the
   `chefs-table` repo you just created (you may need to click "Configure
   account" to grant Render access to it first).
4. Fill in:
   - **Name:** `chefs-table` (or anything)
   - **Region:** whichever is closest to you
   - **Branch:** `main`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
5. Click **Create Web Service**.
6. Render will build and deploy automatically — this takes 2–5 minutes. You'll
   see live logs. When it says "Live" at the top, you're done.
7. Your site is now at the URL Render shows you, something like
   `https://chefs-table.onrender.com`. Open it — that's your app, live on the
   internet, for free, independent of Claude entirely.

**One free-tier quirk to know:** Render's free web services "spin down" after
15 minutes of no traffic and take 30-60 seconds to "wake up" on the next visit.
That's normal for the free tier — the app isn't broken, it's just waking up.

## Step 4 — Turn on the password gate (recommended while testing)

The site is public to anyone with the link by default. To require a password:

1. In Render, go to your service → **Environment** → **Add Environment
   Variable**.
2. Key: `SITE_PASSWORD`  Value: `ESchneier15` (or change it to anything you
   like — just update it here).
3. Save. Render redeploys automatically. Now every visitor is sent to a
   simple login page first.

**To remove the password later:** delete that environment variable (or just
clear its value) and redeploy — no code changes needed, the gate disables
itself automatically when the variable isn't set.

⚠️ This is a simple shared-password gate for keeping casual visitors out
while you're testing, not bank-grade security — don't put anything truly
sensitive behind it.

## Step 5 — (Optional) Turn on AI for smarter filtering & substitutions — free option

Without this, the app still works fully — dietary filtering uses a plain
keyword scan, and substitutions come from a small built-in list. Adding an AI
key makes both noticeably smarter: it reads each full recipe (ingredients +
instructions) to catch things a keyword scan would miss, and it gives
substitution suggestions tailored to that specific dish instead of a generic
list.

**Recommended: Google Gemini, genuinely free, no credit card.**

1. Go to https://aistudio.google.com and sign in with any Google account.
2. Click **Get API key** → **Create API key**. No billing setup needed for
   the free tier.
3. Copy the key.
4. In Render, go to your service → **Environment** → **Add Environment
   Variable**: key `GEMINI_API_KEY`, value = the key you just copied.
5. Save. Render redeploys automatically.

That's it — no cost, nothing to monitor. Google's free tier does have a rate
limit (currently in the ballpark of several hundred requests per day,
enforced per-minute too), which is comfortably more than a personal weekly
meal plan needs. If you ever hit it, the app automatically falls back to the
free keyword-based logic for that request rather than breaking — you'd just
see slightly less-smart filtering until the limit resets.

**Alternative: Claude (Anthropic), paid per-use, if you want it specifically.**

1. Go to https://console.anthropic.com, create an account, set up billing.
2. Create an API key under **API Keys**.
3. In Render → **Environment** → add `ANTHROPIC_API_KEY` instead of
   `GEMINI_API_KEY`.
4. Realistic cost: a small fraction of a cent per check, likely well under
   $0.10/week of normal use — but it is real, ongoing billing you control via
   your own Anthropic account. Set a spending limit there if you want a hard
   ceiling.

If both variables happen to be set, Gemini is used automatically since it's
free. **To turn AI off again**, remove whichever variable you set — the app
falls straight back to the free, keyword-based logic, no code change needed.

## Step 6 — (Skip this one) A personal TheMealDB key

The app works out of the box using TheMealDB's shared free test key ("1"),
which gives full access to their whole recipe catalog — that's what's
already running. A personal key exists, but it's actually a **paid,
one-time supporter contribution** (not free, contrary to what an earlier
version of this guide said) that mainly unlocks a couple of extra endpoints
this app doesn't use. For a personal weekly planner, the free shared key is
genuinely enough — not worth the cost here.

## Step 7 — (Optional) Add it to your phone's home screen

Open the site on your phone's browser → Share/menu → **Add to Home Screen**.
It'll behave like an app icon from there.

---

## Making it searchable on Google (down the line)

Worth knowing upfront: this app doesn't generate much that's actually worth
indexing — your meal plans are personal, built on the fly in your own
browser, and not real pages that exist anywhere for Google to find. "Making
it searchable" realistically means making the **landing page** (the app
itself, before you've built a plan) discoverable — useful if you ever want
people to find and use the tool, not for surfacing anyone's specific plan.

When you're ready:

1. **Remove the password gate** (delete `SITE_PASSWORD`) — a page search
   engines can't get into can't be indexed.
2. **Get a real domain name** (e.g. `chefstable.com`) instead of the
   `onrender.com` one — costs roughly $10-15/year from a registrar like
   Namecheap or Google Domains, and matters a lot for how trustworthy/findable
   the site looks. Point it at your Render service (Render's docs walk through
   custom domains under your service's **Settings**).
3. **Add real meta tags** to `public/index.html` — a proper `<title>`, a
   `<meta name="description">`, and Open Graph tags (so it looks good when
   shared). I can write these for you when you're ready.
4. **Submit it to Google Search Console** (free) — verify you own the
   domain, submit the URL, and Google will crawl and index it, usually
   within days to a couple of weeks.
5. Beyond that, ranking well (showing up high in results) is mostly about
   other sites linking to yours and the content being genuinely useful — not
   something that happens automatically just by being online.

None of this is needed for you to use the site — it only matters if/when you
want strangers finding it via Google.

## Updating your existing site with new files

Whenever I give you updated files (like this update), here's exactly how to
get them live. You never redo Steps 1–3 — that setup was one-time.

1. **Figure out which files changed.** I'll always tell you — usually it's
   just 2-4 of the project's files, not everything.
2. **For each changed file**, go to your GitHub repo and click directly on
   that file's name in the file list (e.g. `server.js`, or `public/index.html`
   — click into the `public` folder first if needed).
3. Click the **pencil icon** (top right of the file view) to edit it.
4. **Select all the existing text in the editor box** (click inside it, then
   Ctrl+A / Cmd+A) and delete it.
5. **Paste in the new version** of that file (Ctrl+V / Cmd+V).
6. Scroll down, make sure **"Commit directly to the main branch"** is
   selected, and click **"Commit changes"**.
7. Repeat steps 2–6 for every other changed file.
8. **For a brand-new file** that didn't exist before (like `ai.js` was, or
   the icon files in this update), use **"Add file" → "Create new file"**
   instead of editing — type the exact filename (including any folder, like
   `public/icon-192.png`), paste or upload the content, and commit.
9. Once all the changed files are committed, go to **Render → your
   service** — it detects the new commit and redeploys automatically within
   a couple of minutes (watch the **"Events"** or **"Logs"** tab for
   "Live"). If it doesn't auto-start, click **"Manual Deploy" → "Deploy
   latest commit"**.
10. Reload your site's URL once it says Live.

**One exception — binary files (images):** GitHub's web editor is
text-only, so a `.png` icon file can't be pasted as text. For those, use
**"Add file" → "Upload files"** instead, and drag the image file in directly
(I'll always let you know when a file is an image, like the new icons in
this update).

## Filters update: time, spice, skill, equipment

Four more filters now live on the Filters tab: **max time per meal**, **spice
tolerance**, **your cooking skill**, and **kitchen equipment you have**.
Worth knowing: TheMealDB has no structured data for any of these (no real
minutes field, no spice rating, no difficulty, no appliance list) — so these
work off a best-effort estimate from each recipe's ingredient count, step
count, and instruction text. It's a genuinely useful first pass, and gets
noticeably more accurate once a Gemini or Claude key is set (the AI reads
the actual recipe instead of estimating from word counts). Leave any of
these blank to skip that filter entirely.

There's also a **"Not feeling this"** button on every meal now, which finds
a different recipe for just that slot without rebuilding the whole week.

## Nutrition, pantry assumptions, and feedback

- **🔢 Nutrition button** on every meal card estimates calories, protein,
  carbs and fat per serving. This **requires an AI key** (Gemini or Claude —
  see the AI setup step above) since TheMealDB has no nutrition data and
  there's no other nutrition source wired in. Without a key, the button
  tells you that plainly rather than showing made-up numbers.
- **Pantry assumptions** (Pantry tab): checkboxes for "assume basic staples,"
  "assume full spice rack," and "assume full condiments/sauces," each with
  an "Advanced selection" button that opens a full checklist so you can
  check off exactly what you have instead of an all-or-nothing assumption.
  These only affect what's shown as already "have" on ingredient lists —
  they don't change which recipes get picked.
- **👍/👎 feedback** on every meal. A 👎 adds that dish to your no-repeat
  history so it won't be suggested again; 👍 is just a personal record for
  now (saved in your browser).

## Surprise me, cuisine learning, and the app icon

- **🎲 Surprise me** (Plan tab) gives you one random recipe instantly,
  independent of building a full week — useful for "what should I just make
  tonight." It can be saved as a favorite, rated, checked for nutrition, or
  dropped straight into an already-built week via "Add to day."
- **Weak cuisine learning:** once you've 👍'd two or more meals from the
  same cuisine (TheMealDB's "area," e.g. Italian, Mexican, Thai) with no
  outweighing 👎s, future plan-building and Surprise Me gently try that
  cuisine's dishes first. It's a soft nudge, not a filter — other cuisines
  are never excluded, and nothing happens until you've actually liked a
  couple of dishes.
- **Home-screen icon:** the site now has a proper icon and name for "Add to
  Home Screen" on phones, instead of a generic browser icon. New files:
  `public/icon-192.png`, `public/icon-512.png`,
  `public/apple-touch-icon.png`, `public/manifest.json` — these are new
  additions, not edits to existing files, so add them with GitHub's "Add
  file" (images need "Upload files" specifically, not the text editor).

## What this version can and can't do, compared to the AI version

**Can:** pull real recipes with real photos and instructions, filter by your
rules/allergies/dislikes, favorite meals, print/export, remember recent dishes
to avoid repeats, do simple leftover/batch reuse for packed lunches, offer a
small built-in ingredient-substitution list.

**Can't (without paying for AI again):** write a brand-new recipe on demand,
deeply reason about unusual combinations of pantry items, or double-check a
recipe's real-world correctness the way an AI reviewer did — it can only
filter what TheMealDB already has. If a search comes up empty, that means the
database doesn't have a match for your filters right now, not that none
exists.
