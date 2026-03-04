import {
  Player,
  Position,
  GameLineup,
  BattingOrder,
  PlayerSeasonStats,
  GeneratedLineup,
  FIELD_POSITIONS,
  INFIELD_POSITIONS,
  OUTFIELD_POSITIONS,
} from "./types";

interface GenerateInput {
  availablePlayers: Player[];
  seasonLineups: GameLineup[]; // all past game_lineups
  seasonBattingOrders: BattingOrder[]; // all past batting orders
  innings: number; // how many innings this game
}

/**
 * Compute season stats for each player from past game data
 */
function computeSeasonStats(
  players: Player[],
  lineups: GameLineup[],
  battingOrders: BattingOrder[]
): Map<string, PlayerSeasonStats> {
  const stats = new Map<string, PlayerSeasonStats>();

  for (const p of players) {
    stats.set(p.id, {
      playerId: p.id,
      playerName: p.name,
      totalInnings: 0,
      infieldInnings: 0,
      outfieldInnings: 0,
      pitcherInnings: 0,
      catcherInnings: 0,
      benchInnings: 0,
      gamesPlayed: 0,
      avgBattingPosition: 0,
    });
  }

  // Count innings by position type
  for (const l of lineups) {
    const s = stats.get(l.player_id);
    if (!s) continue;

    if (l.position === "BENCH") {
      s.benchInnings++;
    } else {
      s.totalInnings++;
      if (l.position === "P") s.pitcherInnings++;
      else if (l.position === "C") s.catcherInnings++;
      else if (INFIELD_POSITIONS.includes(l.position)) s.infieldInnings++;
      else if (OUTFIELD_POSITIONS.includes(l.position)) s.outfieldInnings++;
    }
  }

  // Count games played (unique game_ids per player)
  const playerGames = new Map<string, Set<string>>();
  for (const l of lineups) {
    if (!playerGames.has(l.player_id)) playerGames.set(l.player_id, new Set());
    playerGames.get(l.player_id)!.add(l.game_id);
  }
  for (const [playerId, gameSet] of playerGames) {
    const s = stats.get(playerId);
    if (s) s.gamesPlayed = gameSet.size;
  }

  // Average batting order position
  const playerBatPositions = new Map<string, number[]>();
  for (const b of battingOrders) {
    if (!playerBatPositions.has(b.player_id))
      playerBatPositions.set(b.player_id, []);
    playerBatPositions.get(b.player_id)!.push(b.order_position);
  }
  for (const [playerId, positions] of playerBatPositions) {
    const s = stats.get(playerId);
    if (s) {
      s.avgBattingPosition =
        positions.reduce((a, b) => a + b, 0) / positions.length;
    }
  }

  return stats;
}

/**
 * Main lineup generation function
 */
export function generateLineup(input: GenerateInput): GeneratedLineup {
  const { availablePlayers, seasonLineups, seasonBattingOrders, innings } =
    input;
  const numPlayers = availablePlayers.length;
  const fieldSpots = FIELD_POSITIONS.length; // 10
  const benchPerInning = Math.max(0, numPlayers - fieldSpots);

  const stats = computeSeasonStats(
    availablePlayers,
    seasonLineups,
    seasonBattingOrders
  );

  // Track assignments for this game
  const assignments: { playerId: string; inning: number; position: Position }[] = [];
  const playerGameStats = new Map<
    string,
    {
      benchInnings: number[];
      fieldInnings: number;
      positions: Position[];
      infieldCount: number;
      outfieldCount: number;
    }
  >();

  for (const p of availablePlayers) {
    playerGameStats.set(p.id, {
      benchInnings: [],
      fieldInnings: 0,
      positions: [],
      infieldCount: 0,
      outfieldCount: 0,
    });
  }

  for (let inning = 1; inning <= innings; inning++) {
    // --- Step 1: Determine who sits on bench ---
    const benchCandidates = [...availablePlayers]
      .filter((p) => {
        const gs = playerGameStats.get(p.id)!;
        // Can't bench if benched last inning
        return !gs.benchInnings.includes(inning - 1);
      })
      .sort((a, b) => {
        const gsA = playerGameStats.get(a.id)!;
        const gsB = playerGameStats.get(b.id)!;
        const sA = stats.get(a.id)!;
        const sB = stats.get(b.id)!;
        // Prioritize benching players who have benched LESS this game
        const gameBenchDiff = gsA.benchInnings.length - gsB.benchInnings.length;
        if (gameBenchDiff !== 0) return gameBenchDiff;
        // Then by season bench count (fewer season benches = more likely to bench now)
        return sA.benchInnings - sB.benchInnings;
      });

    // Also consider players who benched last inning but MUST bench again
    // (only if not enough candidates)
    const mustBenchPlayers = availablePlayers.filter((p) => {
      const gs = playerGameStats.get(p.id)!;
      return gs.benchInnings.includes(inning - 1);
    });

    let benchPlayers: Player[] = [];
    if (benchCandidates.length >= benchPerInning) {
      benchPlayers = benchCandidates.slice(0, benchPerInning);
    } else {
      // Not enough non-consecutive candidates, have to repeat some
      benchPlayers = [...benchCandidates];
      for (const p of mustBenchPlayers) {
        if (benchPlayers.length >= benchPerInning) break;
        benchPlayers.push(p);
      }
    }

    const benchIds = new Set(benchPlayers.map((p) => p.id));
    const fieldPlayers = availablePlayers.filter((p) => !benchIds.has(p.id));

    // Assign bench
    for (const p of benchPlayers) {
      assignments.push({ playerId: p.id, inning, position: "BENCH" });
      playerGameStats.get(p.id)!.benchInnings.push(inning);
    }

    // --- Step 2: Assign Pitcher ---
    const eligiblePitchers = fieldPlayers
      .filter((p) => p.can_pitch)
      .sort((a, b) => {
        const sA = stats.get(a.id)!;
        const sB = stats.get(b.id)!;
        // Fewest pitcher innings first
        const pitchDiff = sA.pitcherInnings - sB.pitcherInnings;
        if (pitchDiff !== 0) return pitchDiff;
        // Break tie by fielding rating (higher = better pitcher)
        return b.fielding_rating - a.fielding_rating;
      });

    // Check who already pitched this game
    const pitchedThisGame = new Set(
      assignments
        .filter((a) => a.position === "P")
        .map((a) => a.playerId)
    );

    let pitcher: Player | undefined;
    // Prefer someone who hasn't pitched this game yet for variety
    pitcher = eligiblePitchers.find((p) => !pitchedThisGame.has(p.id));
    if (!pitcher) pitcher = eligiblePitchers[0];
    if (!pitcher) pitcher = fieldPlayers[0]; // fallback if nobody is marked can_pitch

    const assignedIds = new Set<string>();
    if (pitcher) {
      assignments.push({ playerId: pitcher.id, inning, position: "P" });
      assignedIds.add(pitcher.id);
      const gs = playerGameStats.get(pitcher.id)!;
      gs.fieldInnings++;
      gs.positions.push("P");
    }

    // --- Step 3: Assign Catcher ---
    const eligibleCatchers = fieldPlayers
      .filter((p) => p.can_catch && !assignedIds.has(p.id))
      .sort((a, b) => {
        const sA = stats.get(a.id)!;
        const sB = stats.get(b.id)!;
        return sA.catcherInnings - sB.catcherInnings;
      });

    const caughtThisGame = new Set(
      assignments
        .filter((a) => a.position === "C")
        .map((a) => a.playerId)
    );

    let catcher: Player | undefined;
    catcher = eligibleCatchers.find((p) => !caughtThisGame.has(p.id));
    if (!catcher) catcher = eligibleCatchers[0];

    if (catcher) {
      assignments.push({ playerId: catcher.id, inning, position: "C" });
      assignedIds.add(catcher.id);
      const gs = playerGameStats.get(catcher.id)!;
      gs.fieldInnings++;
      gs.positions.push("C");
    }

    // --- Step 4: Assign Infield ---
    const remainingPlayers = fieldPlayers.filter(
      (p) => !assignedIds.has(p.id)
    );

    // Sort by who needs more infield innings
    const needInfield = [...remainingPlayers].sort((a, b) => {
      const sA = stats.get(a.id)!;
      const sB = stats.get(b.id)!;
      const gsA = playerGameStats.get(a.id)!;
      const gsB = playerGameStats.get(b.id)!;
      // Season infield deficit
      const deficitA = sA.infieldInnings + gsA.infieldCount;
      const deficitB = sB.infieldInnings + gsB.infieldCount;
      if (deficitA !== deficitB) return deficitA - deficitB;
      // Tie-break: higher fielding rating
      return b.fielding_rating - a.fielding_rating;
    });

    const infieldSlots: Position[] = [...INFIELD_POSITIONS];
    for (const pos of infieldSlots) {
      const player = needInfield.find((p) => !assignedIds.has(p.id));
      if (player) {
        assignments.push({ playerId: player.id, inning, position: pos });
        assignedIds.add(player.id);
        const gs = playerGameStats.get(player.id)!;
        gs.fieldInnings++;
        gs.positions.push(pos);
        gs.infieldCount++;
      }
    }

    // --- Step 5: Assign Outfield ---
    const outfieldPlayers = fieldPlayers.filter(
      (p) => !assignedIds.has(p.id)
    );
    const outfieldSlots: Position[] = [...OUTFIELD_POSITIONS];

    // Sort by who needs more outfield innings
    const needOutfield = [...outfieldPlayers].sort((a, b) => {
      const sA = stats.get(a.id)!;
      const sB = stats.get(b.id)!;
      const gsA = playerGameStats.get(a.id)!;
      const gsB = playerGameStats.get(b.id)!;
      const deficitA = sA.outfieldInnings + gsA.outfieldCount;
      const deficitB = sB.outfieldInnings + gsB.outfieldCount;
      return deficitA - deficitB;
    });

    for (const pos of outfieldSlots) {
      const player = needOutfield.find((p) => !assignedIds.has(p.id));
      if (player) {
        assignments.push({ playerId: player.id, inning, position: pos });
        assignedIds.add(player.id);
        const gs = playerGameStats.get(player.id)!;
        gs.fieldInnings++;
        gs.positions.push(pos);
        gs.outfieldCount++;
      }
    }
  }

  // --- Generate Batting Order ---
  // Rotate based on season average batting position
  const battingOrder = [...availablePlayers].sort((a, b) => {
    const sA = stats.get(a.id)!;
    const sB = stats.get(b.id)!;

    // Players who have been batting later should bat earlier now
    // Higher avg position = been batting later = should go earlier
    const avgDiff = sB.avgBattingPosition - sA.avgBattingPosition;
    if (Math.abs(avgDiff) > 0.5) return avgDiff > 0 ? -1 : 1;

    // Tie-break: mix in batting rating so lineup isn't terrible
    // Better hitters get slight preference toward top
    return b.batting_rating - a.batting_rating;
  });

  const battingOrderResult = battingOrder.map((p, i) => ({
    playerId: p.id,
    orderPosition: i + 1,
  }));

  // --- Extract Pitching Plan ---
  const pitchingPlan = assignments
    .filter((a) => a.position === "P")
    .map((a) => ({ playerId: a.playerId, inning: a.inning }));

  return {
    positions: assignments,
    battingOrder: battingOrderResult,
    pitchingPlan,
  };
}

/**
 * Export computeSeasonStats for the fairness dashboard
 */
export { computeSeasonStats };
