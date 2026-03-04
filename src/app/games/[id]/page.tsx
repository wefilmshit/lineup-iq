"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Game,
  Player,
  GameLineup,
  BattingOrder,
  PitchingPlan,
  Position,
} from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function GameDayPage() {
  const params = useParams();
  const gameId = params.id as string;

  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [lineups, setLineups] = useState<GameLineup[]>([]);
  const [battingOrder, setBattingOrder] = useState<BattingOrder[]>([]);
  const [pitchingPlan, setPitchingPlan] = useState<PitchingPlan[]>([]);
  const [currentInning, setCurrentInning] = useState(1);
  const [loading, setLoading] = useState(true);

  const playerMap = useMemo(() => {
    const m = new Map<string, Player>();
    players.forEach((p) => m.set(p.id, p));
    return m;
  }, [players]);

  useEffect(() => {
    async function load() {
      const { data: gRaw } = await supabase
        .from("games")
        .select("*")
        .eq("id", gameId)
        .single();
      if (!gRaw) return;
      const g = gRaw as Game;
      setGame(g);

      const [playersRes, lineupsRes, battingRes, pitchingRes] =
        await Promise.all([
          supabase.from("players").select("*").eq("team_id", g.team_id),
          supabase.from("game_lineups").select("*").eq("game_id", gameId),
          supabase
            .from("batting_orders")
            .select("*")
            .eq("game_id", gameId)
            .order("order_position"),
          supabase
            .from("pitching_plans")
            .select("*")
            .eq("game_id", gameId)
            .order("inning"),
        ]);

      if (playersRes.data) setPlayers(playersRes.data as Player[]);
      if (lineupsRes.data) setLineups(lineupsRes.data as GameLineup[]);
      if (battingRes.data) setBattingOrder(battingRes.data as BattingOrder[]);
      if (pitchingRes.data) setPitchingPlan(pitchingRes.data as PitchingPlan[]);
      setLoading(false);
    }
    load();
  }, [gameId]);

  if (loading || !game) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  const innings = game.innings;

  function getPlayerAtPosition(
    inning: number,
    position: Position
  ): Player | undefined {
    const assignment = lineups.find(
      (l) => l.inning === inning && l.position === position
    );
    if (!assignment) return undefined;
    return playerMap.get(assignment.player_id);
  }

  function getBenchPlayers(inning: number): Player[] {
    return lineups
      .filter((l) => l.inning === inning && l.position === "BENCH")
      .map((l) => playerMap.get(l.player_id))
      .filter(Boolean) as Player[];
  }

  const currentPitcher = pitchingPlan.find(
    (pp) => pp.inning === currentInning
  );

  async function saveResult(result: string) {
    await supabase.from("games").update({ result }).eq("id", game!.id);
    setGame({ ...game!, result });
    toast.success("Result saved");
  }

  const fieldPositions: Position[] = [
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
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Game {game.game_number}
            {game.opponent ? ` vs ${game.opponent}` : ""}
          </h1>
          <p className="text-muted-foreground">{game.date}</p>
        </div>
        {game.result && <Badge className="text-lg px-4 py-1">{game.result}</Badge>}
      </div>

      {/* Inning Selector */}
      <div className="flex gap-2 items-center">
        <span className="text-sm font-medium text-muted-foreground">
          Inning:
        </span>
        {Array.from({ length: innings }, (_, i) => (
          <Button
            key={i}
            variant={currentInning === i + 1 ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrentInning(i + 1)}
          >
            {i + 1}
          </Button>
        ))}
      </div>

      {/* Current Inning Lineup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Inning {currentInning} — On the Field
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {fieldPositions.map((pos) => {
              const player = getPlayerAtPosition(currentInning, pos);
              return (
                <div
                  key={pos}
                  className={`p-3 rounded-lg border ${
                    pos === "P"
                      ? "bg-primary/5 border-primary/30"
                      : "bg-card"
                  }`}
                >
                  <div className="text-xs font-medium text-muted-foreground">
                    {pos}
                  </div>
                  <div className="font-semibold text-lg">
                    {player?.name ?? "—"}
                  </div>
                  {player && (
                    <div className="text-xs text-muted-foreground">
                      #{player.jersey_number}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Bench */}
          {getBenchPlayers(currentInning).length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                BENCH
              </div>
              <div className="flex gap-3">
                {getBenchPlayers(currentInning).map((p) => (
                  <div
                    key={p.id}
                    className="px-3 py-2 rounded-md bg-muted text-sm"
                  >
                    #{p.jersey_number} {p.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full Position Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Full Position Grid</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                  Pos
                </th>
                {Array.from({ length: innings }, (_, i) => (
                  <th
                    key={i}
                    className={`text-center py-2 px-3 font-medium ${
                      currentInning === i + 1 ? "bg-primary/10 rounded" : ""
                    }`}
                  >
                    {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fieldPositions.map((pos) => (
                <tr key={pos} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium text-muted-foreground">
                    {pos}
                  </td>
                  {Array.from({ length: innings }, (_, i) => {
                    const p = getPlayerAtPosition(i + 1, pos);
                    return (
                      <td
                        key={i}
                        className={`text-center py-2 px-3 whitespace-nowrap ${
                          currentInning === i + 1 ? "bg-primary/10 font-medium" : ""
                        }`}
                      >
                        {p?.name ?? ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Bench row */}
              <tr className="bg-muted/30">
                <td className="py-2 pr-4 font-medium text-muted-foreground">
                  BENCH
                </td>
                {Array.from({ length: innings }, (_, i) => (
                  <td
                    key={i}
                    className={`text-center py-2 px-3 whitespace-nowrap text-muted-foreground ${
                      currentInning === i + 1 ? "bg-primary/10" : ""
                    }`}
                  >
                    {getBenchPlayers(i + 1)
                      .map((p) => p.name)
                      .join(", ")}
                  </td>
                ))}
              </tr>
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
          <div className="space-y-1">
            {battingOrder.map((b) => {
              const player = playerMap.get(b.player_id);
              return (
                <div
                  key={b.player_id}
                  className="flex items-center gap-3 py-1.5"
                >
                  <span className="text-lg font-bold text-muted-foreground w-6 text-right">
                    {b.order_position}
                  </span>
                  <span className="font-medium">
                    #{player?.jersey_number} {player?.name}
                  </span>
                  {player?.bats === "L" && (
                    <Badge variant="outline" className="text-xs">
                      L
                    </Badge>
                  )}
                  {player?.bats === "S" && (
                    <Badge variant="outline" className="text-xs">
                      S
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Save Result */}
      {!game.result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Game Result</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. W 5-3"
                id="result-input"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    saveResult((e.target as HTMLInputElement).value);
                  }
                }}
              />
              <Button
                onClick={() => {
                  const input = document.getElementById(
                    "result-input"
                  ) as HTMLInputElement;
                  if (input.value) saveResult(input.value);
                }}
              >
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
