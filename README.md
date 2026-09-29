# Plate Planner

Pick a dining hall and meal, set a goal (cut, lose weight, maintain, build muscle, eat healthier), and get meal ideas that fit your calories and protein. Track what you eat through the day.

A small script fetches the menus from Nutrislice every morning and republishes the site, so you never have to update anything by hand.

## What's in this folder

| File | What it does |
|---|---|
| `index.html`, `app.js`, `styles.css` | The app |
| `scripts/fetch_menu.py` | Fetches menus and writes `data/menu.json` |
| `data/menu.json` | Sample data for now. The daily update replaces it |
| `setup/update-menu.yml` | The daily automation (you'll paste this into GitHub in step 4) |
| `tests/` | Optional checks for the logic |

## Setup (about 15 minutes)

### 1. Make a GitHub account
Go to https://github.com/signup and follow the steps. The free plan is all you need.

### 2. Create a repository
1. Click the **+** in the top right, then **New repository**.
2. Name it `plate-planner`.
3. Choose **Public**. Free GitHub Pages hosting requires a public repository. Nobody will find the site unless you share the link, and everything in it (code and dining hall menus) is already non-secret.
4. Leave the other options alone and click **Create repository**.

### 3. Upload the files
1. Unzip `plate-planner.zip` on your computer.
2. On the new repository page, click **uploading an existing file**.
3. Open the unzipped folder and drag in everything inside it: `index.html`, `app.js`, `styles.css`, `README.md`, and the `data`, `scripts`, `setup`, and `tests` folders.
4. Click **Commit changes**.

### 4. Add the daily automation
GitHub only runs automation from a hidden folder, and hidden folders are easy to miss when dragging files, so add this one by hand:
1. In the repository, click **Add file**, then **Create new file**.
2. In the name box, type exactly: `.github/workflows/update-menu.yml` (typing each `/` makes a folder).
3. Open `setup/update-menu.yml` from the unzipped folder, copy everything in it, and paste it into the big text box.
4. Click **Commit changes**.

### 5. Turn on GitHub Pages
1. Go to **Settings**, then **Pages** in the left sidebar.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.

### 6. Run it for the first time
1. Click the **Actions** tab, then **Update menu and deploy** in the left list.
2. Click **Run workflow**, then the green **Run workflow** button.
3. Wait a minute or two for a green check mark. Click the run, and the site's web address appears under the **deploy** step.
4. Open it on your phone. On iPhone, tap Share then **Add to Home Screen**. On Android, use the browser menu then **Add to Home screen**.

After this, the site updates itself every morning at about 5 AM.

## If something goes wrong

- **The "Fetch the latest menus" step fails.** Open that step, copy the red error text, and send it to me. It lists every location Nutrislice reports, which also lets us confirm the North Dining Hall address, since I've only verified South.
- **Deploy fails with a Pages error.** Step 5 wasn't done yet. Do it, then click **Re-run all jobs**.
- **The page says "sample data".** The first run hasn't finished successfully yet.
- **The menu stops updating after a long quiet period.** GitHub can pause scheduled jobs in repositories with no activity for about 60 days. If it happens, open the Actions tab and click the button to re-enable it.
- **A hall or meal is missing.** Halls only show meals they actually serve. To add another dining hall, add it to `HALLS` at the top of `scripts/fetch_menu.py`.

## Before you make it public

- **Get permission.** The menu data belongs to ND Dining, and I haven't checked their terms for outside apps. Contact ND Food Services and ask before promoting the app.
- **Keep the disclaimers.** The footer says the app is unofficial and that targets aren't medical advice. Keep both.
- **Check the numbers.** Serving sizes on the source menus are inconsistent (ounces, links, pieces), and a few items have no nutrition data and are left out.

## Running the tests (optional)

```
node tests/planner.test.js
python3 -m unittest discover tests
```

## How the suggestions work

For a meal, the app tries thousands of random combinations of 2 to 5 items, adjusts the servings of each, and keeps the plates closest to your calorie target while reaching your protein target. Depending on your goal, it also penalizes high-fat plates and too much sugar, and for "Eat healthier" it rewards fiber and penalizes sodium. Toppings, sauces, drinks, and condiments are left out of suggestions (you can still add them from the full menu).

Targets come from the Mifflin-St Jeor formula with a 1,200 (women) or 1,500 (men) calorie minimum, and the app only calculates for ages 18 and up.
