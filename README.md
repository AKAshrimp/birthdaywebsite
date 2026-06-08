# Flappy Vincy

A cute birthday website with a scrapbook-style landing page, generated birthday music, flying vegetable animations, and a Flappy Bird-inspired game.

## Run locally

```powershell
npx http-server . -p 5173 -c-1
```

Open:

```txt
http://localhost:5173
```

## Validate

```powershell
npm run check
npm test
```

## Leaderboard

The cloud leaderboard endpoint can be configured in `index.html`:

```js
window.BIRTHDAY_LEADERBOARD_ENDPOINT = "";
```
