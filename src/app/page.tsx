"use client";

import Link from "next/link";
import { useTeam, usePlayers, useGames, useSeasonData } from "@/lib/hooks";
import { computeSeasonStats } from "@/lib/generate-lineup";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export default function Home() {
  const { team, loading: teamLoading, updateTeam } = useTeam();
  const { players, loading: playersLoading } = usePlayers(team?.id);
  const { games, loading: gamesLoading } = useGames(team?.id);
  const {
    lineups,
    battingOrders,
    pitchingPlans,
    absences,
    loading: seasonLoading,
  } = useSeasonData(team?.id);

  const [editingTeam, setEditingTeam] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamSeason, setTeamSeason] = useState("");
  const [editingRules, setEditingRules] = useState(false);

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
    return Array.from(statsMap.values());
  }, [players, lineups, battingOrders, pitchingPlans, absences]);

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  const wins = games.filter((g) => g.result?.startsWith("W")).length;
  const losses = games.filter((g) => g.result?.startsWith("L")).length;

  // Fairness health check
  const fairnessIssues: string[] = [];
  if (stats.length > 0 && games.length > 0) {
    const avgInnings =
      stats.reduce((s, p) => s + p.totalInnings, 0) / stats.length;
    const avgBench =
      stats.reduce((s, p) => s + p.benchInnings, 0) / stats.length;
    for (const s of stats) {
      if (s.totalInnings < avgInnings - 2)
        fairnessIssues.push(`${s.playerName} has low playing time`);
      if (s.benchInnings > avgBench + 2)
        fairnessIssues.push(`${s.playerName} has high bench time`);
    }
  }

  function startEditTeam() {
    setTeamName(team?.name ?? "");
    setTeamSeason(team?.season ?? "");
    setEditingTeam(true);
  }

  async function saveTeamEdit() {
    await updateTeam({ name: teamName, season: teamSeason });
    setEditingTeam(false);
    toast.success("Team updated");
  }

  async function saveRule(field: string, value: number | boolean) {
    await updateTeam({ [field]: value });
    toast.success("Rule updated");
  }

  return (
    <div className="space-y-6">
      {/* Team Header */}
      <div className="flex items-center justify-between">
        {editingTeam ? (
          <div className="flex gap-2 items-end">
            <div>
              <Label>Team Name</Label>
              <Input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
            </div>
            <div>
              <Label>Season</Label>
              <Input
                value={teamSeason}
                onChange={(e) => setTeamSeason(e.target.value)}
              />
            </div>
            <Button onClick={saveTeamEdit} size="sm">
              Save
            </Button>
            <Button
              onClick={() => setEditingTeam(false)}
              variant="ghost"
              size="sm"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div>
            <h1 className="text-3xl font-bold">
              {team?.name ?? "LineupIQ"}
            </h1>
            <p className="text-muted-foreground">
              {team?.season ?? ""}
              {games.length > 0 && ` \u2022 ${wins}-${losses}`}
            </p>
            <button
              onClick={startEditTeam}
              className="text-xs text-muted-foreground hover:text-foreground underline mt-1"
            >
              Edit team info
            </button>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Link href="/games/new">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardContent className="py-6 text-center">
              <div className="text-3xl mb-2">+</div>
              <div className="font-semibold">New Game</div>
              <div className="text-sm text-muted-foreground">
                Generate a fair lineup
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/games/log">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardContent className="py-6 text-center">
              <div className="text-3xl mb-2">&#x1f4cb;</div>
              <div className="font-semibold">Log Game</div>
              <div className="text-sm text-muted-foreground">
                Enter a past game
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/roster">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardContent className="py-6 text-center">
              <div className="text-3xl mb-2">{players.length}</div>
              <div className="font-semibold">Players</div>
              <div className="text-sm text-muted-foreground">
                Manage your roster
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/fairness">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardContent className="py-6 text-center">
              <div className="text-3xl mb-2">{games.length}</div>
              <div className="font-semibold">Games</div>
              <div className="text-sm text-muted-foreground">
                View fairness stats
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* League Rules */}
      {team && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">League Rules</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingRules(!editingRules)}
              >
                {editingRules ? "Done" : "Edit"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {editingRules ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Innings per game</Label>
                  <Input
                    type="number"
                    min={1}
                    max={9}
                    value={team.innings_per_game}
                    onChange={(e) =>
                      saveRule(
                        "innings_per_game",
                        parseInt(e.target.value) || 4
                      )
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Max pitch innings/game</Label>
                  <Input
                    type="number"
                    min={1}
                    max={9}
                    value={team.max_pitch_innings_per_game}
                    onChange={(e) =>
                      saveRule(
                        "max_pitch_innings_per_game",
                        parseInt(e.target.value) || 2
                      )
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Max pitches/game</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={team.max_pitches_per_game}
                    onChange={(e) =>
                      saveRule(
                        "max_pitches_per_game",
                        parseInt(e.target.value) || 40
                      )
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Pitch rest threshold</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={team.pitch_rest_threshold}
                    onChange={(e) =>
                      saveRule(
                        "pitch_rest_threshold",
                        parseInt(e.target.value) || 10
                      )
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Max same position/game</Label>
                  <Input
                    type="number"
                    min={1}
                    max={9}
                    value={team.max_same_position_innings}
                    onChange={(e) =>
                      saveRule(
                        "max_same_position_innings",
                        parseInt(e.target.value) || 2
                      )
                    }
                  />
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <Checkbox
                    id="require_infield"
                    checked={team.require_infield_inning}
                    onCheckedChange={(v) =>
                      saveRule("require_infield_inning", v === true)
                    }
                  />
                  <Label htmlFor="require_infield" className="text-xs">
                    Require infield inning
                  </Label>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Innings/game:</span>{" "}
                  <span className="font-medium">{team.innings_per_game}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Max pitch inn/game:
                  </span>{" "}
                  <span className="font-medium">
                    {team.max_pitch_innings_per_game}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Max pitches/game:
                  </span>{" "}
                  <span className="font-medium">
                    {team.max_pitches_per_game}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Pitch rest threshold:
                  </span>{" "}
                  <span className="font-medium">
                    {team.pitch_rest_threshold}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Max same pos/game:
                  </span>{" "}
                  <span className="font-medium">
                    {team.max_same_position_innings}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Require infield:
                  </span>{" "}
                  <span className="font-medium">
                    {team.require_infield_inning ? "Yes" : "No"}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Fairness Health Check */}
      {fairnessIssues.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-lg text-destructive">
              Fairness Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {fairnessIssues.map((issue, i) => (
                <li key={i} className="text-sm flex items-center gap-2">
                  <Badge variant="destructive" className="text-xs">
                    !
                  </Badge>
                  {issue}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {fairnessIssues.length === 0 && games.length > 0 && (
        <Card className="border-green-500/30 bg-green-50/50">
          <CardContent className="py-4 text-center text-green-700 text-sm font-medium">
            All players are getting fair playing time
          </CardContent>
        </Card>
      )}

      {/* Recent Games */}
      {games.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Games</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {games
                .slice(-3)
                .reverse()
                .map((game) => (
                  <Link key={game.id} href={`/games/${game.id}`}>
                    <div className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 cursor-pointer">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-muted-foreground">
                          #{game.game_number}
                        </span>
                        <span className="font-medium">
                          {game.opponent
                            ? `vs ${game.opponent}`
                            : `Game ${game.game_number}`}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {game.date}
                        </span>
                      </div>
                      {game.result && (
                        <Badge
                          variant={
                            game.result.startsWith("W")
                              ? "default"
                              : "secondary"
                          }
                        >
                          {game.result}
                        </Badge>
                      )}
                    </div>
                  </Link>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Getting Started */}
      {players.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Getting Started</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              1. Add your players on the{" "}
              <Link
                href="/roster"
                className="font-medium text-foreground underline"
              >
                Roster
              </Link>{" "}
              page
            </p>
            <p>2. Rate each player&apos;s batting and fielding (1-10)</p>
            <p>3. Mark who can pitch and catch</p>
            <p>
              4. Hit{" "}
              <Link
                href="/games/new"
                className="font-medium text-foreground underline"
              >
                New Game
              </Link>{" "}
              to auto-generate a fair lineup
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
