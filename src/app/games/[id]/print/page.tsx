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
  INFIELD_POSITIONS,
  OUTFIELD_POSITIONS,
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
    return <div className="p-8 text-[#6B7280]">Loading lineup...</div>;
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

  // Position cell styling
  function posCellClass(pos: string): string {
    if (pos === "P") return "cell-pitcher";
    if (pos === "BENCH" || pos === "BN") return "cell-bench";
    if (INFIELD_POSITIONS.includes(pos as Position)) return "cell-infield";
    if (OUTFIELD_POSITIONS.includes(pos as Position)) return "cell-outfield";
    if (pos === "C") return "cell-infield";
    return "";
  }

  const homeVisitor = game.home_away
    ? game.home_away === "home"
      ? "HOME"
      : "VISITOR"
    : "";

  return (
    <div className="print-lineup-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        .print-lineup-page {
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          color: #0B1F3A;
          padding: 12px;
          max-width: 680px;
          margin: 0 auto;
        }

        /* ─── Action Buttons ─────────────────────── */
        .print-actions {
          display: flex;
          gap: 10px;
          justify-content: center;
          margin-bottom: 20px;
        }
        .print-actions button {
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 14px;
          font-family: 'Inter', sans-serif;
          border: none;
          cursor: pointer;
          transition: all 0.15s;
        }
        .print-actions button:active { opacity: 0.7; transform: scale(0.98); }
        .btn-share {
          background: #1E63E9;
          color: white;
          box-shadow: 0 2px 8px rgba(30, 99, 233, 0.3);
        }
        .btn-share:hover { background: #2F80FF; }
        .btn-print {
          background: #F0F4F8;
          color: #0B1F3A;
        }
        .btn-print:hover { background: #E2E8F0; }

        /* ─── Card Container ─────────────────────── */
        .lineup-card {
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid #E6ECF5;
          box-shadow: 0 1px 4px rgba(0,0,0,0.04);
          overflow: hidden;
        }

        /* ─── Header ────────────────────────────── */
        .card-header {
          background: #1E63E9;
          padding: 18px 20px 16px;
          text-align: center;
          position: relative;
        }
        .card-header::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #FFC857, #FFC857 30%, #2F80FF 30%);
        }
        .header-team {
          font-size: 20px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #ffffff;
          line-height: 1.2;
        }
        .header-opponent {
          font-size: 14px;
          font-weight: 500;
          color: rgba(255,255,255,0.85);
          margin-top: 3px;
        }
        .header-meta {
          font-size: 11px;
          font-weight: 500;
          color: rgba(255,255,255,0.6);
          margin-top: 4px;
          letter-spacing: 0.3px;
        }
        .hv-badge {
          display: inline-block;
          background: rgba(255,255,255,0.2);
          border-radius: 4px;
          padding: 1px 6px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.5px;
          margin-left: 6px;
          vertical-align: middle;
          color: #ffffff;
        }

        /* ─── Section Title ──────────────────────── */
        .section-title {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 20px 8px;
        }
        .section-title-text {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: #1E63E9;
          white-space: nowrap;
        }
        .section-title-line {
          flex: 1;
          height: 1px;
          background: #E6ECF5;
        }

        /* ─── Tables ─────────────────────────────── */
        .lineup-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          table-layout: fixed;
        }
        .lineup-table th,
        .lineup-table td {
          padding: 5px 4px;
          text-align: center;
          border-bottom: 1px solid #F0F4F8;
        }
        .lineup-table th {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #6B7280;
          padding: 8px 4px 6px;
          background: #FAFBFD;
          border-bottom: 2px solid #E6ECF5;
        }

        /* Order number column */
        .cell-order {
          font-weight: 800;
          font-size: 13px;
          color: #1E63E9;
          width: 28px;
        }

        /* Player name column */
        .cell-player {
          text-align: left;
          font-weight: 600;
          padding-left: 8px !important;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: #0B1F3A;
          font-size: 11px;
        }

        /* Position label column */
        .cell-pos-label {
          text-align: left;
          font-weight: 700;
          padding-left: 8px !important;
          color: #0B1F3A;
          font-size: 11px;
          width: 42px;
        }

        /* Position cell treatments */
        .cell-pitcher {
          background: #EBF3FF;
          color: #1E63E9;
          font-weight: 700;
        }
        .cell-bench {
          color: #94A3B8;
          font-style: italic;
          font-weight: 400;
          background: #FAFBFD;
        }
        .cell-infield {
          color: #0B1F3A;
          font-weight: 600;
        }
        .cell-outfield {
          color: #374151;
          font-weight: 500;
        }

        /* Name cell in position table */
        .name-cell {
          font-size: 10px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .bench-names {
          font-size: 9px;
          color: #94A3B8;
          font-style: italic;
        }

        /* Alternating row tint */
        .lineup-table tbody tr:nth-child(even) {
          background: #FAFBFD;
        }

        /* ─── Pitching Rotation Card ─────────────── */
        .pitching-card {
          margin: 12px 16px;
          padding: 10px 14px;
          background: #EBF3FF;
          border-radius: 10px;
          border: 1px solid #D4E3FC;
        }
        .pitching-label {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          color: #1E63E9;
          margin-bottom: 6px;
        }
        .pitching-slots {
          display: flex;
          flex-wrap: wrap;
          gap: 4px 12px;
          font-size: 11px;
          color: #0B1F3A;
        }
        .pitching-slot {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .pitching-slot-num {
          font-weight: 800;
          color: #1E63E9;
          font-size: 12px;
          min-width: 12px;
        }
        .pitching-slot-name {
          font-weight: 500;
        }
        .pitching-slot-count {
          font-size: 9px;
          color: #6B7280;
        }

        /* ─── Absent ─────────────────────────────── */
        .absent-line {
          font-size: 10px;
          color: #94A3B8;
          padding: 4px 20px 0;
        }

        /* ─── Divider ────────────────────────────── */
        .card-divider {
          position: relative;
          height: 24px;
          margin: 8px 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .card-divider::before {
          content: '';
          position: absolute;
          width: 100%;
          height: 1px;
          background: #E6ECF5;
        }
        .card-divider-diamond {
          position: relative;
          z-index: 1;
          width: 8px;
          height: 8px;
          background: white;
          border: 2px solid #1E63E9;
          transform: rotate(45deg);
        }

        /* ─── Footer ─────────────────────────────── */
        .card-footer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 20px 12px;
          border-top: 1px solid #F0F4F8;
        }
        .footer-diamond {
          width: 6px;
          height: 6px;
          background: #1E63E9;
          transform: rotate(45deg);
          flex-shrink: 0;
        }
        .footer-text {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.5px;
          color: #94A3B8;
        }
        .footer-iq {
          color: #2F80FF;
        }

        /* ─── Print Overrides ────────────────────── */
        @media print {
          .print-actions { display: none; }
          .print-lineup-page { padding: 0; max-width: none; }
          .lineup-card { box-shadow: none; border: none; }
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
          Print / PDF
        </button>
      </div>

      {/* ===== CAPTURABLE CONTENT ===== */}
      <div ref={contentRef}>
        <div className="lineup-card">

          {/* ─── Header ─────────────────────────── */}
          <div className="card-header">
            <div className="header-team">{teamName}</div>
            {game.opponent && (
              <div className="header-opponent">vs {game.opponent}</div>
            )}
            <div className="header-meta">
              Game {game.game_number}
              {game.date ? ` \u2022 ${game.date}` : ""}
              {homeVisitor && <span className="hv-badge">{homeVisitor}</span>}
            </div>
          </div>

          {/* ─── Batting Order Section ───────────── */}
          <div className="section-title">
            <span className="section-title-text">Batting Order</span>
            <div className="section-title-line" />
          </div>

          <div style={{ padding: "0 16px" }}>
            <table className="lineup-table">
              <thead>
                <tr>
                  <th style={{ width: "28px" }}>#</th>
                  <th style={{ textAlign: "left", paddingLeft: 8 }}>Player</th>
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
                      <td className="cell-order">{b.order_position}</td>
                      <td className="cell-player">{playerLabel(player)}</td>
                      {inningCols.map((inn) => {
                        const pos = getPlayerPosition(b.player_id, inn);
                        const isBench = pos === "BENCH";
                        const displayPos = isBench ? "BN" : pos;
                        return (
                          <td
                            key={inn}
                            className={posCellClass(pos === "BENCH" ? "BN" : pos)}
                          >
                            {displayPos}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {absences.length > 0 && (
            <div className="absent-line" style={{ paddingTop: 6 }}>
              Absent:{" "}
              {absences
                .map((a) => playerMap.get(a.player_id)?.name ?? "?")
                .join(", ")}
            </div>
          )}

          {/* ─── Pitching Rotation ───────────────── */}
          {pitchingPlan.length > 0 && (
            <div className="pitching-card">
              <div className="pitching-label">Pitching Rotation</div>
              <div className="pitching-slots">
                {pitchingPlan.map((pp) => (
                  <div key={pp.inning} className="pitching-slot">
                    <span className="pitching-slot-num">{pp.inning}</span>
                    <span className="pitching-slot-name">
                      {playerMap.get(pp.player_id)?.name}
                    </span>
                    {pp.pitch_count > 0 && (
                      <span className="pitching-slot-count">({pp.pitch_count}p)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Divider ────────────────────────── */}
          <div className="card-divider">
            <div className="card-divider-diamond" />
          </div>

          {/* ─── Field Positions Section ─────────── */}
          <div className="section-title">
            <span className="section-title-text">Field Positions</span>
            <div className="section-title-line" />
          </div>

          <div style={{ padding: "0 16px" }}>
            <table className="lineup-table">
              <thead>
                <tr>
                  <th style={{ width: "42px", textAlign: "left", paddingLeft: 8 }}>Pos</th>
                  {inningCols.map((inn) => (
                    <th key={inn}>Inn {inn}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FIELD_POSITIONS.map((pos) => (
                  <tr key={pos}>
                    <td className={`cell-pos-label ${pos === "P" ? "cell-pitcher" : ""}`}>{pos}</td>
                    {inningCols.map((inn) => {
                      const player = getPlayerAtPosition(inn, pos);
                      return (
                        <td
                          key={inn}
                          className={`name-cell ${pos === "P" ? "cell-pitcher" : ""}`}
                        >
                          {playerNameShort(player)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="cell-pos-label" style={{ color: "#94A3B8" }}>BN</td>
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
          </div>

          {absences.length > 0 && (
            <div className="absent-line" style={{ paddingBottom: 4 }}>
              Absent:{" "}
              {absences
                .map((a) => playerMap.get(a.player_id)?.name ?? "?")
                .join(", ")}
            </div>
          )}

          {/* ─── Footer ─────────────────────────── */}
          <div className="card-footer">
            <div className="footer-diamond" />
            <span className="footer-text">
              Generated by Lineup<span className="footer-iq">IQ</span>
            </span>
          </div>

        </div>
      </div>
      {/* end capturable content */}
    </div>
  );
}
