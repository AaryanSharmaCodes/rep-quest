# Food data fixes

What was wrong in the bundled food data and what changed. Rebuilt 2026-11-18 from the same sources, plus a fresh Open Food Facts export.

## Lab and recipe tables

- **IFCT fish vitamin B6 was 1000x too high.** The ifct2017 package prints B6 for marine fish, shellfish, molluscs and freshwater fish in mg where every other value is in g. Allathi showed 194 mg B6 per 100 g; it has 0.194 mg. All 117 fish rows fixed.
- **IFCT "not analysed" was read as zero.** The package writes 0 for nutrients that weren't measured, so folate in every meat and fish, retinol (vitamin A) in milk, vitamin K in animal foods and everything in oils counted as none. A column that is 0 for every food in an IFCT group now counts as missing (estimated per calorie), except true zeros (vitamin D3, K2, EPA/DHA and retinol in plants; fibre and carotene in meat).
- **INDB recipes that count all the frying oil as eaten.** Vegetable samosa 443 kcal with 42 g fat and 2 g protein, mathri 805 kcal, peanut sago vada 750 kcal, vegetable yakhni 406 kcal with 44 g fat. 26 rows where nearly all energy comes from fat that a dish can't hold were dropped (dressings, pickles, chutneys and tadkas kept).
- **INDB dishes given per 100 g of dry ingredients.** Plain dosa 381 kcal, khichdi 383 kcal, tamarind rice 373 kcal, sprouts upma 316 kcal. 8 rows dropped; the hand-written versions cover these.

## Hand-written foods (curated-foods.js, curated-micros.js)

- **Roti / chapati / phulka, no ghee: 297 kcal, 7.5 g fat → 235 kcal, 1.1 g fat.** The old values were USDA's commercial chapati, made with shortening. New values: IFCT whole wheat atta cooked to a roti with about 35% water.
- **Roti with ghee: 340 → 309 kcal** (40 g roti plus 1 tsp ghee).
- **Ghee: 900 → 876 kcal** (USDA clarified butter, 99.5 g fat).
- **Maggi, dry: 447 kcal, 17 g fat (USDA ramen) → 384 kcal, 12.5 g fat**, the Maggi 2-Minute Masala label. Maggi, cooked: 145 → 134 kcal.
- **Borrowed micronutrients were copied regardless of how watery the food was.** A curated food takes its vitamins and minerals from a matching INDB or USDA food; they're now scaled by the protein ratio, so a dosa borrowing from a denser dosa or a thin dal borrowing from boiled pigeon peas gets proportionate values (160 of 234 foods). Protein rather than calories, so lassi doesn't get double the calcium of curd for its sugar.
- **Wrong matches:** Maggi borrowed a reduced-sodium ramen; it now uses the label's 1,000 mg sodium. Masala peanuts borrowed raw unsalted peanuts (18 mg sodium), now salted roasted peanuts. Bhujia borrowed plain besan (64 mg sodium), now estimated as a salty snack. Jaggery borrowed brown sugar (0.7 mg iron), now IFCT jaggery (4.6 mg). Bajra and jowar roti borrowed wheat roti, now IFCT bajra and jowar.

## Open Food Facts (crowd-entered labels)

- **Energy that doesn't match the macros.** Allowed gap tightened from 35% to 20% (or 25 kcal), with allowance for fibre, polyols and alcohol. About 2,800 rows that disagreed by 20-35% are gone. kJ typed in the kcal box (or the reverse) is now corrected instead of dropped, and 0 kcal with real macros is rejected (Swastiks mango pickle: 0 kcal, 2.4 g fat).
- **Per-serving numbers typed as per 100 g.** Dropped when a food can't be that light and its macros keep the food's shape: ghee or oil under 700 kcal (Amul ghee entered at 496 kcal), nuts under 450, biscuits under 280, chips and namkeen under 300, whey under 200 (Gold Standard at 110 kcal: one scoop), flour under 250, sugar or honey under 250. About 1,100 rows.
- **Vitamin and mineral unit slips.** Values beyond what the food can hold are dropped (then estimated), not the food: Milky Mist yogurt 21,000 mg sodium per 100 g, Tata Fabsta biscuits 20,000 mg, Dairy Day choco bar 31,200 mg, a clementine juice with 24,000 µg vitamin A, a soy drink with 400 µg B12, almond milk with 93 mg iron. About 3,800 values; supplements, salt, stock cubes, masalas, liver, yeast and the like are exempt.
- **Other:** servings under 1 g or over 1.5 kg dropped, carbs above 100 g clamped (Rooh Afza 103.9 g), curly quotes normalised so names like "Lay’s" aren't thrown out, and Indian products now win over a duplicate from another country instead of whichever came first in the file.

## New: Indian packaged foods

- `india-brands.txt`: 4,700 products with a GS1 India barcode (890...) or an Indian brand that nobody tagged as sold in India, about 3,800 of them new and 900 moved up from the world files. With `india.txt` (9,354), that's about 14,000 Indian products, of roughly 15,500 in Open Food Facts that have a name, energy and macros at all (another 19,700 have no nutrition data).
- Brand spellings merged, so "Haldirams", "HALDIRAM'S" and "Haldiram" are all "Haldiram's", and barcodes kept for offline scanning.
