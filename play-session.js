// Immutable session actions shared by the UI and regression tests.
export function appendPlay(session, play) {
  if (!play || !/^[a-z]+$/i.test(play.word || "") || !Array.isArray(play.cost)) {
    throw new Error("The play has an invalid word or tile cost.");
  }
  const word = play.word.toLowerCase();
  if (session.played.includes(word)) throw new Error(`${word.toUpperCase()} was already played.`);
  if (play.cost.length !== session.remaining.length ||
      !play.cost.every((cost, i) => Number.isInteger(cost) && cost >= 0 && cost <= session.remaining[i])) {
    throw new Error("The play exceeds the remaining tiles.");
  }
  if (!Number.isFinite(play.points) || play.points < 0) throw new Error("Invalid play score.");
  const entry = {
    word, points: play.points, cost: play.cost.slice(),
    spicy: play.spicy || null, pangram: !!play.pangram
  };
  return {
    ...session,
    remaining: session.remaining.map((count, i) => count - play.cost[i]),
    played: [...session.played, word],
    plays: [...(session.plays || []), entry],
    score: (session.score || 0) + play.points,
    firstPangram: session.played.length === 0 ? !!play.pangram : !!session.firstPangram
  };
}

export function undoLatestPlay(session) {
  const entries = session.plays || [];
  const entry = entries.at(-1);
  if (!entry || session.played.at(-1) !== entry.word) {
    throw new Error("The last play predates tracked history and cannot be safely undone.");
  }
  const played = session.played.slice(0, -1);
  return {
    ...session,
    remaining: session.remaining.map((count, i) => count + entry.cost[i]),
    played,
    plays: entries.slice(0, -1),
    score: Math.max(0, (session.score || 0) - entry.points),
    firstPangram: played.length ? !!session.firstPangram : false
  };
}

export function historyRows(session) {
  const detail = new Map((session.plays || []).map((entry) => [entry.word, entry]));
  return session.played.map((word, i) => ({
    number: i + 1, word,
    points: detail.get(word)?.points ?? null,
    spicy: detail.get(word)?.spicy ?? null,
    trackable: detail.has(word)
  }));
}
