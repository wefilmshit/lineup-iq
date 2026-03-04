"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useTeam, usePlayers, useGames, useSeasonData } from "@/lib/hooks";
import { generateLineup } from "@/lib/generate-lineup";
import { Player, Position, ALL_POSITIONS, POSITION_LABELS } from "@/lib/types";
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
    loading: seasonLoading,
  } = useSeasonData(team?.id);

  const [opponent, setOpponent] = useState("");
  const [gameDate, setGameDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [availableIds, setAvailableIds] = useState<Set<string>>(new Set());
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

  const loading = teamLoading || playersLoading || gamesLoading || seasonLoading;

  const availablePlayers = useMemo(
    () => players.filter((p) => availableIds.has(p.id)),
    [players, availableIds]
  );

  const playerMap = useMemo(() => {
    const m = new Map<string, Player>();
    players.forEach((p) => m.set(p.id, p));
    return m;
  }, [players]);

  const innings = team?.innings_per_game ?? 4;

  function togglePlayer(id: string) {
    setAvailableIds((prev) => {
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

    const result = generateLineup({
      availablePlayers,
      seasonLineups,
      seasonBattingOrders,
      innings,
    });
    setGenerated(result);
    toast.success("Lineup generated!");
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
      })
      .select()
      .single();

    if (gameError || !game) {
      toast.error("Failed to save game");
      setSaving(false);
      return;
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

      {/* Available Players */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Available Players ({availablePlayers.length} of {players.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {players.map((p) => (
              <label
                key={p.id}
                className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                  availableIds.has(p.id)
                    ? "bg-primary/5 border-primary/30"
                    : "bg-muted/50 border-transparent opacity-50"
                }`}
              >
                <Checkbox
                  checked={availableIds.has(p.id)}
                  onCheckedChange={() => togglePlayer(p.id)}
                />
                <span className="text-sm font-medium">
                  #{p.jersey_number} {p.name}
                </span>
              </label>
            ))}
          </div>
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

          {/* Pitching Plan */}
          {generated.pitchingPlan.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pitching Rotation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  {generated.pitchingPlan.map((pp) => (
                    <div key={pp.inning} className="text-sm">
                      <span className="text-muted-foreground">
                        Inn {pp.inning}:
                      </span>{" "}
                      <span className="font-medium">
                        {playerMap.get(pp.playerId)?.name}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

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
