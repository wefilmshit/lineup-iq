"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";
import {
  Team,
  Player,
  Game,
  GameLineup,
  BattingOrder,
  PitchingPlan,
  GameAbsence,
} from "./types";

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
  const [pitchingPlans, setPitchingPlans] = useState<PitchingPlan[]>([]);
  const [absences, setAbsences] = useState<GameAbsence[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!teamId) return;

    // Get all games for this team (need innings for filtering)
    const { data: games } = await supabase
      .from("games")
      .select("*")
      .eq("team_id", teamId);

    if (!games || games.length === 0) {
      setLoading(false);
      return;
    }

    const gameIds = games.map((g) => g.id);
    // Build map of game_id -> actual innings played
    const gameInningsMap = new Map<string, number>();
    for (const g of games) {
      gameInningsMap.set(g.id, (g as Game).innings);
    }

    const [lineupsRes, battingRes, pitchingRes, absencesRes] =
      await Promise.all([
        supabase.from("game_lineups").select("*").in("game_id", gameIds),
        supabase.from("batting_orders").select("*").in("game_id", gameIds),
        supabase.from("pitching_plans").select("*").in("game_id", gameIds),
        supabase.from("game_absences").select("*").in("game_id", gameIds),
      ]);

    // Filter lineups to only include innings actually played
    const filteredLineups = (lineupsRes.data || []).filter((l) => {
      const actualInnings = gameInningsMap.get(l.game_id);
      return actualInnings === undefined || l.inning <= actualInnings;
    }) as GameLineup[];

    const filteredPitching = (pitchingRes.data || []).filter((p) => {
      const actualInnings = gameInningsMap.get(p.game_id);
      return actualInnings === undefined || p.inning <= actualInnings;
    }) as PitchingPlan[];

    setLineups(filteredLineups);
    if (battingRes.data) setBattingOrders(battingRes.data as BattingOrder[]);
    setPitchingPlans(filteredPitching);
    if (absencesRes.data) setAbsences(absencesRes.data as GameAbsence[]);
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { lineups, battingOrders, pitchingPlans, absences, loading, refresh };
}
