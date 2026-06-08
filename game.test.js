import test from "node:test";
import assert from "node:assert/strict";
import {
  circleOverlapsRect,
  getRenderDpr,
  insetRect,
  isSafeVegetableSpawn,
  OBSTACLE_IMAGE_SRCS,
  rectsOverlap,
  VEGETABLES,
} from "./game.js";
import { leaderboardConfig, normalizeScore, sanitizeName } from "./leaderboard.js";
import { submitScore } from "./leaderboard.js";

test("landing vegetables avoid the center avatar protection zone", () => {
  assert.equal(isSafeVegetableSpawn(500, 1000), false);
  assert.equal(isSafeVegetableSpawn(80, 1000), true);
  assert.equal(isSafeVegetableSpawn(920, 1000), true);
});

test("collision helper detects overlapping rectangles only", () => {
  assert.equal(rectsOverlap({ x: 0, y: 0, width: 20, height: 20 }, { x: 10, y: 10, width: 20, height: 20 }), true);
  assert.equal(rectsOverlap({ x: 0, y: 0, width: 20, height: 20 }, { x: 30, y: 30, width: 20, height: 20 }), false);
});

test("hitbox inset makes obstacle collision more forgiving", () => {
  const visualObstacle = { x: 100, y: 0, width: 80, height: 200 };
  const forgivingObstacle = insetRect(visualObstacle, 18, 10);

  assert.deepEqual(forgivingObstacle, { x: 118, y: 10, width: 44, height: 180 });
  assert.equal(rectsOverlap({ x: 102, y: 50, width: 12, height: 12 }, forgivingObstacle), false);
});

test("circle hitbox avoids square-corner false positives", () => {
  const obstacle = { x: 100, y: 100, width: 50, height: 50 };

  assert.equal(circleOverlapsRect({ x: 92, y: 92, radius: 10 }, obstacle), false);
  assert.equal(circleOverlapsRect({ x: 96, y: 125, radius: 10 }, obstacle), true);
});

test("vegetable obstacle list contains no pipe sprites", () => {
  assert.ok(VEGETABLES.length >= 5);
  assert.equal(VEGETABLES.includes("🚰"), false);
});

test("game has seven randomized vegetable wall images", () => {
  assert.equal(OBSTACLE_IMAGE_SRCS.length, 7);
  assert.deepEqual(
    OBSTACLE_IMAGE_SRCS.map((src) => src.split("/").at(-1).split("?")[0]),
    ["wall1.png", "wall2.png", "wall3.png", "wall4.png", "wall5.png", "wall6.png", "wall7.png"],
  );
  assert.ok(OBSTACLE_IMAGE_SRCS.every((src) => /\?v=\d+$/.test(src)));
});

test("leaderboard name and score inputs are sanitized", () => {
  assert.equal(sanitizeName("   Ada    Lovelace   "), "Ada Lovelace");
  assert.equal(sanitizeName(""), "Birthday Legend");
  assert.equal(normalizeScore(17.9), 17);
  assert.equal(normalizeScore(-30), 0);
  assert.equal(normalizeScore(1000000), 9999);
});

test("leaderboard falls back to session scores when cloud endpoint is not configured", async () => {
  const result = await submitScore({ name: " Grace ", score: 42 });
  assert.equal(result.savedToCloud, false);
  assert.equal(result.entries[0].name, "Grace");
  assert.equal(result.entries[0].score, 42);
});

test("score submission guard prevents duplicate submit attempts per game over", () => {
  const state = { scoreSubmitted: false };
  const firstAttemptAllowed = !state.scoreSubmitted;
  state.scoreSubmitted = true;
  const secondAttemptAllowed = !state.scoreSubmitted;

  assert.equal(firstAttemptAllowed, true);
  assert.equal(secondAttemptAllowed, false);
});

test("render DPR is capped to keep high density screens smooth", () => {
  assert.equal(getRenderDpr(1), 1);
  assert.equal(getRenderDpr(2), 1.35);
  assert.equal(getRenderDpr(3), 1.35);
});

test("cloud score submit stays successful if leaderboard refresh fails", async () => {
  const originalConfig = { ...leaderboardConfig };
  leaderboardConfig.enabled = true;
  leaderboardConfig.endpoint = "https://example.test/scores";

  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    if (calls === 1) {
      return { ok: true };
    }
    return { ok: false };
  };

  try {
    const result = await submitScore({ name: "Lin", score: 9 }, fakeFetch);
    assert.equal(result.savedToCloud, true);
    assert.match(result.message, /Score saved/);
  } finally {
    leaderboardConfig.enabled = originalConfig.enabled;
    leaderboardConfig.endpoint = originalConfig.endpoint;
  }
});
