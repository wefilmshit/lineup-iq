"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
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
import { toPng } from "html-to-image";

export default function PrintLineupPage() {
  const params = useParams();
  const gameId = params.id as string;
  const contentRef = useRef<HTMLDivElement>(null);

  const [game, setGame] = useState<Game | null>(null);
  const [teamName, setTeamName] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [lineups, setLineups] = useState<GameLineup[]>([]);
  const [battingOrder, setBattingOrder] = useState<BattingOrder[]>([]);
  const [pitchingPlan, setPitchingPlan] = useState<PitchingPlan[]>([]);
  const [absences, setAbsences] = useState<GameAbsence[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

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

  async function shareAsImage() {
    if (!contentRef.current) return;
    setSharing(true);
    try {
      const dataUrl = await toPng(contentRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
      });

      const blob = await (await fetch(dataUrl)).blob();
      const file = new File(
        [blob],
        `lineup-game${game?.game_number ?? ""}.png`,
        { type: "image/png" }
      );

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Game ${game?.game_number} Lineup`,
        });
      } else {
        const link = document.createElement("a");
        link.download = file.name;
        link.href = dataUrl;
        link.click();
      }
    } catch {
      // user cancelled share
    } finally {
      setSharing(false);
    }
  }

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

  function playerLabel(p: Player | undefined): string {
    if (!p) return "?";
    return p.jersey_number ? `${p.name} #${p.jersey_number}` : p.name;
  }

  function playerNameShort(p: Player | undefined): string {
    if (!p) return "";
    return p.name;
  }

  const homeVisitor = game.home_away
    ? game.home_away === "home"
      ? "HOME"
      : "VISITOR"
    : "";

  return (
    <div className="print-lineup-page">
      <style>{`
        .print-lineup-page {
          font-family: system-ui, -apple-system, sans-serif;
          color: #1a1a1a;
          padding: 12px;
          max-width: 680px;
          margin: 0 auto;
        }

        /* Action buttons */
        .print-actions {
          display: flex;
          gap: 8px;
          justify-content: center;
          margin-bottom: 16px;
        }
        .print-actions button {
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 14px;
          border: none;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .print-actions button:active { opacity: 0.7; }
        .btn-share {
          background: #1e40af;
          color: white;
        }
        .btn-print {
          background: #e5e7eb;
          color: #374151;
        }

        /* Baseball header */
        .lineup-header {
          text-align: center;
          margin-bottom: 10px;
          padding-bottom: 8px;
          position: relative;
        }
        .lineup-header::after {
          content: '';
          display: block;
          margin: 8px auto 0;
          width: 80%;
          height: 3px;
          background: linear-gradient(90deg, transparent, #0a6ff2, transparent);
        }
        .team-name {
          font-size: 18px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #1e293b;
        }
        .game-info {
          font-size: 12px;
          color: #64748b;
          margin-top: 2px;
        }
        .game-info .hv-badge {
          display: inline-block;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 3px;
          padding: 0 4px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.5px;
          margin-left: 4px;
          vertical-align: middle;
        }
        .section-label {
          font-size: 11px;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-top: 2px;
        }

        /* Baseball seam divider */
        .seam-divider {
          position: relative;
          height: 20px;
          margin: 14px 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .seam-divider::before {
          content: '';
          position: absolute;
          width: 100%;
          height: 1px;
          background: #e2e8f0;
        }
        .seam-diamond {
          position: relative;
          z-index: 1;
          width: 10px;
          height: 10px;
          background: white;
          border: 2px solid #0a6ff2;
          transform: rotate(45deg);
        }

        /* Tables */
        .lineup-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          table-layout: fixed;
        }
        .lineup-table th,
        .lineup-table td {
          border: 1px solid #e2e8f0;
          padding: 4px 3px;
          text-align: center;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .lineup-table th {
          background: #f8fafc;
          font-weight: 700;
          font-size: 10px;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .lineup-table td.player-col {
          text-align: left;
          font-weight: 600;
          padding-left: 6px;
          white-space: nowrap;
        }
        .lineup-table td.pos-col {
          text-align: left;
          font-weight: 700;
          padding-left: 6px;
          color: #475569;
        }
        .lineup-table td.pitcher-cell {
          background: #eff6ff;
          color: #0a6ff2;
          font-weight: 700;
        }
        .lineup-table td.bench-cell {
          background: #f8fafc;
          color: #94a3b8;
          font-style: italic;
        }
        .lineup-table .order-num {
          font-weight: 800;
          color: #64748b;
        }

        /* Position table - auto-fit with first name */
        .pos-table td.name-cell {
          font-size: 10px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pos-table .bench-names {
          font-size: 9px;
          color: #94a3b8;
          font-style: italic;
        }

        /* Pitching line */
        .pitching-line {
          font-size: 10px;
          color: #64748b;
          margin-top: 6px;
          padding: 4px 6px;
          background: #eff6ff;
          border-radius: 4px;
          border-left: 3px solid #0a6ff2;
        }
        .pitching-line strong {
          color: #1e293b;
        }

        /* Absent */
        .absent-line {
          font-size: 10px;
          color: #94a3b8;
          margin-top: 4px;
        }

        /* Watermark */
        .watermark {
          text-align: center;
          font-size: 9px;
          color: #cbd5e1;
          margin-top: 10px;
          letter-spacing: 0.5px;
        }

        @media print {
          .print-actions { display: none; }
          .print-lineup-page { padding: 0; max-width: none; }
          @page {
            size: portrait;
            margin: 0.4in;
          }
        }
      `}</style>

      <div className="print-actions">
        <button
          className="btn-share"
          onClick={shareAsImage}
          disabled={sharing}
        >
          {sharing ? "Generating..." : "Share as Image"}
        </button>
        <button className="btn-print" onClick={() => window.print()}>
          Print
        </button>
      </div>

      {/* ===== CAPTURABLE CONTENT ===== */}
      <div ref={contentRef}>

        {/* ===== TOP: By Batting Order ===== */}
        <div className="lineup-header">
          <div className="team-name">{teamName}</div>
          <div className="game-info">
            Game {game.game_number}
            {game.opponent ? ` vs ${game.opponent}` : ""}
            {game.date ? ` \u2022 ${game.date}` : ""}
            {homeVisitor && <span className="hv-badge">{homeVisitor}</span>}
          </div>
          <div className="section-label">Batting Order</div>
        </div>

        <table className="lineup-table">
          <thead>
            <tr>
              <th style={{ width: "28px" }}>#</th>
              <th style={{ width: "auto", textAlign: "left", paddingLeft: 6 }}>Player</th>
              {inningCols.map((inn) => (
                <th key={inn} style={{ width: "44px" }}>Inn {inn}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {battingOrder.map((b) => {
              const player = playerMap.get(b.player_id);
              return (
                <tr key={b.player_id}>
                  <td className="order-num">{b.order_position}</td>
                  <td className="player-col">{playerLabel(player)}</td>
                  {inningCols.map((inn) => {
                    const pos = getPlayerPosition(b.player_id, inn);
                    const isPitcher = pos === "P";
                    const isBench = pos === "BENCH";
                    return (
                      <td
                        key={inn}
                        className={
                          isPitcher
                            ? "pitcher-cell"
                            : isBench
                            ? "bench-cell"
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
          <div className="absent-line">
            Absent:{" "}
            {absences
              .map((a) => playerMap.get(a.player_id)?.name ?? "?")
              .join(", ")}
          </div>
        )}

        {pitchingPlan.length > 0 && (
          <div className="pitching-line">
            <strong>Pitching:</strong>{" "}
            {pitchingPlan.map(
              (pp) =>
                `Inn ${pp.inning}: ${playerMap.get(pp.player_id)?.name}${
                  pp.pitch_count > 0 ? ` (${pp.pitch_count}p)` : ""
                }`
            ).join(" | ")}
          </div>
        )}

        {/* Seam divider */}
        <div className="seam-divider">
          <div className="seam-diamond" />
        </div>

        {/* ===== BOTTOM: By Position ===== */}
        <div className="lineup-header">
          <div className="team-name">{teamName}</div>
          <div className="game-info">
            Game {game.game_number}
            {game.opponent ? ` vs ${game.opponent}` : ""}
            {game.date ? ` \u2022 ${game.date}` : ""}
            {homeVisitor && <span className="hv-badge">{homeVisitor}</span>}
          </div>
          <div className="section-label">Lineup by Position</div>
        </div>

        <table className="lineup-table pos-table">
          <thead>
            <tr>
              <th style={{ width: "42px", textAlign: "left", paddingLeft: 6 }}>Pos</th>
              {inningCols.map((inn) => (
                <th key={inn}>Inn {inn}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FIELD_POSITIONS.map((pos) => (
              <tr key={pos}>
                <td className="pos-col">{pos}</td>
                {inningCols.map((inn) => {
                  const player = getPlayerAtPosition(inn, pos);
                  return (
                    <td
                      key={inn}
                      className={`name-cell ${pos === "P" ? "pitcher-cell" : ""}`}
                    >
                      {playerNameShort(player)}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td
                className="pos-col"
                style={{ background: "#f8fafc" }}
              >
                BN
              </td>
              {inningCols.map((inn) => (
                <td key={inn} className="bench-names">
                  {getBenchPlayers(inn)
                    .map((p) => p.name)
                    .join(", ")}
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        {absences.length > 0 && (
          <div className="absent-line">
            Absent:{" "}
            {absences
              .map((a) => playerMap.get(a.player_id)?.name ?? "?")
              .join(", ")}
          </div>
        )}

        <div className="watermark">LineupIQ</div>

      </div>
      {/* end capturable content */}
    </div>
  );
}
