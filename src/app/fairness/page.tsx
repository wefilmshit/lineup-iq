"use client";

import { useMemo } from "react";
import { useTeam, usePlayers, useGames, useSeasonData } from "@/lib/hooks";
import { computeSeasonStats } from "@/lib/generate-lineup";
import { PlayerSeasonStats } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function FairnessPage() {
  const { team, loading: teamLoading } = useTeam();
  const { players, loading: playersLoading } = usePlayers(team?.id);
  const { games, loading: gamesLoading } = useGames(team?.id);
  const {
    lineups,
    battingOrders,
    loading: seasonLoading,
  } = useSeasonData(team?.id);

  const loading = teamLoading || playersLoading || gamesLoading || seasonLoading;

  const stats = useMemo(() => {
    if (players.length === 0) return [];
    const statsMap = computeSeasonStats(players, lineups, battingOrders);
    return Array.from(statsMap.values()).sort(
      (a, b) => b.totalInnings - a.totalInnings
    );
  }, [players, lineups, battingOrders]);

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (stats.length === 0 || games.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Fairness Dashboard</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Play some games first to see fairness stats.
          </CardContent>
        </Card>
      </div>
    );
  }

  const maxInnings = Math.max(...stats.map((s) => s.totalInnings + s.benchInnings));
  const avgInnings =
    stats.reduce((sum, s) => sum + s.totalInnings, 0) / stats.length;
  const avgBench =
    stats.reduce((sum, s) => sum + s.benchInnings, 0) / stats.length;

  // Check for fairness issues
  function getFairnessFlags(s: PlayerSeasonStats): string[] {
    const flags: string[] = [];
    if (s.totalInnings < avgInnings - 2)
      flags.push("Low playing time");
    if (s.benchInnings > avgBench + 2)
      flags.push("High bench time");
    if (s.infieldInnings === 0 && s.totalInnings > 3)
      flags.push("No infield");
    if (s.outfieldInnings === 0 && s.totalInnings > 3)
      flags.push("No outfield");
    return flags;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Fairness Dashboard</h1>
        <p className="text-muted-foreground">
          {games.length} game{games.length !== 1 ? "s" : ""} played — Avg{" "}
          {avgInnings.toFixed(1)} innings per player
        </p>
      </div>

      {/* Innings Played Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Total Innings Played</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {stats.map((s) => {
            const total = s.totalInnings + s.benchInnings;
            const flags = getFairnessFlags(s);
            return (
              <div key={s.playerId}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium w-24 truncate">
                      {s.playerName}
                    </span>
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
      <div className="flex gap-4 text-sm">
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

      {/* Batting Order Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Average Batting Order Position
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...stats]
              .filter((s) => s.avgBattingPosition > 0)
              .sort((a, b) => a.avgBattingPosition - b.avgBattingPosition)
              .map((s) => (
                <div
                  key={s.playerId}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm font-medium">{s.playerName}</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-4 bg-primary/20 rounded"
                      style={{
                        width: `${(s.avgBattingPosition / players.length) * 200}px`,
                      }}
                    />
                    <span className="text-sm text-muted-foreground w-8 text-right">
                      {s.avgBattingPosition.toFixed(1)}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Stats Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detailed Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Player</th>
                <th className="text-center py-2">Games</th>
                <th className="text-center py-2">Played</th>
                <th className="text-center py-2">IF</th>
                <th className="text-center py-2">OF</th>
                <th className="text-center py-2">P</th>
                <th className="text-center py-2">C</th>
                <th className="text-center py-2">Bench</th>
                <th className="text-center py-2">Avg Bat</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.playerId} className="border-b last:border-0">
                  <td className="py-2 font-medium">{s.playerName}</td>
                  <td className="text-center py-2">{s.gamesPlayed}</td>
                  <td className="text-center py-2 font-medium">
                    {s.totalInnings}
                  </td>
                  <td className="text-center py-2">{s.infieldInnings}</td>
                  <td className="text-center py-2">{s.outfieldInnings}</td>
                  <td className="text-center py-2">{s.pitcherInnings}</td>
                  <td className="text-center py-2">{s.catcherInnings}</td>
                  <td className="text-center py-2">{s.benchInnings}</td>
                  <td className="text-center py-2">
                    {s.avgBattingPosition > 0
                      ? s.avgBattingPosition.toFixed(1)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
