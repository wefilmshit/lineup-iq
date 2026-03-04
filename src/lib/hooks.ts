"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";
import { Team, Player, Game, GameLineup, BattingOrder } from "./types";

// Auto-create a default team if none exists
async function ensureTeam(): Promise<Team> {
  const { data: teams } = await supabase
    .from("teams")
    .select("*")
    .limit(1);

  if (teams && teams.length > 0) return teams[0] as Team;

  const { data: newTeam, error } = await supabase
    .from("teams")
    .insert({ name: "My Team", season: "Spring 2026", innings_per_game: 4 })
    .select()
    .single();

  if (error) throw error;
  return newTeam as Team;
}

export function useTeam() {
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ensureTeam().then((t) => {
      setTeam(t);
      setLoading(false);
    });
  }, []);

  const updateTeam = useCallback(
    async (updates: Partial<Team>) => {
      if (!team) return;
      const { data, error } = await supabase
        .from("teams")
        .update(updates)
        .eq("id", team.id)
        .select()
        .single();
      if (!error && data) setTeam(data as Team);
      return { data, error };
    },
    [team]
  );

  return { team, loading, updateTeam };
}

export function usePlayers(teamId: string | undefined) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!teamId) return;
    const { data } = await supabase
      .from("players")
      .select("*")
      .eq("team_id", teamId)
      .order("jersey_number", { ascending: true });
    if (data) setPlayers(data as Player[]);
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { players, loading, refresh };
}

export function useGames(teamId: string | undefined) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!teamId) return;
    const { data } = await supabase
      .from("games")
      .select("*")
      .eq("team_id", teamId)
      .order("game_number", { ascending: true });
    if (data) setGames(data as Game[]);
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { games, loading, refresh };
}

export function useSeasonData(teamId: string | undefined) {
  const [lineups, setLineups] = useState<GameLineup[]>([]);
  const [battingOrders, setBattingOrders] = useState<BattingOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!teamId) return;

    // Get all game IDs for this team
    const { data: games } = await supabase
      .from("games")
      .select("id")
      .eq("team_id", teamId);

    if (!games || games.length === 0) {
      setLoading(false);
      return;
    }

    const gameIds = games.map((g) => g.id);

    const [lineupsRes, battingRes] = await Promise.all([
      supabase.from("game_lineups").select("*").in("game_id", gameIds),
      supabase.from("batting_orders").select("*").in("game_id", gameIds),
    ]);

    if (lineupsRes.data) setLineups(lineupsRes.data as GameLineup[]);
    if (battingRes.data) setBattingOrders(battingRes.data as BattingOrder[]);
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { lineups, battingOrders, loading, refresh };
}
