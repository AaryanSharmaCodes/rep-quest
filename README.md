# Rep Quest

My workout and calorie tracker. It logs sets, reps, weight, waist, food and macros, and turns the routine into a small game with XP, quests and a boss you beat by shrinking your waist.

It's a plain HTML/CSS/JS web app with no build step or backend. Add it to the iPhone Home Screen from Safari and it runs like an app, offline too. All data stays on the device, so use Save backup in the Hero tab now and then.

Food search uses Open Food Facts and USDA FoodData Central, plus a built-in list of common Indian foods in `data.js`. The built-in numbers are estimates.

To run it locally:

```bash
python3 -m http.server 8000
```
