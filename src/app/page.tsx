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
  } = useSeasonData(team?.id, true);

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
    return <div className="text-[#6B7280]">Loading...</div>;
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
      {/* Team Hero Card */}
      <Card className="border-[#E2E8F0] shadow-sm">
        <CardContent className="pt-6">
          {editingTeam ? (
            <div className="flex gap-2 items-end flex-wrap">
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
              <Button onClick={saveTeamEdit} size="sm" className="bg-[#1E63E9] hover:bg-[#2F80FF]">
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
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl sm:text-4xl font-bold text-[#0B1F3A]">
                    {team?.name ?? "LineupIQ"}
                  </h1>
                  <p className="text-[#6B7280] text-base font-medium mt-1">
                    {team?.season ?? ""}
                  </p>
                </div>
                <button
                  onClick={startEditTeam}
                  className="text-sm text-[#6B7280] hover:text-[#0B1F3A] transition-colors"
                >
                  Edit
                </button>
              </div>

              {/* Stat Row */}
              {games.length > 0 && (
                <div className="flex gap-6 mt-5 pt-5 border-t border-[#E2E8F0]">
                  <div className="text-center">
                    <div className="text-2xl sm:text-3xl font-bold text-[#0B1F3A]">{wins}</div>
                    <div className="text-xs sm:text-sm font-medium text-[#6B7280] uppercase tracking-wide">Wins</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl sm:text-3xl font-bold text-[#0B1F3A]">{losses}</div>
                    <div className="text-xs sm:text-sm font-medium text-[#6B7280] uppercase tracking-wide">Losses</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl sm:text-3xl font-bold text-[#0B1F3A]">{games.length}</div>
                    <div className="text-xs sm:text-sm font-medium text-[#6B7280] uppercase tracking-wide">Games</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl sm:text-3xl font-bold text-[#0B1F3A]">{players.length}</div>
                    <div className="text-xs sm:text-sm font-medium text-[#6B7280] uppercase tracking-wide">Players</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Link href="/games/new">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border-[#E2E8F0] shadow-sm">
            <CardContent className="py-6 text-center">
              <div className="text-3xl mb-2 text-[#FFC857]">+</div>
              <div className="font-semibold text-[#0B1F3A]">New Game</div>
              <div className="text-sm text-[#6B7280]">
                Generate a fair lineup
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/games/log">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border-[#E2E8F0] shadow-sm">
            <CardContent className="py-6 text-center">
              <div className="text-3xl mb-2 text-[#1E63E9]">&#x1f4cb;</div>
              <div className="font-semibold text-[#0B1F3A]">Log Game</div>
              <div className="text-sm text-[#6B7280]">
                Enter a past game
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/roster">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border-[#E2E8F0] shadow-sm">
            <CardContent className="py-6 text-center">
              <div className="text-3xl mb-2 text-[#1E63E9]">{players.length}</div>
              <div className="font-semibold text-[#0B1F3A]">Players</div>
              <div className="text-sm text-[#6B7280]">
                Manage your roster
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/fairness">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border-[#E2E8F0] shadow-sm">
            <CardContent className="py-6 text-center">
              <div className="text-3xl mb-2 text-[#1E63E9]">{games.length}</div>
              <div className="font-semibold text-[#0B1F3A]">Games</div>
              <div className="text-sm text-[#6B7280]">
                View fairness stats
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* League Rules */}
      {team && (
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-[#0B1F3A]">League Rules</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-[#6B7280] hover:text-[#0B1F3A]"
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
                  <span className="text-[#6B7280]">Innings/game:</span>{" "}
                  <span className="font-medium text-[#0B1F3A]">{team.innings_per_game}</span>
                </div>
                <div>
                  <span className="text-[#6B7280]">
                    Max pitch inn/game:
                  </span>{" "}
                  <span className="font-medium text-[#0B1F3A]">
                    {team.max_pitch_innings_per_game}
                  </span>
                </div>
                <div>
                  <span className="text-[#6B7280]">
                    Max pitches/game:
                  </span>{" "}
                  <span className="font-medium text-[#0B1F3A]">
                    {team.max_pitches_per_game}
                  </span>
                </div>
                <div>
                  <span className="text-[#6B7280]">
                    Pitch rest threshold:
                  </span>{" "}
                  <span className="font-medium text-[#0B1F3A]">
                    {team.pitch_rest_threshold}
                  </span>
                </div>
                <div>
                  <span className="text-[#6B7280]">
                    Max same pos/game:
                  </span>{" "}
                  <span className="font-medium text-[#0B1F3A]">
                    {team.max_same_position_innings}
                  </span>
                </div>
                <div>
                  <span className="text-[#6B7280]">
                    Require infield:
                  </span>{" "}
                  <span className="font-medium text-[#0B1F3A]">
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
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[#EF4444]/5 border border-[#EF4444]/20">
          <span className="text-[#EF4444] text-sm font-semibold shrink-0">Fairness:</span>
          <p className="text-sm text-[#0B1F3A]">
            {fairnessIssues.join(" · ")}
          </p>
        </div>
      )}

      {fairnessIssues.length === 0 && games.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[#2ECC71]/5 border border-[#2ECC71]/20">
          <span className="text-[#2ECC71] text-sm font-semibold shrink-0">Fairness:</span>
          <p className="text-sm text-[#0B1F3A]">All players are getting fair playing time</p>
        </div>
      )}

      {/* Recent Games */}
      {games.length > 0 && (
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-[#0B1F3A]">Recent Games</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {games
                .slice(-3)
                .reverse()
                .map((game) => (
                  <Link key={game.id} href={`/games/${game.id}`}>
                    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-[#F0F4F8] cursor-pointer transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[#6B7280]">
                          #{game.game_number}
                        </span>
                        <span className="font-medium text-[#0B1F3A]">
                          {game.opponent
                            ? `vs ${game.opponent}`
                            : `Game ${game.game_number}`}
                        </span>
                        <span className="text-sm text-[#6B7280]">
                          {game.date}
                        </span>
                        {game.home_away && (
                          <Badge variant="outline" className="text-xs">
                            {game.home_away === "home" ? "Home" : "Away"}
                          </Badge>
                        )}
                        {!game.is_finalized && (
                          <Badge variant="outline" className="text-xs text-[#FFC857] border-[#FFC857]/50">
                            Draft
                          </Badge>
                        )}
                      </div>
                      {game.result && (
                        <Badge
                          className={
                            game.result.startsWith("W")
                              ? "bg-[#2ECC71] text-white hover:bg-[#2ECC71]/90"
                              : "bg-[#F0F4F8] text-[#6B7280]"
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
        <Card className="border-[#E2E8F0] shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-[#0B1F3A]">Getting Started</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-[#6B7280]">
            <p>
              1. Add your players on the{" "}
              <Link
                href="/roster"
                className="font-medium text-[#1E63E9] hover:text-[#2F80FF] underline"
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
                className="font-medium text-[#1E63E9] hover:text-[#2F80FF] underline"
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
