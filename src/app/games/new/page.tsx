"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useTeam, usePlayers, useGames, useSeasonData } from "@/lib/hooks";
import { generateLineup } from "@/lib/generate-lineup";
import {
  Player,
  Position,
  FIELD_POSITIONS,
  LeagueRules,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function NewGamePage() {
  const router = useRouter();
  const { team, loading: teamLoading } = useTeam();
  const { players, loading: playersLoading } = usePlayers(team?.id);
  const { games, loading: gamesLoading } = useGames(team?.id);
  const {
    lineups: seasonLineups,
    battingOrders: seasonBattingOrders,
    pitchingPlans: seasonPitchingPlans,
    absences: seasonAbsences,
    loading: seasonLoading,
  } = useSeasonData(team?.id);

  const [opponent, setOpponent] = useState("");
  const [gameDate, setGameDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [availableIds, setAvailableIds] = useState<Set<string>>(new Set());
  const [absentIds, setAbsentIds] = useState<Set<string>>(new Set());
  const [generated, setGenerated] = useState<ReturnType<
    typeof generateLineup
  > | null>(null);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Initialize available players once loaded
  if (!initialized && players.length > 0) {
    setAvailableIds(new Set(players.filter((p) => p.active).map((p) => p.id)));
    setInitialized(true);
  }

  const loading =
    teamLoading || playersLoading || gamesLoading || seasonLoading;

  const availablePlayers = useMemo(
    () => players.filter((p) => availableIds.has(p.id) && !absentIds.has(p.id)),
    [players, availableIds, absentIds]
  );

  const playerMap = useMemo(() => {
    const m = new Map<string, Player>();
    players.forEach((p) => m.set(p.id, p));
    return m;
  }, [players]);

  const innings = team?.innings_per_game ?? 4;

  // Get the last game's batting order + pitch counts for continuity
  const lastGame = useMemo(() => {
    if (!games || games.length === 0) return null;
    return games[games.length - 1];
  }, [games]);

  const lastGameBattingOrder = useMemo(() => {
    if (!lastGame) return [];
    return seasonBattingOrders.filter((b) => b.game_id === lastGame.id);
  }, [lastGame, seasonBattingOrders]);

  const previousGamePitchCounts = useMemo(() => {
    if (!lastGame) return [];
    return seasonPitchingPlans.filter((p) => p.game_id === lastGame.id);
  }, [lastGame, seasonPitchingPlans]);

  function togglePlayer(id: string) {
    setAvailableIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setGenerated(null);
  }

  function toggleAbsent(id: string) {
    setAbsentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setGenerated(null);
  }

  function handleGenerate() {
    if (availablePlayers.length < 2) {
      toast.error("Need at least 2 available players");
      return;
    }
    if (!team) return;

    const rules: LeagueRules = {
      maxPitchInningsPerGame: team.max_pitch_innings_per_game,
      maxPitchesPerGame: team.max_pitches_per_game,
      pitchRestThreshold: team.pitch_rest_threshold,
      maxSamePositionInnings: team.max_same_position_innings,
      requireInfieldInning: team.require_infield_inning,
    };

    const gameNumber = (games?.length ?? 0) + 1;

    const result = generateLineup({
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
    });
    setGenerated(result);
    toast.success("Lineup generated!");
  }

  // Swap pitcher for a specific inning
  function swapPitcher(inning: number, newPitcherId: string) {
    if (!generated) return;

    const newPositions = [...generated.positions];

    // Find the current pitcher for this inning
    const currentPitcherIdx = newPositions.findIndex(
      (a) => a.inning === inning && a.position === "P"
    );
    // Find where the new pitcher is currently assigned this inning
    const newPitcherIdx = newPositions.findIndex(
      (a) => a.inning === inning && a.playerId === newPitcherId
    );

    if (currentPitcherIdx === -1 || newPitcherIdx === -1) return;

    // Swap: old pitcher gets new pitcher's old position, new pitcher becomes P
    const oldPitcherPos = newPositions[newPitcherIdx].position;
    newPositions[currentPitcherIdx] = {
      ...newPositions[currentPitcherIdx],
      position: oldPitcherPos,
    };
    newPositions[newPitcherIdx] = {
      ...newPositions[newPitcherIdx],
      position: "P",
    };

    // Update pitching plan
    const newPitchingPlan = newPositions
      .filter((a) => a.position === "P")
      .map((a) => ({ playerId: a.playerId, inning: a.inning }));

    setGenerated({
      ...generated,
      positions: newPositions,
      pitchingPlan: newPitchingPlan,
    });
  }

  // Build the position grid from generated lineup
  function getPlayerAtPosition(inning: number, position: Position): string {
    if (!generated) return "";
    const assignment = generated.positions.find(
      (a) => a.inning === inning && a.position === position
    );
    if (!assignment) return "";
    return playerMap.get(assignment.playerId)?.name ?? "";
  }

  // Get bench players for an inning
  function getBenchPlayers(inning: number): string[] {
    if (!generated) return [];
    return generated.positions
      .filter((a) => a.inning === inning && a.position === "BENCH")
      .map((a) => playerMap.get(a.playerId)?.name ?? "");
  }

  async function handleSave() {
    if (!team || !generated) return;
    setSaving(true);

    const gameNumber = (games?.length ?? 0) + 1;

    // Create game
    const { data: game, error: gameError } = await supabase
      .from("games")
      .insert({
        team_id: team.id,
        game_number: gameNumber,
        date: gameDate || null,
        opponent: opponent || null,
        innings,
        planned_innings: innings,
      })
      .select()
      .single();

    if (gameError || !game) {
      toast.error("Failed to save game");
      setSaving(false);
      return;
    }

    // Save absences
    if (absentIds.size > 0) {
      const absenceRows = Array.from(absentIds).map((pid) => ({
        game_id: game.id,
        player_id: pid,
      }));
      await supabase.from("game_absences").insert(absenceRows);
    }

    // Save lineups
    const lineupRows = generated.positions.map((a) => ({
      game_id: game.id,
      player_id: a.playerId,
      inning: a.inning,
      position: a.position,
    }));

    const { error: lineupError } = await supabase
      .from("game_lineups")
      .insert(lineupRows);

    if (lineupError) {
      toast.error("Failed to save lineup positions");
      setSaving(false);
      return;
    }

    // Save batting order
    const battingRows = generated.battingOrder.map((b) => ({
      game_id: game.id,
      player_id: b.playerId,
      order_position: b.orderPosition,
    }));

    const { error: battingError } = await supabase
      .from("batting_orders")
      .insert(battingRows);

    if (battingError) {
      toast.error("Failed to save batting order");
      setSaving(false);
      return;
    }

    // Save pitching plan
    if (generated.pitchingPlan.length > 0) {
      const pitchingRows = generated.pitchingPlan.map((pp) => ({
        game_id: game.id,
        player_id: pp.playerId,
        inning: pp.inning,
        pitch_count: 0,
      }));

      await supabase.from("pitching_plans").insert(pitchingRows);
    }

    toast.success(`Game ${gameNumber} saved!`);
    router.push(`/games/${game.id}`);
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (players.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">New Game</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Add players to your roster first before generating a lineup.
            <div className="mt-4">
              <Button onClick={() => router.push("/roster")}>
                Go to Roster
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        New Game (#{(games?.length ?? 0) + 1})
      </h1>

      {/* Game Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Game Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Opponent</Label>
              <Input
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                placeholder="Team name"
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={gameDate}
                onChange={(e) => setGameDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Available Players + Absences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Available Players ({availablePlayers.length} of {players.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {players.map((p) => {
              const isAbsent = absentIds.has(p.id);
              const isAvailable = availableIds.has(p.id) && !isAbsent;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 p-2 rounded-md border transition-colors ${
                    isAbsent
                      ? "bg-destructive/10 border-destructive/30"
                      : isAvailable
                      ? "bg-primary/5 border-primary/30"
                      : "bg-muted/50 border-transparent opacity-50"
                  }`}
                >
                  <Checkbox
                    checked={isAvailable}
                    onCheckedChange={() => {
                      if (isAbsent) {
                        toggleAbsent(p.id);
                      } else {
                        togglePlayer(p.id);
                      }
                    }}
                  />
                  <span className="text-sm font-medium flex-1">
                    #{p.jersey_number} {p.name}
                  </span>
                  <button
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      isAbsent
                        ? "bg-destructive text-destructive-foreground"
                        : "bg-muted text-muted-foreground hover:bg-destructive/20"
                    }`}
                    onClick={() => toggleAbsent(p.id)}
                    title="Mark absent"
                  >
                    {isAbsent ? "OUT" : "abs"}
                  </button>
                </div>
              );
            })}
          </div>
          {absentIds.size > 0 && (
            <p className="mt-2 text-sm text-destructive">
              {absentIds.size} player{absentIds.size !== 1 ? "s" : ""} marked
              absent (won&apos;t count against fairness)
            </p>
          )}
          <div className="mt-4">
            <Button onClick={handleGenerate} size="lg">
              Auto-Generate Lineup
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Generated Lineup Grid */}
      {generated && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Position Grid</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                      Position
                    </th>
                    {Array.from({ length: innings }, (_, i) => (
                      <th
                        key={i}
                        className="text-center py-2 px-3 font-medium"
                      >
                        Inn {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      "P",
                      "C",
                      "1B",
                      "2B",
                      "SS",
                      "3B",
                      "RF",
                      "RCF",
                      "LCF",
                      "LF",
                    ] as Position[]
                  ).map((pos) => (
                    <tr key={pos} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium text-muted-foreground">
                        {pos}
                      </td>
                      {Array.from({ length: innings }, (_, i) => (
                        <td
                          key={i}
                          className="text-center py-2 px-3 whitespace-nowrap"
                        >
                          {getPlayerAtPosition(i + 1, pos)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {/* Bench rows */}
                  {Array.from(
                    {
                      length: Math.max(
                        0,
                        availablePlayers.length - 10
                      ),
                    },
                    (_, benchIdx) => (
                      <tr
                        key={`bench-${benchIdx}`}
                        className="border-b last:border-0 bg-muted/30"
                      >
                        <td className="py-2 pr-4 font-medium text-muted-foreground">
                          {benchIdx === 0 ? "BENCH" : ""}
                        </td>
                        {Array.from({ length: innings }, (_, i) => (
                          <td
                            key={i}
                            className="text-center py-2 px-3 whitespace-nowrap text-muted-foreground"
                          >
                            {getBenchPlayers(i + 1)[benchIdx] ?? ""}
                          </td>
                        ))}
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Editable Pitching Rotation */}
          {generated.pitchingPlan.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Pitching Rotation (editable)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {Array.from({ length: innings }, (_, i) => {
                    const inning = i + 1;
                    const pitcherAssignment = generated.positions.find(
                      (a) => a.inning === inning && a.position === "P"
                    );
                    const fieldPlayersThisInning = generated.positions
                      .filter(
                        (a) =>
                          a.inning === inning && a.position !== "BENCH"
                      )
                      .map((a) => a.playerId);

                    return (
                      <div key={inning}>
                        <Label className="text-muted-foreground">
                          Inning {inning}
                        </Label>
                        <select
                          className="w-full text-sm border rounded px-2 py-1.5 bg-background mt-1"
                          value={pitcherAssignment?.playerId ?? ""}
                          onChange={(e) =>
                            swapPitcher(inning, e.target.value)
                          }
                        >
                          {fieldPlayersThisInning.map((pid) => (
                            <option key={pid} value={pid}>
                              {playerMap.get(pid)?.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
                {lastGameBattingOrder.length > 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Batting order continues from last game. Pitchers on
                    rest (threw &gt;{team?.pitch_rest_threshold} pitches
                    last game) are excluded from pitching.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Batting Order */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Batting Order</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {generated.battingOrder.map((b) => (
                  <div
                    key={b.playerId}
                    className="flex items-center gap-3 p-2 rounded-md border"
                  >
                    <span className="text-lg font-bold text-muted-foreground w-6 text-right">
                      {b.orderPosition}
                    </span>
                    <span className="font-medium">
                      {playerMap.get(b.playerId)?.name}
                    </span>
                    {playerMap.get(b.playerId)?.bats === "L" && (
                      <Badge variant="outline" className="text-xs">
                        L
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Save */}
          <div className="flex gap-4">
            <Button onClick={handleSave} size="lg" disabled={saving}>
              {saving ? "Saving..." : "Save Game"}
            </Button>
            <Button onClick={handleGenerate} variant="outline" size="lg">
              Re-Generate
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
