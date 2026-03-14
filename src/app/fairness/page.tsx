"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTeam, usePlayers, useGames, useSeasonData } from "@/lib/hooks";
import { computeSeasonStats } from "@/lib/generate-lineup";
import {
  Player,
  PlayerSeasonStats,
  AtBat,
  Position,
  FIELD_POSITIONS,
} from "@/lib/types";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/* ═══════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════ */

interface FairnessScores {
  batting: number;
  field: number;
  bench: number;
  pitching: number;
  overall: number;
}

interface FairnessFlag {
  type: string;
  label: string;
  severity: "warning" | "critical";
  recommendation: string;
  category: string;
}

type PlayerStatus = "balanced" | "watch" | "needs-rotation";

interface PlayerEntry {
  stat: PlayerSeasonStats;
  player: Player | undefined;
  flags: FairnessFlag[];
  status: PlayerStatus;
  battingScore: number;
  fieldScore: number;
  benchScore: number;
  pitchScore: number;
}

/* ═══════════════════════════════════════════════════════
   SCORING HELPERS
   ═══════════════════════════════════════════════════════ */

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function computeFairnessScores(
  stats: PlayerSeasonStats[],
  players: Player[]
): FairnessScores {
  if (stats.length < 2)
    return { batting: 100, field: 100, bench: 100, pitching: 100, overall: 100 };

  // Only score players who have actually played at least 1 game
  const active = stats.filter((s) => s.gamesPlayed > 0);
  if (active.length < 2)
    return { batting: 100, field: 100, bench: 100, pitching: 100, overall: 100 };

  // Batting: CV of avgBattingPosition (already a per-game average)
  const battingAvgs = active
    .filter((s) => s.avgBattingPosition > 0)
    .map((s) => s.avgBattingPosition);
  const battingCV = coefficientOfVariation(battingAvgs);
  const batting = Math.max(0, Math.min(100, 100 - battingCV * 150));

  // Field: CV of infield ratio (already a ratio, immune to absence)
  const ifRatios = active
    .filter((s) => s.totalInnings > 0)
    .map((s) => {
      const fieldTime = s.infieldInnings + s.outfieldInnings;
      return fieldTime > 0 ? s.infieldInnings / fieldTime : 0.5;
    });
  const fieldCV = coefficientOfVariation(ifRatios);
  const field = Math.max(0, Math.min(100, 100 - fieldCV * 120));

  // Bench: CV of bench innings PER GAME PLAYED (normalizes for absences)
  const benchRates = active.map((s) => s.benchInnings / s.gamesPlayed);
  const benchCV = coefficientOfVariation(benchRates);
  const bench = Math.max(0, Math.min(100, 100 - benchCV * 100));

  // Pitching: CV of pitcher innings PER GAME PLAYED among eligible
  const eligiblePitchers = active.filter((s) => {
    const player = players.find((p) => p.id === s.playerId);
    return player?.can_pitch;
  });
  let pitching = 100;
  if (eligiblePitchers.length >= 2) {
    const pitchRates = eligiblePitchers.map((s) => s.pitcherInnings / s.gamesPlayed);
    const pitchCV = coefficientOfVariation(pitchRates);
    pitching = Math.max(0, Math.min(100, 100 - pitchCV * 80));
  }

  const overall = Math.round(
    batting * 0.25 + field * 0.3 + bench * 0.25 + pitching * 0.2
  );

  return {
    batting: Math.round(batting),
    field: Math.round(field),
    bench: Math.round(bench),
    pitching: Math.round(pitching),
    overall,
  };
}

function scoreColor(value: number): string {
  if (value >= 80) return "#2ECC71";
  if (value >= 60) return "#F59E0B";
  return "#DC2626";
}

function scoreBg(value: number): string {
  if (value >= 80) return "rgba(46, 204, 113, 0.08)";
  if (value >= 60) return "rgba(245, 158, 11, 0.08)";
  return "rgba(220, 38, 38, 0.08)";
}

function scoreSummary(score: number, flagCount: number): string {
  if (score >= 90) return "Excellent balance across the board.";
  if (score >= 80)
    return flagCount > 0
      ? `Good balance with ${flagCount} area${flagCount !== 1 ? "s" : ""} to watch.`
      : "Good balance with minor areas to watch.";
  if (score >= 60)
    return `Some imbalances need attention \u2014 ${flagCount} issue${flagCount !== 1 ? "s" : ""} flagged.`;
  return `Significant fairness gaps to address \u2014 ${flagCount} issue${flagCount !== 1 ? "s" : ""} flagged.`;
}

const FLAG_CATEGORIES: Record<string, { label: string; icon: string }> = {
  "playing-time": { label: "Playing Time", icon: "\u23f1" },
  "batting-order": { label: "Batting Order", icon: "\u2116" },
  "position-rotation": { label: "Position Rotation", icon: "\u21c4" },
  pitching: { label: "Pitching", icon: "\u26be" },
};

function getEnhancedFlags(
  s: PlayerSeasonStats,
  avgInningsPerGame: number,
  avgBenchPerGame: number,
  teamAvgBatting: number,
  player: Player | undefined,
  gameCount: number
): FairnessFlag[] {
  const flags: FairnessFlag[] = [];
  if (s.gamesPlayed < 1) return flags;

  // Compare per-game rates so absent players aren't penalized
  const playerInningsPerGame = s.totalInnings / s.gamesPlayed;
  const playerBenchPerGame = s.benchInnings / s.gamesPlayed;

  // Threshold: player's per-game field innings significantly below team per-game average
  if (playerInningsPerGame < avgInningsPerGame - 1.5)
    flags.push({
      type: "low-playing-time",
      label: "gets less field time per game",
      severity: "critical",
      recommendation: `Prioritize ${s.playerName} for field time`,
      category: "playing-time",
    });
  // Threshold: player's per-game bench time significantly above team per-game average
  if (playerBenchPerGame > avgBenchPerGame + 1.5)
    flags.push({
      type: "high-bench",
      label: "benches more per game than average",
      severity: "critical",
      recommendation: `Reduce bench time for ${s.playerName}`,
      category: "playing-time",
    });
  // Position rotation flags: use per-game thresholds (3 innings = ~1 game)
  const minInningsForRotation = s.gamesPlayed * 3;
  if (s.infieldInnings === 0 && s.totalInnings >= minInningsForRotation)
    flags.push({
      type: "no-infield",
      label: "hasn\u2019t played infield yet",
      severity: "warning",
      recommendation: `Give ${s.playerName} an infield start`,
      category: "position-rotation",
    });
  if (s.outfieldInnings === 0 && s.totalInnings >= minInningsForRotation)
    flags.push({
      type: "no-outfield",
      label: "hasn\u2019t played outfield yet",
      severity: "warning",
      recommendation: `Give ${s.playerName} an outfield rotation`,
      category: "position-rotation",
    });
  if (
    s.avgBattingPosition > 0 &&
    s.avgBattingPosition > teamAvgBatting + 2.5
  )
    flags.push({
      type: "batting-low",
      label: "has been batting too low in the order",
      severity: "warning",
      recommendation: `Move ${s.playerName} higher in the batting order`,
      category: "batting-order",
    });
  if (
    s.avgBattingPosition > 0 &&
    s.avgBattingPosition < teamAvgBatting - 2.5
  )
    flags.push({
      type: "batting-high",
      label: "has been batting too high in the order",
      severity: "warning",
      recommendation: `Move ${s.playerName} lower in the batting order`,
      category: "batting-order",
    });
  // Only flag no-pitching after the player has played 3+ games themselves
  if (player?.can_pitch && s.pitcherInnings === 0 && s.gamesPlayed >= 3)
    flags.push({
      type: "no-pitching",
      label: "hasn\u2019t pitched yet",
      severity: "warning",
      recommendation: `Consider ${s.playerName} for a pitching inning`,
      category: "pitching",
    });

  return flags;
}

function getPlayerMetricScores(
  s: PlayerSeasonStats,
  numPlayers: number,
  avgBenchPerGame: number,
  avgPitchingPerGame: number,
  canPitch: boolean
): { batting: number; field: number; bench: number; pitch: number } {
  // Batting: avgBattingPosition is already a per-game average — no change needed
  const midpoint = (numPlayers + 1) / 2;
  let batting = 100;
  if (s.avgBattingPosition > 0) {
    const dev = Math.abs(s.avgBattingPosition - midpoint) / midpoint;
    batting = Math.max(0, Math.min(100, 100 - dev * 150));
  }

  // Field: IF/OF ratio is immune to absence (it's a proportion of time played)
  const fieldTime = s.infieldInnings + s.outfieldInnings;
  let field = 100;
  if (fieldTime > 0) {
    const ifRatio = s.infieldInnings / fieldTime;
    const deviation = Math.abs(ifRatio - 0.5) * 2;
    field = Math.max(0, Math.min(100, 100 - deviation * 100));
  }

  // Bench: compare per-game bench rate against team per-game average
  let bench = 100;
  if (s.gamesPlayed > 0) {
    const playerBenchRate = s.benchInnings / s.gamesPlayed;
    if (avgBenchPerGame > 0) {
      const diff = (playerBenchRate - avgBenchPerGame) / Math.max(avgBenchPerGame, 0.5);
      bench = Math.max(0, Math.min(100, 100 - Math.abs(diff) * 80));
    } else if (playerBenchRate > 0) {
      bench = Math.max(0, 100 - playerBenchRate * 30);
    }
  }

  // Pitch: compare per-game pitch rate against team per-game average
  let pitch = 100;
  if (canPitch && s.gamesPlayed > 0) {
    const playerPitchRate = s.pitcherInnings / s.gamesPlayed;
    if (avgPitchingPerGame > 0) {
      const diff = (playerPitchRate - avgPitchingPerGame) / Math.max(avgPitchingPerGame, 0.5);
      pitch = Math.max(0, Math.min(100, 100 - Math.abs(diff) * 60));
    } else if (canPitch && s.pitcherInnings === 0) {
      pitch = 40;
    }
  }

  return {
    batting: Math.round(batting),
    field: Math.round(field),
    bench: Math.round(bench),
    pitch: Math.round(pitch),
  };
}

/* ═══════════════════════════════════════════════════════
   INLINE COMPONENTS
   ═══════════════════════════════════════════════════════ */

function MiniMeter({ value, label }: { value: number; label?: string }) {
  return (
    <div className="flex items-center gap-2 justify-center">
      {label && (
        <span className="text-[11px] text-[#94A3B8] font-medium w-3 shrink-0">
          {label}
        </span>
      )}
      <div className="w-[72px] h-[6px] rounded-full bg-[#E6ECF5]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${value}%`,
            backgroundColor: scoreColor(value),
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <span className="text-[11px] font-bold text-[#0B1F3A] tabular-nums w-5 text-right">
        {value}
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: PlayerStatus }) {
  const config: Record<PlayerStatus, { bg: string; text: string; label: string }> = {
    balanced: { bg: "bg-[#2ECC71]/10", text: "text-[#1B9C55]", label: "Balanced" },
    watch: { bg: "bg-[#F59E0B]/10", text: "text-[#B87708]", label: "Watch" },
    "needs-rotation": { bg: "bg-[#DC2626]/10", text: "text-[#DC2626]", label: "Needs Rotation" },
  };
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${c.bg} ${c.text}`}
    >
      {c.label}
    </span>
  );
}

/** Tiny SVG sparkline for fairness trend */
function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null;
  const w = 120;
  const h = 32;
  const pad = 4;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points.map((v, i) => ({
    x: pad + (i / (points.length - 1)) * (w - pad * 2),
    y: pad + (1 - (v - min) / range) * (h - pad * 2),
  }));
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  const last = coords[coords.length - 1];
  return (
    <svg width={w} height={h} className="shrink-0">
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="3" fill={color} />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════════ */

export default function FairnessPage() {
  const { team, loading: teamLoading } = useTeam();
  const { players, loading: playersLoading } = usePlayers(team?.id);
  const { games, loading: gamesLoading } = useGames(team?.id);
  const finalizedGames = useMemo(
    () =>
      games
        .filter((g) => g.is_finalized)
        .sort((a, b) => a.game_number - b.game_number),
    [games]
  );
  const {
    lineups,
    battingOrders,
    pitchingPlans,
    absences,
    loading: seasonLoading,
  } = useSeasonData(team?.id, true);

  const [atBats, setAtBats] = useState<AtBat[]>([]);
  const [atBatsLoading, setAtBatsLoading] = useState(true);

  const loadAtBats = useCallback(async () => {
    if (finalizedGames.length === 0) {
      setAtBats([]);
      setAtBatsLoading(false);
      return;
    }
    const gameIds = finalizedGames.map((g) => g.id);
    const { data } = await supabase
      .from("at_bats")
      .select("*")
      .in("game_id", gameIds);
    if (data) setAtBats(data as AtBat[]);
    setAtBatsLoading(false);
  }, [finalizedGames]);

  useEffect(() => {
    if (!gamesLoading) loadAtBats();
  }, [loadAtBats, gamesLoading]);

  const loading =
    teamLoading || playersLoading || gamesLoading || seasonLoading || atBatsLoading;

  const stats = useMemo(() => {
    if (players.length === 0) return [];
    const statsMap = computeSeasonStats(
      players, lineups, battingOrders, pitchingPlans, absences
    );
    return Array.from(statsMap.values()).sort(
      (a, b) => b.totalInnings - a.totalInnings
    );
  }, [players, lineups, battingOrders, pitchingPlans, absences]);

  const scores = useMemo(
    () => computeFairnessScores(stats, players),
    [stats, players]
  );

  /** Fairness trend — cumulative score after each finalized game */
  const trendPoints = useMemo(() => {
    if (finalizedGames.length < 2 || players.length === 0) return [];
    const points: number[] = [];
    for (let i = 0; i < finalizedGames.length; i++) {
      const gamesUpTo = finalizedGames.slice(0, i + 1);
      const gameIds = new Set(gamesUpTo.map((g) => g.id));
      const filteredLineups = lineups.filter((l) => gameIds.has(l.game_id));
      const filteredBatting = battingOrders.filter((b) => gameIds.has(b.game_id));
      const filteredPitching = pitchingPlans.filter((p) => gameIds.has(p.game_id));
      const filteredAbsences = absences.filter((a) => gameIds.has(a.game_id));
      const cumStats = Array.from(
        computeSeasonStats(
          players, filteredLineups, filteredBatting, filteredPitching, filteredAbsences
        ).values()
      );
      const cumScores = computeFairnessScores(cumStats, players);
      points.push(cumScores.overall);
    }
    return points;
  }, [finalizedGames, players, lineups, battingOrders, pitchingPlans, absences]);

  const playerEntries = useMemo((): PlayerEntry[] => {
    if (stats.length === 0) return [];
    // Use per-game-played rates so absent players aren't penalized
    const activePlayers = stats.filter((s) => s.gamesPlayed > 0);
    const avgInningsPerGame =
      activePlayers.length > 0
        ? activePlayers.reduce((sum, s) => sum + s.totalInnings / s.gamesPlayed, 0) / activePlayers.length
        : 0;
    const avgBenchPerGame =
      activePlayers.length > 0
        ? activePlayers.reduce((sum, s) => sum + s.benchInnings / s.gamesPlayed, 0) / activePlayers.length
        : 0;
    const battingPlayers = stats.filter((s) => s.avgBattingPosition > 0);
    const teamAvgBatting =
      battingPlayers.length > 0
        ? battingPlayers.reduce((sum, s) => sum + s.avgBattingPosition, 0) /
          battingPlayers.length
        : 0;
    const eligiblePitchers = activePlayers.filter((s) => {
      const p = players.find((pl) => pl.id === s.playerId);
      return p?.can_pitch;
    });
    const avgPitchingPerGame =
      eligiblePitchers.length > 0
        ? eligiblePitchers.reduce((sum, s) => sum + s.pitcherInnings / s.gamesPlayed, 0) /
          eligiblePitchers.length
        : 0;

    return stats
      .map((s) => {
        const player = players.find((p) => p.id === s.playerId);
        const flags = getEnhancedFlags(
          s, avgInningsPerGame, avgBenchPerGame, teamAvgBatting, player, finalizedGames.length
        );
        const status: PlayerStatus =
          flags.length === 0 ? "balanced" : flags.length === 1 ? "watch" : "needs-rotation";
        const m = getPlayerMetricScores(
          s, stats.length, avgBenchPerGame, avgPitchingPerGame, player?.can_pitch ?? false
        );
        return {
          stat: s, player, flags, status,
          battingScore: m.batting, fieldScore: m.field, benchScore: m.bench, pitchScore: m.pitch,
        };
      })
      .sort((a, b) => {
        const order: Record<PlayerStatus, number> = {
          "needs-rotation": 0, watch: 1, balanced: 2,
        };
        return order[a.status] - order[b.status] || a.stat.playerName.localeCompare(b.stat.playerName);
      });
  }, [stats, players, finalizedGames.length]);

  const allFlags = useMemo(
    () =>
      playerEntries.flatMap((e) =>
        e.flags.map((f) => ({ ...f, playerName: e.stat.playerName }))
      ),
    [playerEntries]
  );

  /** Flags grouped by category */
  const groupedFlags = useMemo(() => {
    const groups: Record<string, { playerName: string; label: string; severity: "warning" | "critical" }[]> = {};
    for (const f of allFlags) {
      if (!groups[f.category]) groups[f.category] = [];
      groups[f.category].push({ playerName: f.playerName, label: f.label, severity: f.severity });
    }
    // Sort categories: critical-containing groups first
    const sorted = Object.entries(groups).sort(([, a], [, b]) => {
      const aCrit = a.some((f) => f.severity === "critical") ? 0 : 1;
      const bCrit = b.some((f) => f.severity === "critical") ? 0 : 1;
      return aCrit - bCrit;
    });
    return sorted;
  }, [allFlags]);

  const recommendations = useMemo(() => {
    const recs: string[] = [];
    const seen = new Set<string>();
    for (const entry of playerEntries) {
      for (const flag of entry.flags) {
        if (!seen.has(flag.recommendation)) {
          seen.add(flag.recommendation);
          recs.push(flag.recommendation);
        }
      }
    }
    return recs.slice(0, 6);
  }, [playerEntries]);

  const maxPerColumn = useMemo(() => {
    if (stats.length === 0) return [1, 1, 1, 1, 1];
    return [
      Math.max(...stats.map((s) => s.pitcherInnings), 1),
      Math.max(...stats.map((s) => s.catcherInnings), 1),
      Math.max(...stats.map((s) => s.infieldInnings), 1),
      Math.max(...stats.map((s) => s.outfieldInnings), 1),
      Math.max(...stats.map((s) => s.benchInnings), 1),
    ];
  }, [stats]);

  /* ─── Loading & Empty States ──────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[#6B7280] text-sm">Loading fairness data...</div>
      </div>
    );
  }

  if (stats.length === 0 || finalizedGames.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-[28px] sm:text-4xl font-bold text-[#0B1F3A]">
          Fairness Dashboard
        </h1>
        <p className="text-[13px] text-[#94A3B8]">
          Tracking batting order, field positions, bench time, and pitching
          balance across the season.
        </p>
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm py-16 text-center">
          <div className="text-[#6B7280]">
            {games.length > 0 && finalizedGames.length === 0
              ? "Finalize some games first to see fairness stats. You can finalize a game from its detail page."
              : "Play some games first to see fairness stats."}
          </div>
        </div>
      </div>
    );
  }

  /* ─── Derived Values ──────────────────────────────── */

  const maxInnings = Math.max(...stats.map((s) => s.totalInnings + s.benchInnings));
  const avgInnings = stats.reduce((sum, s) => sum + s.totalInnings, 0) / stats.length;
  const posColumns: (Position | "BENCH")[] = [...FIELD_POSITIONS, "BENCH"];

  const RING_R = 54;
  const RING_CIRC = 2 * Math.PI * RING_R;

  const statusCounts = {
    balanced: playerEntries.filter((e) => e.status === "balanced").length,
    watch: playerEntries.filter((e) => e.status === "watch").length,
    needsRotation: playerEntries.filter((e) => e.status === "needs-rotation").length,
  };

  /* ═══════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════ */

  return (
    <div className="space-y-7">
      {/* ─── 1. Page Header ──────────────────────────── */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] sm:text-4xl font-bold text-[#0B1F3A] tracking-tight">
              Fairness Dashboard
            </h1>
            <p className="text-[#6B7280] text-sm sm:text-[15px] mt-1.5 leading-relaxed">
              {finalizedGames.length} finalized game
              {finalizedGames.length !== 1 ? "s" : ""}
              {team?.season ? ` \u00b7 ${team.season}` : ""} \u00b7{" "}
              {stats.length} players \u00b7 Avg{" "}
              {avgInnings.toFixed(1)} innings/player
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0 hidden sm:flex">
            <Link href="/fairness/print">Print Report</Link>
          </Button>
        </div>
        <p className="text-[13px] text-[#94A3B8] mt-1">
          Track batting order, field positions, bench time, and pitching balance so every player gets fair opportunities.
        </p>
      </div>

      {/* ─── 2. Hero Fairness Score ──────────────────── */}
      <div className="bg-white rounded-[20px] border border-[#E6ECF5] shadow-sm overflow-hidden">
        <div className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
            {/* Score Ring — larger, more prominent */}
            <div className="relative w-[132px] h-[132px] shrink-0">
              <svg className="w-[132px] h-[132px] -rotate-90" viewBox="0 0 132 132">
                <circle cx="66" cy="66" r={RING_R} fill="none" stroke="#E6ECF5" strokeWidth="10" />
                <circle
                  cx="66" cy="66" r={RING_R} fill="none"
                  stroke={scoreColor(scores.overall)}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRC}
                  strokeDashoffset={RING_CIRC * (1 - scores.overall / 100)}
                  style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[40px] font-extrabold text-[#0B1F3A] tabular-nums leading-none">
                  {scores.overall}
                </span>
                <span className="text-[13px] text-[#94A3B8] font-semibold mt-0.5">/100</span>
              </div>
            </div>

            {/* Right side: summary + sub-scores */}
            <div className="flex-1 text-center sm:text-left min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-[#0B1F3A] leading-snug">
                {scoreSummary(scores.overall, allFlags.length)}
              </h2>
              <p className="text-sm text-[#6B7280] mt-1 leading-relaxed">
                Playing time across {finalizedGames.length} game
                {finalizedGames.length !== 1 ? "s" : ""} with{" "}
                {stats.length} players.
                {statusCounts.needsRotation > 0 && (
                  <span className="text-[#DC2626] font-medium">
                    {" "}{statusCounts.needsRotation} player{statusCounts.needsRotation !== 1 ? "s" : ""} need rotation.
                  </span>
                )}
              </p>

              {/* Sparkline trend */}
              {trendPoints.length >= 2 && (
                <div className="flex items-center gap-2.5 mt-3 justify-center sm:justify-start">
                  <span className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">Trend</span>
                  <Sparkline points={trendPoints} color={scoreColor(scores.overall)} />
                  <div className="flex items-baseline gap-1">
                    {(() => {
                      const delta = trendPoints[trendPoints.length - 1] - trendPoints[0];
                      const isUp = delta > 0;
                      return (
                        <span className={`text-[12px] font-bold tabular-nums ${isUp ? "text-[#2ECC71]" : delta < 0 ? "text-[#DC2626]" : "text-[#6B7280]"}`}>
                          {isUp ? "+" : ""}{Math.round(delta)}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Sub-scores */}
              <div className="grid grid-cols-2 gap-x-5 gap-y-3 mt-4">
                {([
                  { label: "Batting", value: scores.batting },
                  { label: "Field Pos", value: scores.field },
                  { label: "Bench", value: scores.bench },
                  { label: "Pitching", value: scores.pitching },
                ] as const).map((sub) => (
                  <div key={sub.label} className="flex items-center gap-2.5">
                    <span className="text-[12px] font-semibold text-[#6B7280] w-[60px] shrink-0">{sub.label}</span>
                    <div className="flex-1 h-[6px] rounded-full bg-[#E6ECF5]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${sub.value}%`,
                          backgroundColor: scoreColor(sub.value),
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>
                    <span
                      className="text-[12px] font-bold tabular-nums w-7 text-right"
                      style={{ color: scoreColor(sub.value) }}
                    >
                      {sub.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 3. Summary Cards ────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          { label: "Batting", score: scores.batting, desc: "Order rotation equity", icon: "#" },
          { label: "Field Position", score: scores.field, desc: "IF / OF distribution", icon: "\u25c7" },
          { label: "Bench", score: scores.bench, desc: "Bench time fairness", icon: "\u23f1" },
          { label: "Pitching", score: scores.pitching, desc: "Mound time balance", icon: "\u26be" },
        ] as const).map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-[18px] border border-[#E6ECF5] p-4 shadow-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">
                {card.label}
              </span>
              <span className="text-sm opacity-40">{card.icon}</span>
            </div>
            <div
              className="text-[28px] font-extrabold tabular-nums leading-none"
              style={{ color: scoreColor(card.score) }}
            >
              {card.score}
            </div>
            <div className="h-[4px] rounded-full bg-[#E6ECF5] mt-2.5">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${card.score}%`,
                  backgroundColor: scoreColor(card.score),
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <div className="text-[11px] text-[#6B7280] mt-2">{card.desc}</div>
          </div>
        ))}
      </div>

      {/* ─── 4. Needs Attention — Grouped ────────────── */}
      {groupedFlags.length > 0 && (
        <div className="bg-white rounded-[20px] border border-[#E6ECF5] shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-2 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#0B1F3A]">Needs Attention</h2>
              <p className="text-[12px] text-[#94A3B8] mt-0.5">
                {allFlags.length} issue{allFlags.length !== 1 ? "s" : ""} across {groupedFlags.length} categor{groupedFlags.length !== 1 ? "ies" : "y"}
              </p>
            </div>
          </div>
          <div className="px-5 pb-5 space-y-4">
            {groupedFlags.map(([category, flags]) => {
              const cat = FLAG_CATEGORIES[category] || { label: category, icon: "\u26a0" };
              const hasCritical = flags.some((f) => f.severity === "critical");
              return (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">{cat.icon}</span>
                    <span className={`text-[12px] font-bold uppercase tracking-wider ${hasCritical ? "text-[#DC2626]" : "text-[#F59E0B]"}`}>
                      {cat.label}
                    </span>
                    <span className="text-[11px] text-[#94A3B8] font-medium">
                      ({flags.length})
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {flags.map((flag, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${
                          flag.severity === "critical"
                            ? "bg-[#DC2626]/[0.04] border-l-[3px] border-l-[#DC2626]"
                            : "bg-[#F59E0B]/[0.04] border-l-[3px] border-l-[#F59E0B]"
                        }`}
                      >
                        <span className="font-semibold text-[#0B1F3A]">{flag.playerName}</span>
                        <span className="text-[#6B7280]">{flag.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── 5. Player Fairness Breakdown ────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-[#0B1F3A]">Player Breakdown</h2>
          <div className="flex items-center gap-3 text-[11px] font-semibold">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#2ECC71]" />
              <span className="text-[#6B7280]">{statusCounts.balanced}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
              <span className="text-[#6B7280]">{statusCounts.watch}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#DC2626]" />
              <span className="text-[#6B7280]">{statusCounts.needsRotation}</span>
            </span>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block">
          <div className="bg-white rounded-[20px] border border-[#E6ECF5] shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F7F9FC] border-b border-[#E6ECF5]">
                  <th className="text-left pl-5 pr-3 py-3.5 text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider w-[220px]">
                    Player
                  </th>
                  <th className="text-center px-3 py-3.5 text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1">#<span className="hidden lg:inline">Batting</span></span>
                  </th>
                  <th className="text-center px-3 py-3.5 text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1">\u25c7<span className="hidden lg:inline">Field</span></span>
                  </th>
                  <th className="text-center px-3 py-3.5 text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1">\u23f1<span className="hidden lg:inline">Bench</span></span>
                  </th>
                  <th className="text-center px-3 py-3.5 text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1">\u26be<span className="hidden lg:inline">Pitch</span></span>
                  </th>
                  <th className="text-center pr-5 pl-3 py-3.5 text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider w-[130px]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {playerEntries.map((entry, idx) => (
                  <tr
                    key={entry.stat.playerId}
                    className={`border-b border-[#E6ECF5] last:border-b-0 transition-colors hover:bg-[#F7F9FC]/60 ${
                      idx % 2 !== 0 ? "bg-[#FAFBFD]" : ""
                    }`}
                  >
                    <td className="pl-5 pr-3 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#1E63E9] flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm">
                          {entry.player?.jersey_number ?? "\u2013"}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-[#0B1F3A] text-[14px] truncate">
                            {entry.stat.playerName}
                          </div>
                          <div className="text-[11px] text-[#94A3B8] leading-none mt-0.5">
                            {entry.stat.gamesPlayed} game{entry.stat.gamesPlayed !== 1 ? "s" : ""}
                            {entry.stat.gamesAbsent > 0 && (
                              <span> \u00b7 {entry.stat.gamesAbsent} absent</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5"><MiniMeter value={entry.battingScore} /></td>
                    <td className="px-3 py-3.5"><MiniMeter value={entry.fieldScore} /></td>
                    <td className="px-3 py-3.5"><MiniMeter value={entry.benchScore} /></td>
                    <td className="px-3 py-3.5"><MiniMeter value={entry.pitchScore} /></td>
                    <td className="pr-5 pl-3 py-3.5 text-center">
                      <StatusPill status={entry.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-2.5">
          {playerEntries.map((entry) => (
            <div
              key={entry.stat.playerId}
              className="bg-white rounded-[18px] border border-[#E6ECF5] px-4 py-3.5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#1E63E9] flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
                    {entry.player?.jersey_number ?? "\u2013"}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-[#0B1F3A] text-[15px] truncate">
                      {entry.stat.playerName}
                    </div>
                    <div className="text-[11px] text-[#94A3B8] leading-tight">
                      {entry.stat.gamesPlayed} game{entry.stat.gamesPlayed !== 1 ? "s" : ""}
                      {entry.stat.gamesAbsent > 0 && (
                        <span> \u00b7 {entry.stat.gamesAbsent} absent</span>
                      )}
                    </div>
                  </div>
                </div>
                <StatusPill status={entry.status} />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3">
                {([
                  { label: "Batting", value: entry.battingScore },
                  { label: "Field", value: entry.fieldScore },
                  { label: "Bench", value: entry.benchScore },
                  { label: "Pitch", value: entry.pitchScore },
                ] as const).map((m) => (
                  <div key={m.label} className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-[#94A3B8] w-10 shrink-0">{m.label}</span>
                    <div className="flex-1 h-[5px] rounded-full bg-[#E6ECF5]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${m.value}%`, backgroundColor: scoreColor(m.value) }}
                      />
                    </div>
                    <span className="text-[11px] font-bold text-[#0B1F3A] tabular-nums w-5 text-right">
                      {m.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── 6. Position Heatmap ─────────────────────── */}
      <div className="bg-white rounded-[20px] border border-[#E6ECF5] shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-2">
          <h2 className="text-lg font-bold text-[#0B1F3A]">Position Distribution</h2>
          <p className="text-[12px] text-[#94A3B8] mt-0.5">
            Darker cells = more innings at that position group
          </p>
        </div>
        <div className="px-4 pb-5 overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 360 }}>
            <thead>
              <tr>
                <th className="text-left py-2.5 pl-2 pr-3 text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider w-[130px]">
                  Player
                </th>
                {(["P", "C", "IF", "OF", "BN"] as const).map((col) => (
                  <th key={col} className="text-center py-2.5 px-1 text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">
                    {col}
                  </th>
                ))}
                <th className="text-center py-2.5 px-1 text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider">
                  Tot
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s, idx) => {
                const values = [
                  s.pitcherInnings, s.catcherInnings, s.infieldInnings, s.outfieldInnings, s.benchInnings,
                ];
                const total = s.totalInnings + s.benchInnings;
                return (
                  <tr
                    key={s.playerId}
                    className={`transition-colors hover:bg-[#F7F9FC]/80 ${idx % 2 !== 0 ? "bg-[#FAFBFD]" : ""}`}
                  >
                    <td className="py-2 pl-2 pr-3 font-semibold text-[#0B1F3A] text-[13px] whitespace-nowrap">
                      {s.playerName}
                    </td>
                    {values.map((count, i) => {
                      const maxForCol = maxPerColumn[i];
                      const intensity = maxForCol > 0 ? count / maxForCol : 0;
                      // Stronger tinting range for better visual weight
                      const alpha = count > 0 ? 0.07 + intensity * 0.22 : 0;
                      return (
                        <td
                          key={i}
                          className="text-center py-2 px-1"
                        >
                          <div
                            className="mx-auto rounded-md py-1 tabular-nums text-[13px] font-semibold"
                            style={{
                              backgroundColor: count > 0 ? `rgba(30, 99, 233, ${alpha})` : "transparent",
                              color: count === 0 ? "#CBD5E1" : intensity > 0.6 ? "#1E63E9" : "#0B1F3A",
                              width: 36,
                            }}
                          >
                            {count || "\u00b7"}
                          </div>
                        </td>
                      );
                    })}
                    <td className="text-center py-2 px-1 tabular-nums text-[13px] font-extrabold text-[#0B1F3A]">
                      {total}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── 7. Next Game Recommendations ────────────── */}
      {recommendations.length > 0 && (
        <div
          className="rounded-[20px] border shadow-sm overflow-hidden"
          style={{
            backgroundColor: "rgba(30, 99, 233, 0.03)",
            borderColor: "rgba(30, 99, 233, 0.12)",
          }}
        >
          <div className="px-5 pt-5 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-[#1E63E9]/10 flex items-center justify-center">
                <span className="text-[#1E63E9] text-xs font-bold">\u2192</span>
              </div>
              <h2 className="text-lg font-bold text-[#0B1F3A]">Next Game Recommendations</h2>
            </div>
            <p className="text-[12px] text-[#6B7280] mt-1 ml-8">
              Suggested lineup adjustments to improve fairness
            </p>
          </div>
          <ul className="px-5 pb-5 pt-2 space-y-2">
            {recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-3 text-sm ml-1">
                <span
                  className="mt-[7px] shrink-0 w-[7px] h-[7px] border-[2px] border-[#1E63E9] inline-block"
                  style={{ transform: "rotate(45deg)" }}
                />
                <span className="text-[#0B1F3A] leading-relaxed">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
         DETAILED DATA SECTIONS
         ═══════════════════════════════════════════════ */}

      {/* ─── Innings Distribution ────────────────────── */}
      <div className="bg-white rounded-[20px] border border-[#E6ECF5] shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-2">
          <h2 className="text-lg font-bold text-[#0B1F3A]">Innings Distribution</h2>
          <p className="text-[12px] text-[#94A3B8] mt-0.5">
            Position type breakdown per player
          </p>
        </div>
        {/* Legend — above chart for context */}
        <div className="flex gap-4 text-[11px] flex-wrap px-5 pb-3">
          {[
            { label: "Infield", color: "#1E63E9" },
            { label: "Outfield", color: "#2ECC71" },
            { label: "Pitcher", color: "#8B5CF6" },
            { label: "Catcher", color: "#F59E0B" },
            { label: "Bench", color: "#94A3B8" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: item.color }} />
              <span className="text-[#6B7280] font-medium">{item.label}</span>
            </div>
          ))}
        </div>
        <div className="px-5 pb-5 space-y-2.5">
          {stats.map((s) => (
            <div key={s.playerId}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] font-semibold text-[#0B1F3A] w-28 truncate">
                  {s.playerName}
                </span>
                <span className="text-[11px] text-[#94A3B8] tabular-nums font-medium">
                  {s.totalInnings} played{s.benchInnings > 0 ? ` \u00b7 ${s.benchInnings} bench` : ""}
                  {s.totalPitchCount > 0 && ` \u00b7 ${s.totalPitchCount}p`}
                </span>
              </div>
              <div className="flex h-[18px] rounded-lg overflow-hidden bg-[#E6ECF5]">
                {s.infieldInnings > 0 && (
                  <div
                    className="bg-[#1E63E9] flex items-center justify-center text-[9px] text-white font-bold"
                    style={{ width: `${(s.infieldInnings / maxInnings) * 100}%` }}
                  >
                    {s.infieldInnings > 1 ? `IF ${s.infieldInnings}` : ""}
                  </div>
                )}
                {s.outfieldInnings > 0 && (
                  <div
                    className="bg-[#2ECC71] flex items-center justify-center text-[9px] text-white font-bold"
                    style={{ width: `${(s.outfieldInnings / maxInnings) * 100}%` }}
                  >
                    {s.outfieldInnings > 1 ? `OF ${s.outfieldInnings}` : ""}
                  </div>
                )}
                {s.pitcherInnings > 0 && (
                  <div
                    className="bg-[#8B5CF6] flex items-center justify-center text-[9px] text-white font-bold"
                    style={{ width: `${(s.pitcherInnings / maxInnings) * 100}%` }}
                  >
                    {s.pitcherInnings > 0 ? `P ${s.pitcherInnings}` : ""}
                  </div>
                )}
                {s.catcherInnings > 0 && (
                  <div
                    className="bg-[#F59E0B] flex items-center justify-center text-[9px] text-white font-bold"
                    style={{ width: `${(s.catcherInnings / maxInnings) * 100}%` }}
                  >
                    {s.catcherInnings > 0 ? `C ${s.catcherInnings}` : ""}
                  </div>
                )}
                {s.benchInnings > 0 && (
                  <div
                    className="bg-[#94A3B8] flex items-center justify-center text-[9px] text-white font-bold"
                    style={{ width: `${(s.benchInnings / maxInnings) * 100}%` }}
                  >
                    {s.benchInnings > 0 ? `B ${s.benchInnings}` : ""}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Position Breakdown Table ────────────────── */}
      <div className="bg-white rounded-[20px] border border-[#E6ECF5] shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-2">
          <h2 className="text-lg font-bold text-[#0B1F3A]">Position Breakdown</h2>
          <p className="text-[12px] text-[#94A3B8] mt-0.5">Innings at each position</p>
        </div>
        <div className="px-4 pb-5 overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 520 }}>
            <thead>
              <tr className="border-b-2 border-[#E6ECF5]">
                <th className="text-left py-2.5 pl-2 pr-2 text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider sticky left-0 bg-white z-10">
                  Player
                </th>
                {posColumns.map((pos) => (
                  <th key={pos} className="text-center py-2.5 px-1 text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">
                    {pos === "BENCH" ? "BN" : pos}
                  </th>
                ))}
                <th className="text-center py-2.5 px-1 text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">ABS</th>
                <th className="text-center py-2.5 px-1 text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s, idx) => (
                <tr
                  key={s.playerId}
                  className={`border-b border-[#E6ECF5] last:border-b-0 transition-colors hover:bg-[#F7F9FC]/80 ${idx % 2 !== 0 ? "bg-[#FAFBFD]" : ""}`}
                >
                  <td className="py-2.5 pl-2 pr-2 font-semibold text-[#0B1F3A] text-[13px] sticky left-0 bg-inherit whitespace-nowrap z-10">
                    {s.playerName}
                  </td>
                  {posColumns.map((pos) => {
                    const count = s.positionCounts[pos as Position] || 0;
                    return (
                      <td
                        key={pos}
                        className={`text-center py-2.5 px-1 tabular-nums text-[13px] ${
                          count === 0 ? "text-[#D1D5DB]" : "text-[#0B1F3A] font-medium"
                        }`}
                      >
                        {count || "\u00b7"}
                      </td>
                    );
                  })}
                  <td className="text-center py-2.5 px-1 tabular-nums text-[13px] text-[#94A3B8]">
                    {s.gamesAbsent || "\u00b7"}
                  </td>
                  <td className="text-center py-2.5 px-1 tabular-nums text-[13px] font-extrabold text-[#0B1F3A]">
                    {s.totalInnings}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Batting Order Fairness ──────────────────── */}
      <div className="bg-white rounded-[20px] border border-[#E6ECF5] shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-2">
          <h2 className="text-lg font-bold text-[#0B1F3A]">Batting Order Fairness</h2>
          <p className="text-[12px] text-[#94A3B8] mt-0.5">
            Times each player batted in each slot
          </p>
        </div>
        <div className="px-4 pb-5 overflow-x-auto">
          {(() => {
            const maxSlot = Math.max(
              ...stats.map((s) =>
                Math.max(...Object.keys(s.battingSlotCounts).map(Number), 0)
              ),
              players.length
            );
            const slots = Array.from({ length: maxSlot }, (_, i) => i + 1);
            const slotAvgs = new Map<number, number>();
            for (const slot of slots) {
              const total = stats.reduce(
                (sum, s) => sum + (s.battingSlotCounts[slot] || 0), 0
              );
              slotAvgs.set(slot, total / stats.length);
            }
            const midpoint = (maxSlot + 1) / 2;
            return (
              <table className="w-full text-sm" style={{ minWidth: 400 }}>
                <thead>
                  <tr className="border-b-2 border-[#E6ECF5]">
                    <th className="text-left py-2.5 pl-2 pr-2 text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider sticky left-0 bg-white z-10">
                      Player
                    </th>
                    {slots.map((slot) => (
                      <th key={slot} className="text-center py-2.5 px-1 text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">
                        {slot}
                      </th>
                    ))}
                    <th className="text-center py-2.5 px-1 text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider">
                      Avg
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...stats]
                    .filter((s) => s.avgBattingPosition > 0)
                    .sort((a, b) => a.avgBattingPosition - b.avgBattingPosition)
                    .map((s, idx) => {
                      // Avg column color: good = near midpoint, bad = far from midpoint
                      const avgDev = Math.abs(s.avgBattingPosition - midpoint) / midpoint;
                      const avgColor = avgDev < 0.15 ? "#2ECC71" : avgDev < 0.35 ? "#F59E0B" : "#DC2626";
                      return (
                        <tr
                          key={s.playerId}
                          className={`border-b border-[#E6ECF5] last:border-b-0 transition-colors hover:bg-[#F7F9FC]/80 ${idx % 2 !== 0 ? "bg-[#FAFBFD]" : ""}`}
                        >
                          <td className="py-2.5 pl-2 pr-2 font-semibold text-[#0B1F3A] text-[13px] sticky left-0 bg-inherit whitespace-nowrap z-10">
                            {s.playerName}
                          </td>
                          {slots.map((slot) => {
                            const count = s.battingSlotCounts[slot] || 0;
                            const avg = slotAvgs.get(slot) || 0;
                            const isHigh = count > 0 && count > avg + 1;
                            return (
                              <td
                                key={slot}
                                className={`text-center py-2.5 px-1 tabular-nums text-[13px] ${
                                  count === 0
                                    ? "text-[#D1D5DB]"
                                    : isHigh
                                    ? "text-[#F59E0B] font-bold"
                                    : "text-[#0B1F3A] font-medium"
                                }`}
                              >
                                {count || "\u00b7"}
                              </td>
                            );
                          })}
                          <td className="text-center py-2.5 px-2 tabular-nums text-[13px] font-bold" style={{ color: avgColor }}>
                            {s.avgBattingPosition.toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>

      {/* ─── Batting Stats ───────────────────────────── */}
      <div className="bg-white rounded-[20px] border border-[#E6ECF5] shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-2">
          <h2 className="text-lg font-bold text-[#0B1F3A]">Batting Stats</h2>
          <p className="text-[12px] text-[#94A3B8] mt-0.5">
            Hits across {finalizedGames.length} finalized game
            {finalizedGames.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="px-5 pb-5 space-y-2">
          {(() => {
            const hitsByPlayer = new Map<string, number>();
            for (const ab of atBats) {
              hitsByPlayer.set(ab.player_id, (hitsByPlayer.get(ab.player_id) || 0) + 1);
            }
            const totalTeamHits = atBats.length;
            const playerHits = stats
              .map((s) => ({ ...s, hits: hitsByPlayer.get(s.playerId) || 0 }))
              .sort((a, b) => b.hits - a.hits);
            const maxHits = Math.max(...playerHits.map((p) => p.hits), 1);

            return (
              <>
                {playerHits.map((p) => (
                  <div key={p.playerId} className="flex items-center gap-3">
                    <span className="text-[13px] font-semibold text-[#0B1F3A] w-28 truncate">
                      {p.playerName}
                    </span>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 h-[14px] rounded-md overflow-hidden bg-[#E6ECF5]">
                        {p.hits > 0 && (
                          <div
                            className="h-full bg-[#2ECC71] rounded-md flex items-center justify-center text-[9px] text-white font-bold"
                            style={{ width: `${Math.max((p.hits / maxHits) * 100, 14)}%` }}
                          >
                            {p.hits}
                          </div>
                        )}
                      </div>
                      <span className="text-[13px] font-bold tabular-nums w-7 text-right text-[#0B1F3A]">
                        {p.hits}
                      </span>
                    </div>
                  </div>
                ))}
                {totalTeamHits > 0 && (
                  <div className="pt-2 border-t border-[#E6ECF5] text-[13px] text-[#6B7280] font-medium">
                    Team total: {totalTeamHits} hit{totalTeamHits !== 1 ? "s" : ""}
                  </div>
                )}
                {totalTeamHits === 0 && (
                  <p className="text-[13px] text-[#6B7280]">
                    No hits recorded yet. Use the Hit Tracker during games.
                  </p>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* ─── Pitching Stats ──────────────────────────── */}
      {stats.some((s) => s.totalPitchCount > 0) && (
        <div className="bg-white rounded-[20px] border border-[#E6ECF5] shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-2">
            <h2 className="text-lg font-bold text-[#0B1F3A]">Pitching Stats</h2>
            <p className="text-[12px] text-[#94A3B8] mt-0.5">
              Innings, pitch counts, and efficiency
            </p>
          </div>
          <div className="px-5 pb-5 space-y-1.5">
            {stats
              .filter((s) => s.pitcherInnings > 0)
              .sort((a, b) => b.pitcherInnings - a.pitcherInnings)
              .map((s) => (
                <div
                  key={s.playerId}
                  className="flex items-center justify-between py-2 border-b border-[#E6ECF5] last:border-b-0"
                >
                  <span className="text-[13px] font-semibold text-[#0B1F3A]">{s.playerName}</span>
                  <div className="flex items-center gap-4 text-[12px] text-[#6B7280] font-medium tabular-nums">
                    <span>{s.pitcherInnings} inn</span>
                    <span>{s.totalPitchCount} pitches</span>
                    {s.pitcherInnings > 0 && (
                      <span>{(s.totalPitchCount / s.pitcherInnings).toFixed(1)} p/inn</span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
