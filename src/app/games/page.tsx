"use client";

import Link from "next/link";
import { useTeam, useGames } from "@/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function GamesPage() {
  const { team, loading: teamLoading } = useTeam();
  const { games, loading: gamesLoading } = useGames(team?.id);

  if (teamLoading || gamesLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  const wins = games.filter((g) => g.result?.startsWith("W")).length;
  const losses = games.filter((g) => g.result?.startsWith("L")).length;
  const ties = games.filter(
    (g) => g.result && !g.result.startsWith("W") && !g.result.startsWith("L")
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Games</h1>
          {games.length > 0 && (
            <p className="text-muted-foreground">
              Record: {wins}-{losses}
              {ties > 0 ? `-${ties}` : ""}
            </p>
          )}
        </div>
        <Link href="/games/new">
          <Button>New Game</Button>
        </Link>
      </div>

      {games.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No games yet. Generate your first lineup to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {[...games].reverse().map((game) => (
            <Link key={game.id} href={`/games/${game.id}`}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-lg font-bold text-muted-foreground">
                        #{game.game_number}
                      </span>
                      <div>
                        <div className="font-medium">
                          {game.opponent
                            ? `vs ${game.opponent}`
                            : "Game " + game.game_number}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {game.date}
                        </div>
                      </div>
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
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
