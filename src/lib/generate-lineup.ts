import {
  Player,
  Position,
  GameLineup,
  BattingOrder,
  PitchingPlan,
  GameAbsence,
  PlayerSeasonStats,
  GeneratedLineup,
  LeagueRules,
  FIELD_POSITIONS,
  INFIELD_POSITIONS,
  OUTFIELD_POSITIONS,
  ALL_POSITIONS,
} from "./types";

interface GenerateInput {
  availablePlayers: Player[];
  seasonLineups: GameLineup[];
  seasonBattingOrders: BattingOrder[];
  seasonPitchingPlans: PitchingPlan[];
  seasonAbsences: GameAbsence[];
  innings: number;
  rules: LeagueRules;
  lastGameBattingOrder: BattingOrder[]; // batting order from the previous game
  previousGamePitchCounts: PitchingPlan[]; // pitch counts from the previous game
  gameNumber: number; // which game number in the season (1-based)
}

/**
 * Compute season stats for each player from past game data
 */
function computeSeasonStats(
  players: Player[],
  lineups: GameLineup[],
  battingOrders: BattingOrder[],
  pitchingPlans: PitchingPlan[],
  absences: GameAbsence[]
): Map<string, PlayerSeasonStats> {
  const stats = new Map<string, PlayerSeasonStats>();

  const emptyPositionCounts = (): Record<Position, number> => {
    const counts = {} as Record<Position, number>;
    for (const pos of ALL_POSITIONS) counts[pos] = 0;
    return counts;
  };

  for (const p of players) {
    stats.set(p.id, {
      playerId: p.id,
      playerName: p.name,
      totalInnings: 0,
      positionCounts: emptyPositionCounts(),
      infieldInnings: 0,
      outfieldInnings: 0,
      pitcherInnings: 0,
      catcherInnings: 0,
      benchInnings: 0,
      gamesPlayed: 0,
      gamesAbsent: 0,
      avgBattingPosition: 0,
      totalPitchCount: 0,
    });
  }

  // Count innings by position
  for (const l of lineups) {
    const s = stats.get(l.player_id);
    if (!s) continue;

    s.positionCounts[l.position] = (s.positionCounts[l.position] || 0) + 1;

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

  // Count games played (unique game_ids per player from lineups)
  const playerGames = new Map<string, Set<string>>();
  for (const l of lineups) {
    if (!playerGames.has(l.player_id)) playerGames.set(l.player_id, new Set());
    playerGames.get(l.player_id)!.add(l.game_id);
  }
  for (const [playerId, gameSet] of playerGames) {
    const s = stats.get(playerId);
    if (s) s.gamesPlayed = gameSet.size;
  }

  // Count games absent
  const playerAbsences = new Map<string, Set<string>>();
  for (const a of absences) {
    if (!playerAbsences.has(a.player_id))
      playerAbsences.set(a.player_id, new Set());
    playerAbsences.get(a.player_id)!.add(a.game_id);
  }
  for (const [playerId, gameSet] of playerAbsences) {
    const s = stats.get(playerId);
    if (s) s.gamesAbsent = gameSet.size;
  }

  // Total pitch count
  for (const pp of pitchingPlans) {
    const s = stats.get(pp.player_id);
    if (s) s.totalPitchCount += pp.pitch_count;
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
 * Main lineup generation function with full league rules enforcement
 */
export function generateLineup(input: GenerateInput): GeneratedLineup {
  const {
    availablePlayers,
    seasonLineups,
    seasonBattingOrders,
    seasonPitchingPlans,
    seasonAbsences,
    innings,
    rules,
    lastGameBattingOrder,
    previousGamePitchCounts,
    gameNumber,
  } = input;

  const numPlayers = availablePlayers.length;
  const fieldSpots = FIELD_POSITIONS.length; // 10
  const benchPerInning = Math.max(0, numPlayers - fieldSpots);

  const stats = computeSeasonStats(
    availablePlayers,
    seasonLineups,
    seasonBattingOrders,
    seasonPitchingPlans,
    seasonAbsences
  );

  // Build a set of player IDs who are resting from pitching (threw > threshold last game)
  const pitchRestIds = new Set<string>();
  for (const pp of previousGamePitchCounts) {
    if (pp.pitch_count > rules.pitchRestThreshold) {
      pitchRestIds.add(pp.player_id);
    }
  }

  // Track assignments for this game
  const assignments: {
    playerId: string;
    inning: number;
    position: Position;
  }[] = [];

  // Per-player tracking within this game
  const playerGameStats = new Map<
    string,
    {
      benchInnings: number[];
      fieldInnings: number;
      positions: Position[];
      positionCounts: Record<string, number>;
      infieldCount: number;
      outfieldCount: number;
      pitchInnings: number;
      pitchedLastInning: boolean;
    }
  >();

  for (const p of availablePlayers) {
    playerGameStats.set(p.id, {
      benchInnings: [],
      fieldInnings: 0,
      positions: [],
      positionCounts: {},
      infieldCount: 0,
      outfieldCount: 0,
      pitchInnings: 0,
      pitchedLastInning: false,
    });
  }

  // Helper: count how many times a player has played a specific position this game
  function gamePositionCount(playerId: string, pos: string): number {
    return playerGameStats.get(playerId)!.positionCounts[pos] || 0;
  }

  // Helper: check if a player has had at least 1 infield inning this game
  function hasInfieldThisGame(playerId: string): boolean {
    return playerGameStats.get(playerId)!.infieldCount > 0;
  }

  for (let inning = 1; inning <= innings; inning++) {
    // --- Step 1: Determine who sits on bench ---
    // Force bench: players who pitched the previous inning
    const forceBenchIds = new Set<string>();
    for (const p of availablePlayers) {
      const gs = playerGameStats.get(p.id)!;
      if (gs.pitchedLastInning) {
        forceBenchIds.add(p.id);
      }
    }

    // Bench candidates: not forced bench + not benched last inning (no consecutive)
    const regularBenchCandidates = availablePlayers
      .filter((p) => {
        const gs = playerGameStats.get(p.id)!;
        if (forceBenchIds.has(p.id)) return false;
        // Can't bench consecutively (unless forced)
        return !gs.benchInnings.includes(inning - 1);
      })
      .sort((a, b) => {
        const gsA = playerGameStats.get(a.id)!;
        const gsB = playerGameStats.get(b.id)!;
        const sA = stats.get(a.id)!;
        const sB = stats.get(b.id)!;
        // Fair rotation: bench players with fewest bench innings this game first
        const gameBenchDiff =
          gsA.benchInnings.length - gsB.benchInnings.length;
        if (gameBenchDiff !== 0) return gameBenchDiff;
        // Then by season bench count (fewer = more likely to bench)
        return sA.benchInnings - sB.benchInnings;
      });

    // How many bench spots remain after forced bench players
    const forceBenchCount = Math.min(forceBenchIds.size, benchPerInning);
    const remainingBenchSlots = benchPerInning - forceBenchCount;

    let benchPlayerIds = new Set<string>();

    // Add force-benched players first
    for (const id of forceBenchIds) {
      if (benchPlayerIds.size < benchPerInning) {
        benchPlayerIds.add(id);
      }
    }

    // Fill remaining bench slots from candidates
    for (const p of regularBenchCandidates) {
      if (benchPlayerIds.size >= benchPerInning) break;
      if (!benchPlayerIds.has(p.id)) {
        benchPlayerIds.add(p.id);
      }
    }

    // If still not enough bench players, allow consecutive bench
    if (benchPlayerIds.size < benchPerInning) {
      for (const p of availablePlayers) {
        if (benchPlayerIds.size >= benchPerInning) break;
        if (!benchPlayerIds.has(p.id)) {
          benchPlayerIds.add(p.id);
        }
      }
    }

    const fieldPlayers = availablePlayers.filter(
      (p) => !benchPlayerIds.has(p.id)
    );

    // Assign bench
    for (const id of benchPlayerIds) {
      assignments.push({ playerId: id, inning, position: "BENCH" });
      playerGameStats.get(id)!.benchInnings.push(inning);
    }

    // --- Step 2: Assign Pitcher ---
    const eligiblePitchers = fieldPlayers.filter((p) => {
      if (!p.can_pitch) return false;
      const gs = playerGameStats.get(p.id)!;
      // Max pitch innings per game
      if (gs.pitchInnings >= rules.maxPitchInningsPerGame) return false;
      // Pitch rest: skip if threw > threshold last game
      if (pitchRestIds.has(p.id)) return false;
      return true;
    });

    // Season pitching plan: first half (games 1-4) prioritize players with 0 pitch innings
    // Second half: prefer preferred_pitcher players
    const isFirstHalf = gameNumber <= 4;

    const sortedPitchers = [...eligiblePitchers].sort((a, b) => {
      const sA = stats.get(a.id)!;
      const sB = stats.get(b.id)!;
      const gsA = playerGameStats.get(a.id)!;
      const gsB = playerGameStats.get(b.id)!;

      if (isFirstHalf) {
        // First half: prioritize players who have never pitched
        const aPitched = sA.pitcherInnings + gsA.pitchInnings;
        const bPitched = sB.pitcherInnings + gsB.pitchInnings;
        if (aPitched === 0 && bPitched > 0) return -1;
        if (bPitched === 0 && aPitched > 0) return 1;
      } else {
        // Second half: prefer preferred_pitcher
        if (a.preferred_pitcher && !b.preferred_pitcher) return -1;
        if (b.preferred_pitcher && !a.preferred_pitcher) return 1;
      }

      // Prefer someone who hasn't pitched this game yet
      if (gsA.pitchInnings === 0 && gsB.pitchInnings > 0) return -1;
      if (gsB.pitchInnings === 0 && gsA.pitchInnings > 0) return 1;

      // Fewest season pitch innings
      const seasonDiff = sA.pitcherInnings - sB.pitcherInnings;
      if (seasonDiff !== 0) return seasonDiff;

      // Tiebreak: higher pitching_rating
      return b.pitching_rating - a.pitching_rating;
    });

    let pitcher: Player | undefined = sortedPitchers[0];
    if (!pitcher) {
      // Fallback: anyone on the field
      pitcher = fieldPlayers[0];
    }

    const assignedIds = new Set<string>();
    if (pitcher) {
      assignments.push({ playerId: pitcher.id, inning, position: "P" });
      assignedIds.add(pitcher.id);
      const gs = playerGameStats.get(pitcher.id)!;
      gs.fieldInnings++;
      gs.positions.push("P");
      gs.positionCounts["P"] = (gs.positionCounts["P"] || 0) + 1;
      gs.pitchInnings++;
    }

    // --- Step 3: Assign Catcher ---
    const eligibleCatchers = fieldPlayers
      .filter((p) => {
        if (!p.can_catch) return false;
        if (assignedIds.has(p.id)) return false;
        // Check max same position rule
        if (gamePositionCount(p.id, "C") >= rules.maxSamePositionInnings)
          return false;
        return true;
      })
      .sort((a, b) => {
        const sA = stats.get(a.id)!;
        const sB = stats.get(b.id)!;
        const diff = sA.catcherInnings - sB.catcherInnings;
        if (diff !== 0) return diff;
        return b.fielding_rating - a.fielding_rating;
      });

    let catcher: Player | undefined = eligibleCatchers[0];
    // Fallback: any can_catch player even if over limit
    if (!catcher) {
      catcher = fieldPlayers.find(
        (p) => p.can_catch && !assignedIds.has(p.id)
      );
    }

    if (catcher) {
      assignments.push({ playerId: catcher.id, inning, position: "C" });
      assignedIds.add(catcher.id);
      const gs = playerGameStats.get(catcher.id)!;
      gs.fieldInnings++;
      gs.positions.push("C");
      gs.positionCounts["C"] = (gs.positionCounts["C"] || 0) + 1;
    }

    // --- Step 4: Assign Infield ---
    const remainingForInfield = fieldPlayers.filter(
      (p) => !assignedIds.has(p.id)
    );

    // Sort: prioritize players who need infield innings (rule: require at least 1)
    const needInfield = [...remainingForInfield].sort((a, b) => {
      const sA = stats.get(a.id)!;
      const sB = stats.get(b.id)!;
      const gsA = playerGameStats.get(a.id)!;
      const gsB = playerGameStats.get(b.id)!;

      // If it's a later inning and a player has no infield yet, bump them up
      if (rules.requireInfieldInning && inning >= innings - 1) {
        const aNeeds = !hasInfieldThisGame(a.id) && sA.infieldInnings === 0;
        const bNeeds = !hasInfieldThisGame(b.id) && sB.infieldInnings === 0;
        if (aNeeds && !bNeeds) return -1;
        if (bNeeds && !aNeeds) return 1;
      }

      // Fewer combined (season + game) infield innings first
      const deficitA = sA.infieldInnings + gsA.infieldCount;
      const deficitB = sB.infieldInnings + gsB.infieldCount;
      if (deficitA !== deficitB) return deficitA - deficitB;

      // Tiebreak: higher fielding rating
      return b.fielding_rating - a.fielding_rating;
    });

    const infieldSlots: Position[] = [...INFIELD_POSITIONS];
    for (const pos of infieldSlots) {
      // Find a player who hasn't exceeded max same position innings for this pos
      const player = needInfield.find((p) => {
        if (assignedIds.has(p.id)) return false;
        if (gamePositionCount(p.id, pos) >= rules.maxSamePositionInnings)
          return false;
        return true;
      });
      // Fallback: ignore position limit
      const fallback =
        player || needInfield.find((p) => !assignedIds.has(p.id));
      if (fallback) {
        assignments.push({
          playerId: fallback.id,
          inning,
          position: pos,
        });
        assignedIds.add(fallback.id);
        const gs = playerGameStats.get(fallback.id)!;
        gs.fieldInnings++;
        gs.positions.push(pos);
        gs.positionCounts[pos] = (gs.positionCounts[pos] || 0) + 1;
        gs.infieldCount++;
      }
    }

    // --- Step 5: Assign Outfield ---
    const remainingForOutfield = fieldPlayers.filter(
      (p) => !assignedIds.has(p.id)
    );

    const needOutfield = [...remainingForOutfield].sort((a, b) => {
      const sA = stats.get(a.id)!;
      const sB = stats.get(b.id)!;
      const gsA = playerGameStats.get(a.id)!;
      const gsB = playerGameStats.get(b.id)!;
      const deficitA = sA.outfieldInnings + gsA.outfieldCount;
      const deficitB = sB.outfieldInnings + gsB.outfieldCount;
      return deficitA - deficitB;
    });

    const outfieldSlots: Position[] = [...OUTFIELD_POSITIONS];
    for (const pos of outfieldSlots) {
      const player = needOutfield.find((p) => {
        if (assignedIds.has(p.id)) return false;
        if (gamePositionCount(p.id, pos) >= rules.maxSamePositionInnings)
          return false;
        return true;
      });
      const fallback =
        player || needOutfield.find((p) => !assignedIds.has(p.id));
      if (fallback) {
        assignments.push({
          playerId: fallback.id,
          inning,
          position: pos,
        });
        assignedIds.add(fallback.id);
        const gs = playerGameStats.get(fallback.id)!;
        gs.fieldInnings++;
        gs.positions.push(pos);
        gs.positionCounts[pos] = (gs.positionCounts[pos] || 0) + 1;
        gs.outfieldCount++;
      }
    }

    // --- Update pitchedLastInning flag for next inning ---
    for (const p of availablePlayers) {
      const gs = playerGameStats.get(p.id)!;
      gs.pitchedLastInning =
        assignments.some(
          (a) =>
            a.playerId === p.id && a.inning === inning && a.position === "P"
        );
    }
  }

  // --- Generate Batting Order ---
  // Batting order continuity: rotate from where the last game left off
  let battingOrder: Player[];

  if (lastGameBattingOrder.length > 0) {
    // Find the last batter position from previous game
    const maxPos = Math.max(...lastGameBattingOrder.map((b) => b.order_position));
    // The player who batted last in the order
    const lastBatter = lastGameBattingOrder.find(
      (b) => b.order_position === maxPos
    );

    // Build order: start after last batter, cycling through
    // Only include players who are available this game
    const availableIds = new Set(availablePlayers.map((p) => p.id));
    const prevOrder = [...lastGameBattingOrder]
      .sort((a, b) => a.order_position - b.order_position)
      .filter((b) => availableIds.has(b.player_id));

    // Find index of last batter in sorted order
    const lastIdx = prevOrder.findIndex(
      (b) => b.player_id === lastBatter?.player_id
    );

    // Rotate: players after lastIdx come first, then wrap around
    const rotated: string[] = [];
    for (let i = 1; i <= prevOrder.length; i++) {
      const idx = (lastIdx + i) % prevOrder.length;
      rotated.push(prevOrder[idx].player_id);
    }

    // Add any new players (not in previous batting order) at the end
    const inRotation = new Set(rotated);
    for (const p of availablePlayers) {
      if (!inRotation.has(p.id)) {
        rotated.push(p.id);
      }
    }

    battingOrder = rotated
      .map((id) => availablePlayers.find((p) => p.id === id)!)
      .filter(Boolean);
  } else {
    // No previous game: sort by season avg batting position + batting rating
    battingOrder = [...availablePlayers].sort((a, b) => {
      const sA = stats.get(a.id)!;
      const sB = stats.get(b.id)!;

      // Players who have been batting later should bat earlier now
      const avgDiff = sB.avgBattingPosition - sA.avgBattingPosition;
      if (Math.abs(avgDiff) > 0.5) return avgDiff > 0 ? -1 : 1;

      // Tiebreak: batting rating
      return b.batting_rating - a.batting_rating;
    });
  }

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
