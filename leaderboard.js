export const leaderboardConfig = {
  endpoint: globalThis.BIRTHDAY_LEADERBOARD_ENDPOINT || "",
  key: globalThis.BIRTHDAY_LEADERBOARD_KEY || "",
  enabled: Boolean(globalThis.BIRTHDAY_LEADERBOARD_ENDPOINT),
};

const sessionScores = [];

export function sanitizeName(name) {
  const cleaned = String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 18);
  return cleaned || "Birthday Legend";
}

export function normalizeScore(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return 0;
  }
  return Math.max(0, Math.min(9999, Math.floor(numericScore)));
}

export async function submitScore({ name, score }, fetcher = globalThis.fetch) {
  const entry = {
    name: sanitizeName(name),
    score: normalizeScore(score),
    created_at: new Date().toISOString(),
  };

  sessionScores.push(entry);
  sessionScores.sort((a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at));
  sessionScores.splice(10);

  if (!leaderboardConfig.enabled || !leaderboardConfig.endpoint) {
    return {
      savedToCloud: false,
      entries: [...sessionScores],
      message: "Cloud leaderboard is not configured yet. Showing this session's scores.",
    };
  }

  const response = await fetcher(leaderboardConfig.endpoint, {
    method: "POST",
    headers: getLeaderboardHeaders(),
    body: JSON.stringify(entry),
  });

  if (!response.ok) {
    throw new Error("Could not submit score to cloud leaderboard.");
  }

  let entries = [...sessionScores];
  try {
    entries = await fetchTopScores(fetcher);
  } catch {
    return {
      savedToCloud: true,
      entries,
      message: "Score saved. Could not refresh cloud leaderboard yet.",
    };
  }

  return {
    savedToCloud: true,
    entries,
    message: "Score saved to cloud leaderboard.",
  };
}

export async function fetchTopScores(fetcher = globalThis.fetch) {
  if (!leaderboardConfig.enabled || !leaderboardConfig.endpoint) {
    return [...sessionScores];
  }

  const url = new URL(leaderboardConfig.endpoint);
  url.searchParams.set("select", "name,score,created_at");
  url.searchParams.set("order", "score.desc,created_at.asc");
  url.searchParams.set("limit", "10");

  const response = await fetcher(url.toString(), {
    method: "GET",
    headers: getLeaderboardHeaders(),
  });
  if (!response.ok) {
    throw new Error("Could not load cloud leaderboard.");
  }

  const data = await response.json();
  return Array.isArray(data) ? data.map(normalizeEntry).sort((a, b) => b.score - a.score).slice(0, 10) : [];
}

function getLeaderboardHeaders() {
  const headers = {
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  if (leaderboardConfig.key) {
    headers.apikey = leaderboardConfig.key;
    headers.Authorization = `Bearer ${leaderboardConfig.key}`;
  }

  return headers;
}

function normalizeEntry(entry) {
  return {
    name: sanitizeName(entry.name),
    score: normalizeScore(entry.score),
    created_at: entry.created_at || new Date().toISOString(),
  };
}
