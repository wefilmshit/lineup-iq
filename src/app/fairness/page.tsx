"use client";

import { useMemo } from "react";
import { useTeam, usePlayers, useGames, useSeasonData } from "@/lib/hooks";
import { computeSeasonStats } from "@/lib/generate-lineup";
import {
  PlayerSeasonStats,
  Position,
  FIELD_POSITIONS,
} from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

  const loading =
    teamLoading || playersLoading || gamesLoading || seasonLoading;

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

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (stats.length === 0 || finalizedGames.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Fairness Dashboard</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {games.length > 0 && finalizedGames.length === 0
              ? "Finalize some games first to see fairness stats. You can finalize a game from its detail page."
              : "Play some games first to see fairness stats."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const maxInnings = Math.max(
    ...stats.map((s) => s.totalInnings + s.benchInnings)
  );
  const avgInnings =
    stats.reduce((sum, s) => sum + s.totalInnings, 0) / stats.length;
  const avgBench =
    stats.reduce((sum, s) => sum + s.benchInnings, 0) / stats.length;

  // Check for fairness issues
  function getFairnessFlags(s: PlayerSeasonStats): string[] {
    const flags: string[] = [];
    if (s.totalInnings < avgInnings - 2) flags.push("Low playing time");
    if (s.benchInnings > avgBench + 2) flags.push("High bench time");
    if (s.infieldInnings === 0 && s.totalInnings > 3) flags.push("No infield");
    if (s.outfieldInnings === 0 && s.totalInnings > 3)
      flags.push("No outfield");
    return flags;
  }

  const posColumns: (Position | "OUT")[] = [
    ...FIELD_POSITIONS,
    "BENCH",
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Fairness Dashboard</h1>
        <p className="text-muted-foreground">
          {finalizedGames.length} finalized game{finalizedGames.length !== 1 ? "s" : ""} — Avg{" "}
          {avgInnings.toFixed(1)} innings per player
        </p>
      </div>

      {/* Summary Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Innings Distribution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {stats.map((s) => {
            const flags = getFairnessFlags(s);
            return (
              <div key={s.playerId}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium w-24 truncate">
                      {s.playerName}
                    </span>
                    {s.gamesAbsent > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {s.gamesAbsent} absent
                      </Badge>
                    )}
                    {flags.map((f) => (
                      <Badge
                        key={f}
                        variant="destructive"
                        className="text-xs"
                      >
                        {f}
                      </Badge>
                    ))}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {s.totalInnings} played / {s.benchInnings} bench
                    {s.totalPitchCount > 0 && ` / ${s.totalPitchCount}p`}
                  </span>
                </div>
                <div className="flex h-6 rounded-md overflow-hidden bg-muted">
                  {s.infieldInnings > 0 && (
                    <div
                      className="bg-blue-500 flex items-center justify-center text-[10px] text-white font-medium"
                      style={{
                        width: `${(s.infieldInnings / maxInnings) * 100}%`,
                      }}
                    >
                      {s.infieldInnings > 0 ? `IF ${s.infieldInnings}` : ""}
                    </div>
                  )}
                  {s.outfieldInnings > 0 && (
                    <div
                      className="bg-green-500 flex items-center justify-center text-[10px] text-white font-medium"
                      style={{
                        width: `${(s.outfieldInnings / maxInnings) * 100}%`,
                      }}
                    >
                      {s.outfieldInnings > 0 ? `OF ${s.outfieldInnings}` : ""}
                    </div>
                  )}
                  {s.pitcherInnings > 0 && (
                    <div
                      className="bg-purple-500 flex items-center justify-center text-[10px] text-white font-medium"
                      style={{
                        width: `${(s.pitcherInnings / maxInnings) * 100}%`,
                      }}
                    >
                      {s.pitcherInnings > 0 ? `P ${s.pitcherInnings}` : ""}
                    </div>
                  )}
                  {s.catcherInnings > 0 && (
                    <div
                      className="bg-orange-500 flex items-center justify-center text-[10px] text-white font-medium"
                      style={{
                        width: `${(s.catcherInnings / maxInnings) * 100}%`,
                      }}
                    >
                      {s.catcherInnings > 0 ? `C ${s.catcherInnings}` : ""}
                    </div>
                  )}
                  {s.benchInnings > 0 && (
                    <div
                      className="bg-gray-400 flex items-center justify-center text-[10px] text-white font-medium"
                      style={{
                        width: `${(s.benchInnings / maxInnings) * 100}%`,
                      }}
                    >
                      {s.benchInnings > 0 ? `B ${s.benchInnings}` : ""}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex gap-4 text-sm flex-wrap">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-blue-500" />
          Infield
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-green-500" />
          Outfield
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-purple-500" />
          Pitcher
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-orange-500" />
          Catcher
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-gray-400" />
          Bench
        </div>
      </div>

      {/* Per-Position Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Position Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-2 sticky left-0 bg-background">
                  Player
                </th>
                {posColumns.map((pos) => (
                  <th
                    key={pos}
                    className="text-center py-2 px-1.5 font-medium text-xs"
                  >
                    {pos === "BENCH" ? "BN" : pos}
                  </th>
                ))}
                <th className="text-center py-2 px-1.5 font-medium text-xs">
                  ABS
                </th>
                <th className="text-center py-2 px-1.5 font-medium text-xs">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.playerId} className="border-b last:border-0">
                  <td className="py-2 pr-2 font-medium sticky left-0 bg-background">
                    {s.playerName}
                  </td>
                  {posColumns.map((pos) => {
                    const count = s.positionCounts[pos as Position] || 0;
                    return (
                      <td
                        key={pos}
                        className={`text-center py-2 px-1.5 tabular-nums ${
                          count === 0 ? "text-muted-foreground/30" : ""
                        }`}
                      >
                        {count || "·"}
                      </td>
                    );
                  })}
                  <td className="text-center py-2 px-1.5 tabular-nums text-muted-foreground">
                    {s.gamesAbsent || "·"}
                  </td>
                  <td className="text-center py-2 px-1.5 tabular-nums font-medium">
                    {s.totalInnings}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Batting Order Fairness */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Batting Order Fairness</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {(() => {
            const maxSlot = Math.max(
              ...stats.map((s) =>
                Math.max(...Object.keys(s.battingSlotCounts).map(Number), 0)
              ),
              players.length
            );
            const slots = Array.from({ length: maxSlot }, (_, i) => i + 1);
            // Average count per slot across all players for color coding
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
                  <tr className="border-b">
                    <th className="text-left py-2 pr-2 sticky left-0 bg-background">
                      Player
                    </th>
                    {slots.map((slot) => (
                      <th
                        key={slot}
                        className="text-center py-2 px-1.5 font-medium text-xs"
                      >
                        {slot}
                      </th>
                    ))}
                    <th className="text-center py-2 px-1.5 font-medium text-xs">
                      Avg
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...stats]
                    .filter((s) => s.avgBattingPosition > 0)
                    .sort(
                      (a, b) => a.avgBattingPosition - b.avgBattingPosition
                    )
                    .map((s) => (
                      <tr key={s.playerId} className="border-b last:border-0">
                        <td className="py-2 pr-2 font-medium sticky left-0 bg-background">
                          {s.playerName}
                        </td>
                        {slots.map((slot) => {
                          const count = s.battingSlotCounts[slot] || 0;
                          const avg = slotAvgs.get(slot) || 0;
                          const isHigh = count > 0 && count > avg + 1;
                          return (
                            <td
                              key={slot}
                              className={`text-center py-2 px-1.5 tabular-nums ${
                                count === 0
                                  ? "text-muted-foreground/30"
                                  : isHigh
                                  ? "text-orange-600 font-bold"
                                  : ""
                              }`}
                            >
                              {count || "\u00b7"}
                            </td>
                          );
                        })}
                        <td className="text-center py-2 px-1.5 tabular-nums font-medium text-muted-foreground">
                          {s.avgBattingPosition.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            );
          })()}
        </CardContent>
      </Card>

      {/* Batting Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Batting Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            {finalizedGames.length} of 13 games played
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-2 sticky left-0 bg-background">
                    Player
                  </th>
                  <th className="text-center py-2 px-2 font-medium text-xs">GP</th>
                  <th className="text-center py-2 px-2 font-medium text-xs">Abs</th>
                  <th className="text-center py-2 px-2 font-medium text-xs">Inn</th>
                  <th className="text-center py-2 px-2 font-medium text-xs">BN</th>
                  <th className="text-center py-2 px-2 font-medium text-xs">IF</th>
                  <th className="text-center py-2 px-2 font-medium text-xs">OF</th>
                  <th className="text-center py-2 px-2 font-medium text-xs">P</th>
                  <th className="text-center py-2 px-2 font-medium text-xs">C</th>
                  <th className="text-center py-2 px-2 font-medium text-xs">Avg Bat</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => {
                  const flags = getFairnessFlags(s);
                  return (
                    <tr
                      key={s.playerId}
                      className={`border-b last:border-0 ${
                        flags.length > 0 ? "bg-destructive/5" : ""
                      }`}
                    >
                      <td className="py-2 pr-2 font-medium sticky left-0 bg-background">
                        <div className="flex items-center gap-1">
                          {s.playerName}
                          {flags.length > 0 && (
                            <span className="text-destructive text-xs">!</span>
                          )}
                        </div>
                      </td>
                      <td className="text-center py-2 px-2 tabular-nums">{s.gamesPlayed}</td>
                      <td className="text-center py-2 px-2 tabular-nums text-muted-foreground">
                        {s.gamesAbsent || "\u00b7"}
                      </td>
                      <td className="text-center py-2 px-2 tabular-nums font-medium">{s.totalInnings}</td>
                      <td className="text-center py-2 px-2 tabular-nums text-muted-foreground">{s.benchInnings}</td>
                      <td className="text-center py-2 px-2 tabular-nums">{s.infieldInnings}</td>
                      <td className="text-center py-2 px-2 tabular-nums">{s.outfieldInnings}</td>
                      <td className="text-center py-2 px-2 tabular-nums">{s.pitcherInnings || "\u00b7"}</td>
                      <td className="text-center py-2 px-2 tabular-nums">{s.catcherInnings || "\u00b7"}</td>
                      <td className="text-center py-2 px-2 tabular-nums text-muted-foreground">
                        {s.avgBattingPosition > 0 ? s.avgBattingPosition.toFixed(1) : "\u00b7"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            GP = Games Played, Abs = Absent, Inn = Field Innings, BN = Bench,
            IF = Infield, OF = Outfield, P = Pitcher, C = Catcher, Avg Bat = Average Batting Slot
          </div>
        </CardContent>
      </Card>

      {/* Pitching Stats */}
      {stats.some((s) => s.totalPitchCount > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pitching Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats
                .filter((s) => s.pitcherInnings > 0)
                .sort((a, b) => b.pitcherInnings - a.pitcherInnings)
                .map((s) => (
                  <div
                    key={s.playerId}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm font-medium">{s.playerName}</span>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{s.pitcherInnings} inn</span>
                      <span>{s.totalPitchCount} pitches</span>
                      {s.pitcherInnings > 0 && (
                        <span>
                          {(s.totalPitchCount / s.pitcherInnings).toFixed(1)} p/inn
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
