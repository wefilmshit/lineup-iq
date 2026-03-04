"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Game,
  Player,
  GameLineup,
  BattingOrder,
  PitchingPlan,
  GameAbsence,
  Position,
  FIELD_POSITIONS,
} from "@/lib/types";
import { Button } from "@/components/ui/button";

export default function PrintLineupPage() {
  const params = useParams();
  const gameId = params.id as string;

  const [game, setGame] = useState<Game | null>(null);
  const [teamName, setTeamName] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [lineups, setLineups] = useState<GameLineup[]>([]);
  const [battingOrder, setBattingOrder] = useState<BattingOrder[]>([]);
  const [pitchingPlan, setPitchingPlan] = useState<PitchingPlan[]>([]);
  const [absences, setAbsences] = useState<GameAbsence[]>([]);
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

    const { data: teamData } = await supabase
      .from("teams")
      .select("name")
      .eq("id", g.team_id)
      .single();
    if (teamData) setTeamName(teamData.name);

    const [playersRes, lineupsRes, battingRes, pitchingRes, absencesRes] =
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
      ]);

    if (playersRes.data) setPlayers(playersRes.data as Player[]);
    if (lineupsRes.data) setLineups(lineupsRes.data as GameLineup[]);
    if (battingRes.data) setBattingOrder(battingRes.data as BattingOrder[]);
    if (pitchingRes.data) setPitchingPlan(pitchingRes.data as PitchingPlan[]);
    if (absencesRes.data) setAbsences(absencesRes.data as GameAbsence[]);
    setLoading(false);
  }, [gameId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading || !game) {
    return <div className="p-8 text-gray-500">Loading...</div>;
  }

  const innings = game.innings;
  const inningCols = Array.from({ length: innings }, (_, i) => i + 1);

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

  function getPlayerPosition(
    playerId: string,
    inning: number
  ): string {
    const assignment = lineups.find(
      (l) => l.player_id === playerId && l.inning === inning
    );
    return assignment?.position ?? "";
  }

  function getBenchPlayers(inning: number): Player[] {
    return lineups
      .filter((l) => l.inning === inning && l.position === "BENCH")
      .map((l) => playerMap.get(l.player_id))
      .filter(Boolean) as Player[];
  }

  const homeVisitor = game.home_away
    ? game.home_away === "home"
      ? "Home"
      : "Visitor"
    : "";
  const title = `${teamName}: Game ${game.game_number}${
    homeVisitor ? ` (${homeVisitor})` : ""
  }${game.opponent ? ` vs ${game.opponent}` : ""}`;
  const subtitle = game.date || "";

  return (
    <div className="print-page">
      <style>{`
        .print-page {
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 11px;
          color: #000;
          padding: 16px;
          max-width: 1100px;
          margin: 0 auto;
        }
        .print-header {
          text-align: center;
          margin-bottom: 8px;
          border-bottom: 2px solid #000;
          padding-bottom: 4px;
        }
        .print-header h1 {
          font-size: 16px;
          font-weight: 700;
          margin: 0;
        }
        .print-header p {
          font-size: 12px;
          color: #666;
          margin: 2px 0 0;
        }
        .print-section {
          margin-bottom: 12px;
        }
        .print-section h2 {
          font-size: 13px;
          font-weight: 700;
          margin: 0 0 4px;
          border-bottom: 1px solid #ccc;
          padding-bottom: 2px;
        }
        .print-table {
          width: 100%;
          border-collapse: collapse;
        }
        .print-table th,
        .print-table td {
          border: 1px solid #ccc;
          padding: 3px 6px;
          text-align: center;
          white-space: nowrap;
        }
        .print-table th {
          background: #f3f3f3;
          font-weight: 600;
          font-size: 10px;
        }
        .print-table td.player-name {
          text-align: left;
          font-weight: 500;
        }
        .print-table td.pos-pitcher {
          background: #f0e6ff;
          font-weight: 600;
        }
        .print-table td.pos-bench {
          background: #f5f5f5;
          color: #999;
        }
        .divider {
          border-top: 2px dashed #999;
          margin: 16px 0;
          page-break-before: avoid;
        }
        .absent-list {
          font-size: 10px;
          color: #999;
          margin-top: 4px;
        }
        .no-print {
          margin-bottom: 16px;
          text-align: center;
        }
        @media print {
          .no-print { display: none; }
          .print-page { padding: 0; }
          @page {
            size: landscape;
            margin: 0.4in;
          }
        }
      `}</style>

      <div className="no-print">
        <Button onClick={() => window.print()}>Print This Page</Button>
      </div>

      {/* ===== TOP HALF: By Batting Order ===== */}
      <div className="print-header">
        <h1>{title}</h1>
        <p>{subtitle} — Lineup by Batting Order</p>
      </div>

      <div className="print-section">
        <table className="print-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Jersey</th>
              {inningCols.map((inn) => (
                <th key={inn}>Inn {inn}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {battingOrder.map((b) => {
              const player = playerMap.get(b.player_id);
              return (
                <tr key={b.player_id}>
                  <td style={{ fontWeight: 700 }}>{b.order_position}</td>
                  <td className="player-name">{player?.name ?? "?"}</td>
                  <td>{player?.jersey_number ?? ""}</td>
                  {inningCols.map((inn) => {
                    const pos = getPlayerPosition(b.player_id, inn);
                    const isPitcher = pos === "P";
                    const isBench = pos === "BENCH";
                    return (
                      <td
                        key={inn}
                        className={
                          isPitcher
                            ? "pos-pitcher"
                            : isBench
                            ? "pos-bench"
                            : ""
                        }
                      >
                        {isBench ? "BN" : pos}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {absences.length > 0 && (
          <div className="absent-list">
            Absent:{" "}
            {absences
              .map((a) => playerMap.get(a.player_id)?.name ?? "?")
              .join(", ")}
          </div>
        )}
      </div>

      {/* Pitching summary */}
      {pitchingPlan.length > 0 && (
        <div className="print-section" style={{ fontSize: "10px" }}>
          <strong>Pitching:</strong>{" "}
          {pitchingPlan.map(
            (pp) =>
              `Inn ${pp.inning}: ${playerMap.get(pp.player_id)?.name}${
                pp.pitch_count > 0 ? ` (${pp.pitch_count}p)` : ""
              }`
          ).join(" | ")}
        </div>
      )}

      <div className="divider" />

      {/* ===== BOTTOM HALF: By Position ===== */}
      <div className="print-header">
        <h1>{title}</h1>
        <p>{subtitle} — Lineup by Position</p>
      </div>

      <div className="print-section">
        <table className="print-table">
          <thead>
            <tr>
              <th>Position</th>
              {inningCols.map((inn) => (
                <th key={inn}>Inn {inn}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FIELD_POSITIONS.map((pos) => (
              <tr key={pos}>
                <td style={{ fontWeight: 600, textAlign: "left" }}>{pos}</td>
                {inningCols.map((inn) => {
                  const player = getPlayerAtPosition(inn, pos);
                  return (
                    <td
                      key={inn}
                      className={pos === "P" ? "pos-pitcher" : ""}
                    >
                      {player ? `${player.name}` : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* Bench row */}
            <tr>
              <td
                style={{
                  fontWeight: 600,
                  textAlign: "left",
                  background: "#f5f5f5",
                }}
              >
                BENCH
              </td>
              {inningCols.map((inn) => (
                <td key={inn} className="pos-bench">
                  {getBenchPlayers(inn)
                    .map((p) => p.name)
                    .join(", ")}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        {absences.length > 0 && (
          <div className="absent-list">
            Absent:{" "}
            {absences
              .map((a) => playerMap.get(a.player_id)?.name ?? "?")
              .join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}
