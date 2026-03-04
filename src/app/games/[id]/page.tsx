"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Game,
  Player,
  GameLineup,
  BattingOrder,
  PitchingPlan,
  GameAbsence,
  AtBat,
  AtBatResult,
  Position,
} from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const AT_BAT_OPTIONS: AtBatResult[] = ["1B", "2B", "3B", "HR", "OUT"];

export default function GameDayPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.id as string;

  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [lineups, setLineups] = useState<GameLineup[]>([]);
  const [battingOrder, setBattingOrder] = useState<BattingOrder[]>([]);
  const [pitchingPlan, setPitchingPlan] = useState<PitchingPlan[]>([]);
  const [absences, setAbsences] = useState<GameAbsence[]>([]);
  const [atBats, setAtBats] = useState<AtBat[]>([]);
  const [currentInning, setCurrentInning] = useState(1);
  const [loading, setLoading] = useState(true);

  const playerMap = useMemo(() => {
    const m = new Map<string, Player>();
    players.forEach((p) => m.set(p.id, p));
    return m;
  }, [players]);

  const loadData = useCallback(async () => {
    const { data: gRaw } = await supabase
      .from("games")
      .select("*")
      .eq("id", gameId)
      .single();
    if (!gRaw) return;
    const g = gRaw as Game;
    setGame(g);

    const [playersRes, lineupsRes, battingRes, pitchingRes, absencesRes, atBatsRes] =
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
        supabase.from("game_absences").select("*").eq("game_id", gameId),
        supabase
          .from("at_bats")
          .select("*")
          .eq("game_id", gameId)
          .order("inning")
          .order("order_in_inning"),
      ]);

    if (playersRes.data) setPlayers(playersRes.data as Player[]);
    if (lineupsRes.data) setLineups(lineupsRes.data as GameLineup[]);
    if (battingRes.data) setBattingOrder(battingRes.data as BattingOrder[]);
    if (pitchingRes.data) setPitchingPlan(pitchingRes.data as PitchingPlan[]);
    if (absencesRes.data) setAbsences(absencesRes.data as GameAbsence[]);
    if (atBatsRes.data) setAtBats(atBatsRes.data as AtBat[]);
    setLoading(false);
  }, [gameId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currentPitcherPlan = pitchingPlan.find(
    (pp) => pp.inning === currentInning
  );

  // Total pitch count for the current pitcher across all their innings
  const currentPitcherTotalPitches = useMemo(() => {
    if (!currentPitcherPlan) return 0;
    return pitchingPlan
      .filter((pp) => pp.player_id === currentPitcherPlan.player_id)
      .reduce((sum, pp) => sum + pp.pitch_count, 0);
  }, [currentPitcherPlan, pitchingPlan]);

  // Compute box score
  const boxScore = useMemo(() => {
    const hits = atBats.filter((ab) => ab.result !== "OUT");
    const outs = atBats.filter((ab) => ab.result === "OUT");
    return {
      total: atBats.length,
      hits: hits.length,
      outs: outs.length,
      singles: atBats.filter((ab) => ab.result === "1B").length,
      doubles: atBats.filter((ab) => ab.result === "2B").length,
      triples: atBats.filter((ab) => ab.result === "3B").length,
      homeRuns: atBats.filter((ab) => ab.result === "HR").length,
    };
  }, [atBats]);

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

  async function updatePitchCount(planId: string, delta: number) {
    const plan = pitchingPlan.find((pp) => pp.id === planId);
    if (!plan) return;
    const newCount = Math.max(0, plan.pitch_count + delta);
    await supabase
      .from("pitching_plans")
      .update({ pitch_count: newCount })
      .eq("id", planId);
    setPitchingPlan((prev) =>
      prev.map((pp) =>
        pp.id === planId ? { ...pp, pitch_count: newCount } : pp
      )
    );
  }

  async function recordAtBat(playerId: string, result: AtBatResult) {
    const inningAtBats = atBats.filter((ab) => ab.inning === currentInning);
    const orderInInning = inningAtBats.length + 1;

    const { data, error } = await supabase
      .from("at_bats")
      .insert({
        game_id: gameId,
        player_id: playerId,
        inning: currentInning,
        result,
        order_in_inning: orderInInning,
      })
      .select()
      .single();

    if (!error && data) {
      setAtBats((prev) => [...prev, data as AtBat]);
    }
  }

  async function removeLastAtBat() {
    if (atBats.length === 0) return;
    const last = atBats[atBats.length - 1];
    await supabase.from("at_bats").delete().eq("id", last.id);
    setAtBats((prev) => prev.slice(0, -1));
  }

  async function toggleFinalized() {
    const newVal = !game!.is_finalized;
    await supabase
      .from("games")
      .update({ is_finalized: newVal })
      .eq("id", game!.id);
    setGame({ ...game!, is_finalized: newVal });
    toast.success(newVal ? "Game finalized" : "Game un-finalized");
  }

  async function deleteGame() {
    if (!confirm("Delete this game and all its data? This cannot be undone.")) return;
    await Promise.all([
      supabase.from("at_bats").delete().eq("game_id", gameId),
      supabase.from("game_lineups").delete().eq("game_id", gameId),
      supabase.from("batting_orders").delete().eq("game_id", gameId),
      supabase.from("pitching_plans").delete().eq("game_id", gameId),
      supabase.from("game_absences").delete().eq("game_id", gameId),
    ]);
    await supabase.from("games").delete().eq("id", gameId);
    toast.success("Game deleted");
    router.push("/");
  }

  async function saveResult(result: string) {
    await supabase.from("games").update({ result }).eq("id", game!.id);
    setGame({ ...game!, result });
    toast.success("Result saved");
  }

  async function updateActualInnings(newInnings: number) {
    await supabase
      .from("games")
      .update({ innings: newInnings })
      .eq("id", game!.id);
    setGame({ ...game!, innings: newInnings });
    toast.success(`Updated to ${newInnings} innings`);
  }

  async function toggleAbsence(playerId: string) {
    const existing = absences.find((a) => a.player_id === playerId);
    if (existing) {
      await supabase.from("game_absences").delete().eq("id", existing.id);
      setAbsences((prev) => prev.filter((a) => a.id !== existing.id));
      toast.success("Marked present");
    } else {
      const { data, error } = await supabase
        .from("game_absences")
        .insert({ game_id: gameId, player_id: playerId })
        .select()
        .single();
      if (!error && data) {
        setAbsences((prev) => [...prev, data as GameAbsence]);
        toast.success("Marked absent");
      }
    }
  }

  const fieldPositions: Position[] = [
    "P", "C", "1B", "2B", "SS", "3B", "RF", "RCF", "LCF", "LF",
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
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>{game.date}</span>
            {game.home_away && (
              <Badge variant="outline" className="text-xs">
                {game.home_away === "home" ? "Home" : "Visitor"}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {game.result && (
            <Badge className="text-lg px-4 py-1">{game.result}</Badge>
          )}
          {game.is_finalized && (
            <Badge variant="outline" className="text-xs text-green-600 border-green-300">
              Final
            </Badge>
          )}
          {lineups.length > 0 && (
            <Link href={`/games/${gameId}/print`} target="_blank">
              <Button variant="outline" size="sm">
                Print Lineup
              </Button>
            </Link>
          )}
          <Button
            variant={game.is_finalized ? "ghost" : "default"}
            size="sm"
            onClick={toggleFinalized}
          >
            {game.is_finalized ? "Un-finalize" : "Finalize Game"}
          </Button>
        </div>
      </div>

      {/* Absent Players */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Attendance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {players.map((p) => {
              const isAbsent = absences.some((a) => a.player_id === p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleAbsence(p.id)}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    isAbsent
                      ? "bg-destructive/10 border-destructive/30 text-destructive line-through"
                      : "bg-green-50 border-green-200 text-green-700"
                  }`}
                >
                  {p.name}
                  {isAbsent ? " (absent)" : ""}
                </button>
              );
            })}
          </div>
          {absences.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {absences.length} absent — tap a name to toggle
            </p>
          )}
        </CardContent>
      </Card>

      {/* Inning Selector + Actual Innings */}
      <div className="flex gap-2 items-center flex-wrap">
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
        <div className="ml-auto flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">
            Innings played:
          </Label>
          <Input
            type="number"
            min={1}
            max={9}
            value={innings}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              if (v >= 1 && v <= 9) updateActualInnings(v);
            }}
            className="w-16 h-8 text-sm"
          />
        </div>
      </div>

      {/* Pitch Counter */}
      {currentPitcherPlan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pitch Counter</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div>
                <div className="text-sm text-muted-foreground">
                  Pitcher (Inn {currentInning})
                </div>
                <div className="text-xl font-bold">
                  {playerMap.get(currentPitcherPlan.player_id)?.name}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-14 h-14 text-2xl"
                  onClick={() => updatePitchCount(currentPitcherPlan.id, -1)}
                >
                  -
                </Button>
                <div className="text-center">
                  <div
                    className={`text-4xl font-bold tabular-nums ${
                      currentPitcherTotalPitches >= 40
                        ? "text-destructive"
                        : currentPitcherTotalPitches >= 30
                        ? "text-yellow-500"
                        : ""
                    }`}
                  >
                    {currentPitcherPlan.pitch_count}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    this inning
                  </div>
                </div>
                <Button
                  variant="default"
                  size="lg"
                  className="w-14 h-14 text-2xl"
                  onClick={() => updatePitchCount(currentPitcherPlan.id, 1)}
                >
                  +
                </Button>
              </div>
              <div className="text-center">
                <div
                  className={`text-2xl font-bold tabular-nums ${
                    currentPitcherTotalPitches >= 40
                      ? "text-destructive"
                      : ""
                  }`}
                >
                  {currentPitcherTotalPitches}
                </div>
                <div className="text-xs text-muted-foreground">
                  total pitches
                </div>
                {currentPitcherTotalPitches >= 40 && (
                  <div className="text-xs text-destructive font-medium mt-1">
                    AT LIMIT
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Hit Tracker */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Hit Tracker</CardTitle>
            {boxScore.total > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <span>
                  {boxScore.hits}H / {boxScore.outs}O
                </span>
                {boxScore.singles > 0 && <Badge variant="outline">{boxScore.singles} 1B</Badge>}
                {boxScore.doubles > 0 && <Badge variant="outline">{boxScore.doubles} 2B</Badge>}
                {boxScore.triples > 0 && <Badge variant="outline">{boxScore.triples} 3B</Badge>}
                {boxScore.homeRuns > 0 && <Badge variant="default">{boxScore.homeRuns} HR</Badge>}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {battingOrder.map((b) => {
              const player = playerMap.get(b.player_id);
              const playerAtBats = atBats.filter(
                (ab) => ab.player_id === b.player_id
              );
              return (
                <div
                  key={b.player_id}
                  className="p-3 rounded-lg border"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-sm text-muted-foreground">
                        #{b.order_position}
                      </div>
                      <div className="text-xl font-bold">
                        {player?.name}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold tabular-nums">
                        {playerAtBats.filter((ab) => ab.result !== "OUT").length}
                        <span className="text-muted-foreground font-normal">/</span>
                        {playerAtBats.length}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        hits / AB
                      </div>
                    </div>
                  </div>
                  {/* At-bat history */}
                  {playerAtBats.length > 0 && (
                    <div className="flex gap-1.5 mb-3 flex-wrap">
                      {playerAtBats.map((ab) => (
                        <Badge
                          key={ab.id}
                          variant={ab.result === "OUT" ? "secondary" : "default"}
                        >
                          {ab.result}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {/* Record buttons */}
                  <div className="flex gap-2">
                    {AT_BAT_OPTIONS.map((result) => (
                      <Button
                        key={result}
                        variant={result === "OUT" ? "outline" : "default"}
                        size="lg"
                        className="flex-1 text-base font-bold"
                        onClick={() => recordAtBat(b.player_id, result)}
                      >
                        {result}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {atBats.length > 0 && (
            <div className="mt-4 pt-3 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={removeLastAtBat}
              >
                Undo Last At-Bat
              </Button>
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
                          currentInning === i + 1
                            ? "bg-primary/10 font-medium"
                            : ""
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

      {/* Pitching Summary */}
      {pitchingPlan.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pitching Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 flex-wrap">
              {pitchingPlan.map((pp) => (
                <div
                  key={pp.id}
                  className="flex items-center gap-2 p-2 rounded-md border text-sm"
                >
                  <span className="text-muted-foreground">
                    Inn {pp.inning}:
                  </span>
                  <span className="font-medium">
                    {playerMap.get(pp.player_id)?.name}
                  </span>
                  <Badge
                    variant={pp.pitch_count >= 40 ? "destructive" : "secondary"}
                    className="text-xs"
                  >
                    {pp.pitch_count}p
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Delete Game */}
      <div className="pt-4 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={deleteGame}
        >
          Delete Game
        </Button>
      </div>
    </div>
  );
}
