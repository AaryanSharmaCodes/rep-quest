# Repsolute

My workout, weight and calorie tracker. Each day has four quests: train, hit protein, hit calories and weigh in. Clearing them earns XP.

It's plain HTML, CSS and JS with no build step or backend. Add it to the iPhone Home Screen from Safari and it runs like an app, offline too. Everything works offline on the device. Signing in with Google also keeps your data in your own account, so it follows you to a new phone (setup is in `SETUP-LOGIN.md`).

The calorie coach starts after 10 weigh-ins and 4 workouts. It fits a line through your weight, compares that with what you logged eating, and only suggests a change when the trend is clearly outside your goal range. The numbers and the papers behind them are in `js/science.js` and inside the app under You, then The science behind the numbers.

## Data

`foods/` holds about 467,000 foods, searched on the device by `food-worker.js`:

- USDA FoodData Central (SR Legacy, FNDDS, Foundation Foods), public domain
- Indian Nutrient Databank: Vijayakumar A, Dubasi HB, Awasthi A, Jaacks LM. Development of an Indian Food Composition Database. Curr Dev Nutr, 2024. [Source repo](https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-)
- Open Food Facts, © Open Food Facts contributors, under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). The extract in `foods/india.txt` and `foods/world-*.txt` is shared under the same licence.
- About 240 everyday dishes I wrote by hand in `tools/curated-foods.js`. These are typical estimates.

`exercises-db.json` comes from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense). Barcode reading uses [html5-qrcode](https://github.com/mebjas/html5-qrcode) (Apache 2.0). Animations use spring curves from [Motion](https://github.com/motiondivision/motion) (MIT), [morphdom](https://github.com/patrick-steele-idem/morphdom) (MIT) for smooth screen updates, and [canvas-confetti](https://github.com/catdad/canvas-confetti) (ISC) for celebrations. Fonts are Cinzel, Cinzel Decorative, Silkscreen and Instrument Sans (SIL OFL).

`tools/` rebuilds the food files from the original downloads.

## Run locally

```bash
python3 -m http.server 8000
```

Add `?sw` to the URL to turn on the offline service worker on localhost.
