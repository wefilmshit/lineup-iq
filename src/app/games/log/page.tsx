"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useTeam, usePlayers, useGames } from "@/lib/hooks";
import { Player, Position, FIELD_POSITIONS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export default function LogGamePage() {
  const router = useRouter();
  const { team, loading: teamLoading } = useTeam();
  const { players, loading: playersLoading } = usePlayers(team?.id);
  const { games, loading: gamesLoading } = useGames(team?.id);

  const [opponent, setOpponent] = useState("");
  const [gameDate, setGameDate] = useState("");
  const [result, setResult] = useState("");
  const [plannedInnings, setPlannedInnings] = useState(0);
  const [actualInnings, setActualInnings] = useState(0);
  const [inningsInitialized, setInningsInitialized] = useState(false);

  // Absent player tracking
  const [absentIds, setAbsentIds] = useState<Set<string>>(new Set());

  // grid[inning][position] = playerId
  const [grid, setGrid] = useState<Record<number, Record<string, string>>>({});
  // battingOrder[index] = playerId
  const [battingOrder, setBattingOrder] = useState<string[]>([]);
  // pitchCounts[inning][playerId] = count
  const [pitchCounts, setPitchCounts] = useState<
    Record<number, Record<string, number>>
  >({});
  const [saving, setSaving] = useState(false);

  // Initialize innings from team settings
  if (!inningsInitialized && team) {
    setPlannedInnings(team.innings_per_game);
    setActualInnings(team.innings_per_game);
    setInningsInitialized(true);
  }

  const loading = teamLoading || playersLoading || gamesLoading;

  // Filter out absent players
  const activePlayers = useMemo(
    () => players.filter((p) => !absentIds.has(p.id)),
    [players, absentIds]
  );

  const playerMap = useMemo(() => {
    const m = new Map<string, Player>();
    players.forEach((p) => m.set(p.id, p));
    return m;
  }, [players]);

  function toggleAbsent(id: string) {
    setAbsentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Get players assigned to field positions in a given inning
  function assignedInInning(inning: number): Set<string> {
    const assigned = new Set<string>();
    const inningData = grid[inning] || {};
    for (const pos of FIELD_POSITIONS) {
      if (inningData[pos]) assigned.add(inningData[pos]);
    }
    return assigned;
  }

  // Get all unique players assigned across ALL innings (for batting order + bench)
  const allAssignedPlayers = useMemo(() => {
    const ids = new Set<string>();
    for (let inn = 1; inn <= actualInnings; inn++) {
      const inningData = grid[inn] || {};
      for (const pos of FIELD_POSITIONS) {
        if (inningData[pos]) ids.add(inningData[pos]);
      }
    }
    return ids;
  }, [grid, actualInnings]);

  function setPosition(inning: number, position: string, playerId: string) {
    setGrid((prev) => ({
      ...prev,
      [inning]: {
        ...(prev[inning] || {}),
        [position]: playerId,
      },
    }));
  }

  function setPitchCount(inning: number, playerId: string, count: number) {
    setPitchCounts((prev) => ({
      ...prev,
      [inning]: {
        ...(prev[inning] || {}),
        [playerId]: count,
      },
    }));
  }

  // Add a batting order slot
  function addBattingSlot() {
    setBattingOrder((prev) => [...prev, ""]);
  }

  function setBattingPlayer(index: number, playerId: string) {
    setBattingOrder((prev) => {
      const next = [...prev];
      next[index] = playerId;
      return next;
    });
  }

  function removeBattingSlot(index: number) {
    setBattingOrder((prev) => prev.filter((_, i) => i !== index));
  }

  // Auto-populate batting order from grid
  function autoBattingOrder() {
    const ids = Array.from(allAssignedPlayers);
    setBattingOrder(ids);
  }

  async function handleSave() {
    if (!team) return;

    // Validate: check that at least some positions are filled
    let totalAssigned = 0;
    for (let inn = 1; inn <= actualInnings; inn++) {
      totalAssigned += assignedInInning(inn).size;
    }
    if (totalAssigned === 0) {
      toast.error("Fill in at least some positions before saving");
      return;
    }

    // Validate batting order has no empty slots
    const validBatting = battingOrder.filter((id) => id !== "");
    if (validBatting.length === 0) {
      toast.error("Add a batting order before saving");
      return;
    }

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
        innings: actualInnings,
        planned_innings: plannedInnings,
        result: result || null,
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

    // Build lineup rows from grid
    const lineupRows: {
      game_id: string;
      player_id: string;
      inning: number;
      position: string;
    }[] = [];

    for (let inn = 1; inn <= actualInnings; inn++) {
      const inningData = grid[inn] || {};
      const assignedFieldIds = new Set<string>();

      // Field positions
      for (const pos of FIELD_POSITIONS) {
        if (inningData[pos]) {
          lineupRows.push({
            game_id: game.id,
            player_id: inningData[pos],
            inning: inn,
            position: pos,
          });
          assignedFieldIds.add(inningData[pos]);
        }
      }

      // Auto-compute bench: players in the game but not on the field this inning
      for (const pid of allAssignedPlayers) {
        if (!assignedFieldIds.has(pid)) {
          lineupRows.push({
            game_id: game.id,
            player_id: pid,
            inning: inn,
            position: "BENCH",
          });
        }
      }
    }

    if (lineupRows.length > 0) {
      const { error: lineupError } = await supabase
        .from("game_lineups")
        .insert(lineupRows);
      if (lineupError) {
        toast.error("Failed to save lineup positions");
        setSaving(false);
        return;
      }
    }

    // Save batting order
    const battingRows = validBatting.map((playerId, i) => ({
      game_id: game.id,
      player_id: playerId,
      order_position: i + 1,
    }));

    if (battingRows.length > 0) {
      const { error: battingError } = await supabase
        .from("batting_orders")
        .insert(battingRows);
      if (battingError) {
        toast.error("Failed to save batting order");
        setSaving(false);
        return;
      }
    }

    // Auto-extract pitching plan from grid P assignments + pitch counts
    const pitchingRows: {
      game_id: string;
      player_id: string;
      inning: number;
      pitch_count: number;
    }[] = [];
    for (let inn = 1; inn <= actualInnings; inn++) {
      const pitcher = grid[inn]?.["P"];
      if (pitcher) {
        pitchingRows.push({
          game_id: game.id,
          player_id: pitcher,
          inning: inn,
          pitch_count: pitchCounts[inn]?.[pitcher] || 0,
        });
      }
    }
    if (pitchingRows.length > 0) {
      await supabase.from("pitching_plans").insert(pitchingRows);
    }

    toast.success(`Game ${gameNumber} logged!`);
    router.push(`/games/${game.id}`);
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (players.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Log Past Game</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Add players to your roster first.
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
      <h1 className="text-2xl font-bold">Log Past Game</h1>

      {/* Game Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Game Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
            <div>
              <Label>Result</Label>
              <Input
                value={result}
                onChange={(e) => setResult(e.target.value)}
                placeholder="e.g. W 5-3"
              />
            </div>
            <div>
              <Label>Planned Innings</Label>
              <Input
                type="number"
                min={1}
                max={9}
                value={plannedInnings}
                onChange={(e) =>
                  setPlannedInnings(parseInt(e.target.value) || 4)
                }
              />
            </div>
            <div>
              <Label>Actual Innings</Label>
              <Input
                type="number"
                min={1}
                max={9}
                value={actualInnings}
                onChange={(e) =>
                  setActualInnings(parseInt(e.target.value) || 4)
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Absent Players */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Absent Players</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {players.map((p) => (
              <label
                key={p.id}
                className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                  absentIds.has(p.id)
                    ? "bg-destructive/10 border-destructive/30"
                    : "bg-background border-transparent"
                }`}
              >
                <Checkbox
                  checked={absentIds.has(p.id)}
                  onCheckedChange={() => toggleAbsent(p.id)}
                />
                <span className="text-sm">
                  #{p.jersey_number} {p.name}
                </span>
                {absentIds.has(p.id) && (
                  <span className="text-xs text-destructive font-medium">
                    OUT
                  </span>
                )}
              </label>
            ))}
          </div>
          {absentIds.size > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              {absentIds.size} absent — won&apos;t count against fairness
              stats.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Position Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Position Assignments</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-2 font-medium text-muted-foreground w-16">
                  Pos
                </th>
                {Array.from({ length: actualInnings }, (_, i) => (
                  <th key={i} className="text-center py-2 px-1 font-medium">
                    Inn {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FIELD_POSITIONS.map((pos) => (
                <tr key={pos} className="border-b last:border-0">
                  <td className="py-2 pr-2 font-medium text-muted-foreground">
                    {pos}
                  </td>
                  {Array.from({ length: actualInnings }, (_, i) => {
                    const inning = i + 1;
                    const assigned = assignedInInning(inning);
                    const currentValue = grid[inning]?.[pos] || "";

                    return (
                      <td key={i} className="py-1 px-1">
                        <select
                          className="w-full text-sm border rounded px-1 py-1.5 bg-background"
                          value={currentValue}
                          onChange={(e) =>
                            setPosition(inning, pos, e.target.value)
                          }
                        >
                          <option value="">—</option>
                          {activePlayers.map((p) => {
                            const taken =
                              assigned.has(p.id) && p.id !== currentValue;
                            return (
                              <option
                                key={p.id}
                                value={p.id}
                                disabled={taken}
                              >
                                {taken
                                  ? `(${p.name})`
                                  : `#${p.jersey_number} ${p.name}`}
                              </option>
                            );
                          })}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Show auto-computed bench per inning */}
          <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
            <span className="font-medium">Bench: </span>
            {allAssignedPlayers.size === 0
              ? "assign players above"
              : Array.from({ length: actualInnings }, (_, i) => {
                  const inning = i + 1;
                  const assigned = assignedInInning(inning);
                  const bench = Array.from(allAssignedPlayers)
                    .filter((id) => !assigned.has(id))
                    .map((id) => playerMap.get(id)?.name)
                    .filter(Boolean);
                  return bench.length > 0
                    ? `Inn ${inning}: ${bench.join(", ")}`
                    : null;
                })
                  .filter(Boolean)
                  .join(" | ")}
          </div>
        </CardContent>
      </Card>

      {/* Pitch Counts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pitch Counts</CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            // Collect pitchers per inning
            const pitchers: { inning: number; playerId: string }[] = [];
            for (let inn = 1; inn <= actualInnings; inn++) {
              const pid = grid[inn]?.["P"];
              if (pid) pitchers.push({ inning: inn, playerId: pid });
            }
            if (pitchers.length === 0) {
              return (
                <p className="text-sm text-muted-foreground">
                  Assign pitchers in the grid above to enter pitch counts.
                </p>
              );
            }
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {pitchers.map(({ inning, playerId }) => (
                  <div key={`${inning}-${playerId}`}>
                    <Label className="text-muted-foreground text-xs">
                      Inn {inning}: {playerMap.get(playerId)?.name}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={pitchCounts[inning]?.[playerId] ?? ""}
                      onChange={(e) =>
                        setPitchCount(
                          inning,
                          playerId,
                          parseInt(e.target.value) || 0
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Batting Order */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Batting Order</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={autoBattingOrder}>
                Auto-Fill from Grid
              </Button>
              <Button variant="outline" size="sm" onClick={addBattingSlot}>
                + Add Slot
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {battingOrder.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Click &quot;Auto-Fill from Grid&quot; or add slots manually.
            </p>
          ) : (
            <div className="space-y-2">
              {battingOrder.map((playerId, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-lg font-bold text-muted-foreground w-6 text-right">
                    {idx + 1}
                  </span>
                  <select
                    className="flex-1 text-sm border rounded px-2 py-1.5 bg-background"
                    value={playerId}
                    onChange={(e) => setBattingPlayer(idx, e.target.value)}
                  >
                    <option value="">— Select —</option>
                    {activePlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.jersey_number} {p.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => removeBattingSlot(idx)}
                  >
                    X
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex gap-4">
        <Button onClick={handleSave} size="lg" disabled={saving}>
          {saving ? "Saving..." : "Save Game"}
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => router.push("/games")}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
