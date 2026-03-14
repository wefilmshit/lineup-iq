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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  // Batting: CV of avgBattingPosition (exclude players who never batted)
  const battingAvgs = stats
    .filter((s) => s.avgBattingPosition > 0)
    .map((s) => s.avgBattingPosition);
  const battingCV = coefficientOfVariation(battingAvgs);
  const batting = Math.max(0, Math.min(100, 100 - battingCV * 150));

  // Field: CV of infield ratio
  const ifRatios = stats
    .filter((s) => s.totalInnings > 0)
    .map((s) => {
      const fieldTime = s.infieldInnings + s.outfieldInnings;
      return fieldTime > 0 ? s.infieldInnings / fieldTime : 0.5;
    });
  const fieldCV = coefficientOfVariation(ifRatios);
  const field = Math.max(0, Math.min(100, 100 - fieldCV * 120));

  // Bench: CV of benchInnings
  const benchValues = stats.map((s) => s.benchInnings);
  const benchCV = coefficientOfVariation(benchValues);
  const bench = Math.max(0, Math.min(100, 100 - benchCV * 100));

  // Pitching: CV among eligible pitchers
  const eligiblePitchers = stats.filter((s) => {
    const player = players.find((p) => p.id === s.playerId);
    return player?.can_pitch;
  });
  let pitching = 100;
  if (eligiblePitchers.length >= 2) {
    const pitchValues = eligiblePitchers.map((s) => s.pitcherInnings);
    const pitchCV = coefficientOfVariation(pitchValues);
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

function getEnhancedFlags(
  s: PlayerSeasonStats,
  avgInnings: number,
  avgBench: number,
  teamAvgBatting: number,
  player: Player | undefined,
  gameCount: number
): FairnessFlag[] {
  const flags: FairnessFlag[] = [];
  if (s.gamesPlayed < 1) return flags;

  if (s.totalInnings < avgInnings - 2)
    flags.push({
      type: "low-playing-time",
      label: "has low playing time",
      severity: "critical",
      recommendation: `Prioritize ${s.playerName} for field time`,
    });
  if (s.benchInnings > avgBench + 2)
    flags.push({
      type: "high-bench",
      label: "has high bench time",
      severity: "critical",
      recommendation: `Reduce bench time for ${s.playerName}`,
    });
  if (s.infieldInnings === 0 && s.totalInnings > 3)
    flags.push({
      type: "no-infield",
      label: "hasn\u2019t played infield yet",
      severity: "warning",
      recommendation: `Give ${s.playerName} an infield start`,
    });
  if (s.outfieldInnings === 0 && s.totalInnings > 3)
    flags.push({
      type: "no-outfield",
      label: "hasn\u2019t played outfield yet",
      severity: "warning",
      recommendation: `Give ${s.playerName} an outfield rotation`,
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
    });
  if (
    player?.can_pitch &&
    s.pitcherInnings === 0 &&
    gameCount >= 3
  )
    flags.push({
      type: "no-pitching",
      label: "hasn\u2019t pitched yet",
      severity: "warning",
      recommendation: `Consider ${s.playerName} for a pitching inning`,
    });

  return flags;
}

function getPlayerMetricScores(
  s: PlayerSeasonStats,
  numPlayers: number,
  avgBench: number,
  avgPitching: number,
  canPitch: boolean
): { batting: number; field: number; bench: number; pitch: number } {
  // Batting: distance from ideal midpoint
  const midpoint = (numPlayers + 1) / 2;
  let batting = 100;
  if (s.avgBattingPosition > 0) {
    const dev = Math.abs(s.avgBattingPosition - midpoint) / midpoint;
    batting = Math.max(0, Math.min(100, 100 - dev * 150));
  }

  // Field: IF/OF balance (ideal 50/50)
  const fieldTime = s.infieldInnings + s.outfieldInnings;
  let field = 100;
  if (fieldTime > 0) {
    const ifRatio = s.infieldInnings / fieldTime;
    const deviation = Math.abs(ifRatio - 0.5) * 2;
    field = Math.max(0, Math.min(100, 100 - deviation * 100));
  }

  // Bench: how close to average
  let bench = 100;
  if (avgBench > 0) {
    const diff = (s.benchInnings - avgBench) / Math.max(avgBench, 1);
    bench = Math.max(0, Math.min(100, 100 - Math.abs(diff) * 80));
  } else if (s.benchInnings > 0) {
    bench = Math.max(0, 100 - s.benchInnings * 20);
  }

  // Pitch: only for eligible pitchers
  let pitch = 100;
  if (canPitch && avgPitching > 0) {
    const diff = (s.pitcherInnings - avgPitching) / Math.max(avgPitching, 1);
    pitch = Math.max(0, Math.min(100, 100 - Math.abs(diff) * 60));
  } else if (canPitch && s.pitcherInnings === 0) {
    pitch = 40; // hasn't pitched yet
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

function MiniMeter({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1.5 justify-center">
      <div className="w-16 h-2 rounded-full bg-[#E2E8F0]">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${value}%`,
            backgroundColor: scoreColor(value),
          }}
        />
      </div>
      <span className="text-xs font-semibold text-[#0B1F3A] tabular-nums w-5 text-right">
        {value}
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: PlayerStatus }) {
  const styles: Record<PlayerStatus, string> = {
    balanced: "bg-[#2ECC71]/10 text-[#1B9C55] border-[#2ECC71]/20",
    watch: "bg-[#F59E0B]/10 text-[#B87708] border-[#F59E0B]/20",
    "needs-rotation": "bg-[#DC2626]/10 text-[#DC2626] border-[#DC2626]/20",
  };
  const labels: Record<PlayerStatus, string> = {
    balanced: "Balanced",
    watch: "Watch",
    "needs-rotation": "Needs Rotation",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide border ${styles[status]}`}
    >
      {labels[status]}
    </span>
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
    () => games.filter((g) => g.is_finalized),
    [games]
  );
  const {
    lineups,
    battingOrders,
    pitchingPlans,
    absences,
    loading: seasonLoading,
  } = useSeasonData(team?.id, true);

  // Fetch at_bats for finalized games
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
    teamLoading ||
    playersLoading ||
    gamesLoading ||
    seasonLoading ||
    atBatsLoading;

  const stats = useMemo(() => {
    if (players.length === 0) return [];
    const statsMap = computeSeasonStats(
      players,
      lineups,
      battingOrders,
      pitchingPlans,
      absences
    );
    return Array.from(statsMap.values()).sort(
      (a, b) => b.totalInnings - a.totalInnings
    );
  }, [players, lineups, battingOrders, pitchingPlans, absences]);

  /* ─── Computed Scores & Entries ──────────────────── */

  const scores = useMemo(
    () => computeFairnessScores(stats, players),
    [stats, players]
  );

  const playerEntries = useMemo((): PlayerEntry[] => {
    if (stats.length === 0) return [];
    const avgInnings =
      stats.reduce((sum, s) => sum + s.totalInnings, 0) / stats.length;
    const avgBench =
      stats.reduce((sum, s) => sum + s.benchInnings, 0) / stats.length;
    const battingPlayers = stats.filter((s) => s.avgBattingPosition > 0);
    const teamAvgBatting =
      battingPlayers.length > 0
        ? battingPlayers.reduce((sum, s) => sum + s.avgBattingPosition, 0) /
          battingPlayers.length
        : 0;
    const eligiblePitchers = stats.filter((s) => {
      const p = players.find((pl) => pl.id === s.playerId);
      return p?.can_pitch;
    });
    const avgPitching =
      eligiblePitchers.length > 0
        ? eligiblePitchers.reduce((sum, s) => sum + s.pitcherInnings, 0) /
          eligiblePitchers.length
        : 0;

    return stats
      .map((s) => {
        const player = players.find((p) => p.id === s.playerId);
        const flags = getEnhancedFlags(
          s,
          avgInnings,
          avgBench,
          teamAvgBatting,
          player,
          finalizedGames.length
        );
        const status: PlayerStatus =
          flags.length === 0
            ? "balanced"
            : flags.length === 1
            ? "watch"
            : "needs-rotation";
        const metricScores = getPlayerMetricScores(
          s,
          stats.length,
          avgBench,
          avgPitching,
          player?.can_pitch ?? false
        );
        return {
          stat: s,
          player,
          flags,
          status,
          battingScore: metricScores.batting,
          fieldScore: metricScores.field,
          benchScore: metricScores.bench,
          pitchScore: metricScores.pitch,
        };
      })
      .sort((a, b) => {
        const order: Record<PlayerStatus, number> = {
          "needs-rotation": 0,
          watch: 1,
          balanced: 2,
        };
        return (
          order[a.status] - order[b.status] ||
          a.stat.playerName.localeCompare(b.stat.playerName)
        );
      });
  }, [stats, players, finalizedGames.length]);

  const allFlags = useMemo(
    () =>
      playerEntries
        .flatMap((e) =>
          e.flags.map((f) => ({ ...f, playerName: e.stat.playerName }))
        )
        .sort((a, b) =>
          a.severity === "critical" && b.severity !== "critical" ? -1 : 1
        ),
    [playerEntries]
  );

  const recommendations = useMemo(() => {
    const recs: string[] = [];
    // Collect unique recommendations, critical first
    const seen = new Set<string>();
    for (const entry of playerEntries) {
      for (const flag of entry.flags) {
        if (!seen.has(flag.recommendation)) {
          seen.add(flag.recommendation);
          recs.push(flag.recommendation);
        }
      }
    }
    return recs.slice(0, 5);
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

  /* ─── Derived Values for Existing Sections ────────── */

  const maxInnings = Math.max(
    ...stats.map((s) => s.totalInnings + s.benchInnings)
  );
  const avgInnings =
    stats.reduce((sum, s) => sum + s.totalInnings, 0) / stats.length;

  const posColumns: (Position | "BENCH")[] = [...FIELD_POSITIONS, "BENCH"];

  /* ─── SVG Progress Ring Constants ─────────────────── */
  const RING_R = 48;
  const RING_CIRC = 2 * Math.PI * RING_R;

  /* ═══════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════ */

  return (
    <div className="space-y-6">
      {/* ─── 1. Page Header ──────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] sm:text-4xl font-bold text-[#0B1F3A]">
            Fairness Dashboard
          </h1>
          <p className="text-[#6B7280] text-sm sm:text-base mt-1">
            {finalizedGames.length} finalized game
            {finalizedGames.length !== 1 ? "s" : ""}
            {team?.season ? ` \u00b7 ${team.season}` : ""} \u00b7 Avg{" "}
            {avgInnings.toFixed(1)} innings per player
          </p>
          <p className="text-[13px] text-[#94A3B8] mt-0.5">
            Tracking batting order, field positions, bench time, and pitching
            balance across the season.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href="/fairness/print">Print Report</Link>
        </Button>
      </div>

      {/* ─── 2. Hero Fairness Score ──────────────────── */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Score Ring */}
          <div className="relative w-28 h-28 shrink-0">
            <svg
              className="w-28 h-28 -rotate-90"
              viewBox="0 0 112 112"
            >
              <circle
                cx="56"
                cy="56"
                r={RING_R}
                fill="none"
                stroke="#E2E8F0"
                strokeWidth="8"
              />
              <circle
                cx="56"
                cy="56"
                r={RING_R}
                fill="none"
                stroke={scoreColor(scores.overall)}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={RING_CIRC}
                strokeDashoffset={RING_CIRC * (1 - scores.overall / 100)}
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-[#0B1F3A] tabular-nums">
                {scores.overall}
              </span>
              <span className="text-xs text-[#6B7280] font-medium -mt-0.5">
                /100
              </span>
            </div>
          </div>

          {/* Summary + Sub-scores */}
          <div className="flex-1 text-center sm:text-left min-w-0">
            <p className="text-base font-semibold text-[#0B1F3A]">
              {scoreSummary(scores.overall, allFlags.length)}
            </p>
            <p className="text-sm text-[#6B7280] mt-0.5">
              Playing time across {finalizedGames.length} game
              {finalizedGames.length !== 1 ? "s" : ""} with{" "}
              {stats.length} players.
            </p>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 mt-4">
              {(
                [
                  { label: "Batting", value: scores.batting },
                  { label: "Field Pos", value: scores.field },
                  { label: "Bench", value: scores.bench },
                  { label: "Pitching", value: scores.pitching },
                ] as const
              ).map((sub) => (
                <div key={sub.label} className="flex items-center gap-2">
                  <span className="text-xs text-[#6B7280] w-14 shrink-0">
                    {sub.label}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-[#E2E8F0]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${sub.value}%`,
                        backgroundColor: scoreColor(sub.value),
                      }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-[#0B1F3A] w-6 text-right tabular-nums">
                    {sub.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── 3. Summary Cards ────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {(
          [
            {
              label: "Batting",
              score: scores.batting,
              desc: "Order rotation equity",
            },
            {
              label: "Field Position",
              score: scores.field,
              desc: "IF/OF distribution",
            },
            {
              label: "Bench",
              score: scores.bench,
              desc: "Bench time fairness",
            },
            {
              label: "Pitching",
              score: scores.pitching,
              desc: "Mound time balance",
            },
          ] as const
        ).map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-2xl border border-[#E2E8F0] px-4 py-3.5 text-center shadow-sm"
          >
            <div
              className="text-2xl font-bold tabular-nums"
              style={{ color: scoreColor(card.score) }}
            >
              {card.score}
            </div>
            <div className="text-xs font-semibold text-[#0B1F3A] mt-0.5 uppercase tracking-wide">
              {card.label}
            </div>
            <div className="text-[11px] text-[#6B7280] mt-0.5">
              {card.desc}
            </div>
          </div>
        ))}
      </div>

      {/* ─── 4. Rotation Alerts ──────────────────────── */}
      {allFlags.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-1">
            <h2 className="text-lg font-bold text-[#0B1F3A]">
              Needs Attention
            </h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              {allFlags.length} fairness issue
              {allFlags.length !== 1 ? "s" : ""} detected
            </p>
          </div>
          <div className="px-5 pb-5 pt-3 space-y-2">
            {allFlags.slice(0, 8).map((flag, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 px-3 py-2.5 rounded-xl ${
                  flag.severity === "critical"
                    ? "border-l-4 border-l-[#DC2626] bg-[#DC2626]/5"
                    : "border-l-4 border-l-[#F59E0B] bg-[#F59E0B]/5"
                }`}
              >
                <span className="text-sm leading-snug">
                  <span className="font-semibold text-[#0B1F3A]">
                    {flag.playerName}
                  </span>{" "}
                  <span className="text-[#6B7280]">{flag.label}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── 5. Player Fairness Breakdown ────────────── */}
      <div>
        <h2 className="text-lg font-bold text-[#0B1F3A] mb-3">
          Player Breakdown
        </h2>

        {/* Desktop Table */}
        <div className="hidden md:block">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F7F9FC] border-b border-[#E2E8F0]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#6B7280] uppercase tracking-wider w-[220px]">
                    Player
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                    Batting
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                    Field
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                    Bench
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                    Pitch
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-[#6B7280] uppercase tracking-wider w-[130px]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {playerEntries.map((entry, idx) => (
                  <tr
                    key={entry.stat.playerId}
                    className={`border-b border-[#E2E8F0] last:border-b-0 ${
                      idx % 2 !== 0 ? "bg-[#FAFBFD]" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#1E63E9] flex items-center justify-center text-white font-bold text-xs shrink-0">
                          {entry.player?.jersey_number ?? "\u2013"}
                        </div>
                        <div>
                          <span className="font-semibold text-[#0B1F3A] text-sm">
                            {entry.stat.playerName}
                          </span>
                          {entry.stat.gamesAbsent > 0 && (
                            <span className="text-[11px] text-[#94A3B8] ml-1.5">
                              ({entry.stat.gamesAbsent} absent)
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <MiniMeter value={entry.battingScore} />
                    </td>
                    <td className="px-3 py-3">
                      <MiniMeter value={entry.fieldScore} />
                    </td>
                    <td className="px-3 py-3">
                      <MiniMeter value={entry.benchScore} />
                    </td>
                    <td className="px-3 py-3">
                      <MiniMeter value={entry.pitchScore} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <StatusPill status={entry.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-3">
          {playerEntries.map((entry) => (
            <div
              key={entry.stat.playerId}
              className="bg-white rounded-2xl border border-[#E2E8F0] px-3.5 py-3 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-[#1E63E9] flex items-center justify-center text-white font-bold text-xs shrink-0">
                    {entry.player?.jersey_number ?? "\u2013"}
                  </div>
                  <div>
                    <span className="font-semibold text-[#0B1F3A] text-[15px]">
                      {entry.stat.playerName}
                    </span>
                    {entry.stat.gamesAbsent > 0 && (
                      <div className="text-[11px] text-[#94A3B8]">
                        {entry.stat.gamesAbsent} game
                        {entry.stat.gamesAbsent !== 1 ? "s" : ""} absent
                      </div>
                    )}
                  </div>
                </div>
                <StatusPill status={entry.status} />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mt-3">
                {(
                  [
                    { label: "Batting", value: entry.battingScore },
                    { label: "Field", value: entry.fieldScore },
                    { label: "Bench", value: entry.benchScore },
                    { label: "Pitch", value: entry.pitchScore },
                  ] as const
                ).map((m) => (
                  <div key={m.label} className="flex items-center gap-2">
                    <span className="text-xs text-[#6B7280] w-11 shrink-0">
                      {m.label}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-[#E2E8F0]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${m.value}%`,
                          backgroundColor: scoreColor(m.value),
                        }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-[#0B1F3A] tabular-nums w-5 text-right">
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
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-1">
          <h2 className="text-lg font-bold text-[#0B1F3A]">
            Position Distribution
          </h2>
          <p className="text-xs text-[#6B7280] mt-0.5">
            Innings per position group
          </p>
        </div>
        <div className="px-5 pb-5 pt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[#E2E8F0]">
                <th className="text-left py-2 pr-3 text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                  Player
                </th>
                {(["P", "C", "IF", "OF", "BN"] as const).map((col) => (
                  <th
                    key={col}
                    className="text-center py-2 px-3 text-xs font-semibold text-[#6B7280] uppercase tracking-wider w-14"
                  >
                    {col}
                  </th>
                ))}
                <th className="text-center py-2 px-3 text-xs font-semibold text-[#6B7280] uppercase tracking-wider w-14">
                  Tot
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => {
                const values = [
                  s.pitcherInnings,
                  s.catcherInnings,
                  s.infieldInnings,
                  s.outfieldInnings,
                  s.benchInnings,
                ];
                const total = s.totalInnings + s.benchInnings;
                return (
                  <tr
                    key={s.playerId}
                    className="border-b border-[#E2E8F0] last:border-b-0"
                  >
                    <td className="py-2.5 pr-3 font-medium text-[#0B1F3A] text-sm whitespace-nowrap">
                      {s.playerName}
                    </td>
                    {values.map((count, i) => {
                      const maxForCol = maxPerColumn[i];
                      const intensity =
                        maxForCol > 0 ? count / maxForCol : 0;
                      return (
                        <td
                          key={i}
                          className="text-center py-2.5 px-3 tabular-nums text-sm font-medium rounded-sm"
                          style={{
                            backgroundColor:
                              count > 0
                                ? `rgba(30, 99, 233, ${
                                    0.06 + intensity * 0.18
                                  })`
                                : "transparent",
                            color: count === 0 ? "#CBD5E1" : "#0B1F3A",
                          }}
                        >
                          {count || "\u00b7"}
                        </td>
                      );
                    })}
                    <td className="text-center py-2.5 px-3 tabular-nums text-sm font-bold text-[#0B1F3A]">
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
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-1">
            <h2 className="text-lg font-bold text-[#0B1F3A]">
              Next Game Recommendations
            </h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Suggested adjustments to improve fairness
            </p>
          </div>
          <ul className="px-5 pb-5 pt-3 space-y-2.5">
            {recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span
                  className="mt-1.5 shrink-0 w-2 h-2 border-2 border-[#1E63E9] inline-block"
                  style={{ transform: "rotate(45deg)" }}
                />
                <span className="text-[#0B1F3A]">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
         DETAILED SECTIONS (existing, retained below)
         ═══════════════════════════════════════════════ */}

      {/* ─── Innings Distribution ────────────────────── */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-1">
          <h2 className="text-lg font-bold text-[#0B1F3A]">
            Innings Distribution
          </h2>
          <p className="text-xs text-[#6B7280] mt-0.5">
            Breakdown by position type per player
          </p>
        </div>
        <div className="px-5 pb-5 pt-3 space-y-3">
          {stats.map((s) => (
            <div key={s.playerId}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-[#0B1F3A] w-24 truncate">
                  {s.playerName}
                </span>
                <span className="text-xs text-[#6B7280] tabular-nums">
                  {s.totalInnings} played / {s.benchInnings} bench
                  {s.totalPitchCount > 0 && ` / ${s.totalPitchCount}p`}
                </span>
              </div>
              <div className="flex h-5 rounded-lg overflow-hidden bg-[#E2E8F0]">
                {s.infieldInnings > 0 && (
                  <div
                    className="bg-[#1E63E9] flex items-center justify-center text-[10px] text-white font-medium"
                    style={{
                      width: `${(s.infieldInnings / maxInnings) * 100}%`,
                    }}
                  >
                    {s.infieldInnings > 1 ? `IF ${s.infieldInnings}` : ""}
                  </div>
                )}
                {s.outfieldInnings > 0 && (
                  <div
                    className="bg-[#2ECC71] flex items-center justify-center text-[10px] text-white font-medium"
                    style={{
                      width: `${(s.outfieldInnings / maxInnings) * 100}%`,
                    }}
                  >
                    {s.outfieldInnings > 1 ? `OF ${s.outfieldInnings}` : ""}
                  </div>
                )}
                {s.pitcherInnings > 0 && (
                  <div
                    className="bg-[#8B5CF6] flex items-center justify-center text-[10px] text-white font-medium"
                    style={{
                      width: `${(s.pitcherInnings / maxInnings) * 100}%`,
                    }}
                  >
                    {s.pitcherInnings > 0 ? `P ${s.pitcherInnings}` : ""}
                  </div>
                )}
                {s.catcherInnings > 0 && (
                  <div
                    className="bg-[#F59E0B] flex items-center justify-center text-[10px] text-white font-medium"
                    style={{
                      width: `${(s.catcherInnings / maxInnings) * 100}%`,
                    }}
                  >
                    {s.catcherInnings > 0 ? `C ${s.catcherInnings}` : ""}
                  </div>
                )}
                {s.benchInnings > 0 && (
                  <div
                    className="bg-[#94A3B8] flex items-center justify-center text-[10px] text-white font-medium"
                    style={{
                      width: `${(s.benchInnings / maxInnings) * 100}%`,
                    }}
                  >
                    {s.benchInnings > 0 ? `B ${s.benchInnings}` : ""}
                  </div>
                )}
              </div>
            </div>
          ))}
          {/* Legend */}
          <div className="flex gap-4 text-xs flex-wrap pt-2 border-t border-[#E2E8F0]">
            {[
              { label: "Infield", color: "#1E63E9" },
              { label: "Outfield", color: "#2ECC71" },
              { label: "Pitcher", color: "#8B5CF6" },
              { label: "Catcher", color: "#F59E0B" },
              { label: "Bench", color: "#94A3B8" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-[#6B7280]">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Position Breakdown Table ────────────────── */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-1">
          <h2 className="text-lg font-bold text-[#0B1F3A]">
            Position Breakdown
          </h2>
          <p className="text-xs text-[#6B7280] mt-0.5">
            Count of innings at each position
          </p>
        </div>
        <div className="px-5 pb-5 pt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[#E2E8F0]">
                <th className="text-left py-2 pr-2 text-xs font-semibold text-[#6B7280] uppercase tracking-wider sticky left-0 bg-white">
                  Player
                </th>
                {posColumns.map((pos) => (
                  <th
                    key={pos}
                    className="text-center py-2 px-1.5 text-xs font-semibold text-[#6B7280] uppercase tracking-wider"
                  >
                    {pos === "BENCH" ? "BN" : pos}
                  </th>
                ))}
                <th className="text-center py-2 px-1.5 text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                  ABS
                </th>
                <th className="text-center py-2 px-1.5 text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr
                  key={s.playerId}
                  className="border-b border-[#E2E8F0] last:border-b-0"
                >
                  <td className="py-2 pr-2 font-medium text-[#0B1F3A] sticky left-0 bg-white whitespace-nowrap">
                    {s.playerName}
                  </td>
                  {posColumns.map((pos) => {
                    const count =
                      s.positionCounts[pos as Position] || 0;
                    return (
                      <td
                        key={pos}
                        className={`text-center py-2 px-1.5 tabular-nums ${
                          count === 0
                            ? "text-[#CBD5E1]"
                            : "text-[#0B1F3A]"
                        }`}
                      >
                        {count || "\u00b7"}
                      </td>
                    );
                  })}
                  <td className="text-center py-2 px-1.5 tabular-nums text-[#94A3B8]">
                    {s.gamesAbsent || "\u00b7"}
                  </td>
                  <td className="text-center py-2 px-1.5 tabular-nums font-bold text-[#0B1F3A]">
                    {s.totalInnings}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Batting Order Fairness ──────────────────── */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-1">
          <h2 className="text-lg font-bold text-[#0B1F3A]">
            Batting Order Fairness
          </h2>
          <p className="text-xs text-[#6B7280] mt-0.5">
            Times each player batted in each slot
          </p>
        </div>
        <div className="px-5 pb-5 pt-3 overflow-x-auto">
          {(() => {
            const maxSlot = Math.max(
              ...stats.map((s) =>
                Math.max(
                  ...Object.keys(s.battingSlotCounts).map(Number),
                  0
                )
              ),
              players.length
            );
            const slots = Array.from(
              { length: maxSlot },
              (_, i) => i + 1
            );
            const slotAvgs = new Map<number, number>();
            for (const slot of slots) {
              const total = stats.reduce(
                (sum, s) => sum + (s.battingSlotCounts[slot] || 0),
                0
              );
              slotAvgs.set(slot, total / stats.length);
            }
            return (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-[#E2E8F0]">
                    <th className="text-left py-2 pr-2 text-xs font-semibold text-[#6B7280] uppercase tracking-wider sticky left-0 bg-white">
                      Player
                    </th>
                    {slots.map((slot) => (
                      <th
                        key={slot}
                        className="text-center py-2 px-1.5 text-xs font-semibold text-[#6B7280] uppercase tracking-wider"
                      >
                        {slot}
                      </th>
                    ))}
                    <th className="text-center py-2 px-1.5 text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                      Avg
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...stats]
                    .filter((s) => s.avgBattingPosition > 0)
                    .sort(
                      (a, b) =>
                        a.avgBattingPosition - b.avgBattingPosition
                    )
                    .map((s) => (
                      <tr
                        key={s.playerId}
                        className="border-b border-[#E2E8F0] last:border-b-0"
                      >
                        <td className="py-2 pr-2 font-medium text-[#0B1F3A] sticky left-0 bg-white whitespace-nowrap">
                          {s.playerName}
                        </td>
                        {slots.map((slot) => {
                          const count =
                            s.battingSlotCounts[slot] || 0;
                          const avg = slotAvgs.get(slot) || 0;
                          const isHigh =
                            count > 0 && count > avg + 1;
                          return (
                            <td
                              key={slot}
                              className={`text-center py-2 px-1.5 tabular-nums ${
                                count === 0
                                  ? "text-[#CBD5E1]"
                                  : isHigh
                                  ? "text-[#F59E0B] font-bold"
                                  : "text-[#0B1F3A]"
                              }`}
                            >
                              {count || "\u00b7"}
                            </td>
                          );
                        })}
                        <td className="text-center py-2 px-1.5 tabular-nums font-medium text-[#6B7280]">
                          {s.avgBattingPosition.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>

      {/* ─── Batting Stats ───────────────────────────── */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-1">
          <h2 className="text-lg font-bold text-[#0B1F3A]">Batting Stats</h2>
          <p className="text-xs text-[#6B7280] mt-0.5">
            Hits across {finalizedGames.length} finalized game
            {finalizedGames.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="px-5 pb-5 pt-3">
          {(() => {
            const hitsByPlayer = new Map<string, number>();
            for (const ab of atBats) {
              hitsByPlayer.set(
                ab.player_id,
                (hitsByPlayer.get(ab.player_id) || 0) + 1
              );
            }
            const totalTeamHits = atBats.length;

            const playerHits = stats
              .map((s) => ({
                ...s,
                hits: hitsByPlayer.get(s.playerId) || 0,
              }))
              .sort((a, b) => b.hits - a.hits);

            const maxHits = Math.max(
              ...playerHits.map((p) => p.hits),
              1
            );

            return (
              <div className="space-y-2">
                {playerHits.map((p) => (
                  <div
                    key={p.playerId}
                    className="flex items-center gap-3"
                  >
                    <span className="text-sm font-medium text-[#0B1F3A] w-24 truncate">
                      {p.playerName}
                    </span>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 h-4 rounded-md overflow-hidden bg-[#E2E8F0]">
                        {p.hits > 0 && (
                          <div
                            className="h-full bg-[#2ECC71] rounded-md flex items-center justify-center text-[10px] text-white font-medium"
                            style={{
                              width: `${Math.max(
                                (p.hits / maxHits) * 100,
                                12
                              )}%`,
                            }}
                          >
                            {p.hits}
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-bold tabular-nums w-8 text-right text-[#0B1F3A]">
                        {p.hits}
                      </span>
                    </div>
                  </div>
                ))}
                {totalTeamHits > 0 && (
                  <div className="pt-2 border-t border-[#E2E8F0] text-sm text-[#6B7280]">
                    Team total: {totalTeamHits} hit
                    {totalTeamHits !== 1 ? "s" : ""}
                  </div>
                )}
                {totalTeamHits === 0 && (
                  <p className="text-sm text-[#6B7280]">
                    No hits recorded yet. Use the Hit Tracker during
                    games.
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ─── Pitching Stats ──────────────────────────── */}
      {stats.some((s) => s.totalPitchCount > 0) && (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-1">
            <h2 className="text-lg font-bold text-[#0B1F3A]">
              Pitching Stats
            </h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Innings, pitch counts, and efficiency
            </p>
          </div>
          <div className="px-5 pb-5 pt-3 space-y-2">
            {stats
              .filter((s) => s.pitcherInnings > 0)
              .sort((a, b) => b.pitcherInnings - a.pitcherInnings)
              .map((s) => (
                <div
                  key={s.playerId}
                  className="flex items-center justify-between py-1.5"
                >
                  <span className="text-sm font-medium text-[#0B1F3A]">
                    {s.playerName}
                  </span>
                  <div className="flex items-center gap-4 text-sm text-[#6B7280]">
                    <span className="tabular-nums">
                      {s.pitcherInnings} inn
                    </span>
                    <span className="tabular-nums">
                      {s.totalPitchCount} pitches
                    </span>
                    {s.pitcherInnings > 0 && (
                      <span className="tabular-nums">
                        {(
                          s.totalPitchCount / s.pitcherInnings
                        ).toFixed(1)}{" "}
                        p/inn
                      </span>
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
