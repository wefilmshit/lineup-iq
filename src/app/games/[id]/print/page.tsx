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

/* ─── Position group boundaries for visual separators ─── */
const GROUP_END_POSITIONS = new Set<Position>(["C", "3B"]);

/* ─── Column alternation tint for ESPN-style vertical lanes ─── */
const COL_TINT = "rgba(30, 99, 233, 0.03)";
const COL_TINT_HEADER = "#E8ECF3";
const COL_CLEAR_HEADER = "#F0F4F8";

export default function PrintLineupPage() {
  const params = useParams();
  const gameId = params.id as string;
  const shareRef = useRef<HTMLDivElement>(null);

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
    if (!shareRef.current) return;
    setSharing(true);
    try {
      const dataUrl = await toPng(shareRef.current, {
        backgroundColor: "#F7F9FC",
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

  /* ─── Helpers ───────────────────────────────────────── */

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

  function playerNameShort(p: Player | undefined): string {
    if (!p) return "";
    return p.name;
  }

  /** Short date: "2026-03-14" → "Mar 14, 2026" */
  function formatDateShort(dateStr: string): string {
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const d = new Date(dateStr + "T12:00:00");
    if (isNaN(d.getTime())) return dateStr;
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  const homeVisitor = game.home_away
    ? game.home_away === "home"
      ? "HOME"
      : "VISITOR"
    : "";

  /* ─── Shared Card Content ──────────────────────────── */
  /* Rendered in both the on-screen preview and the       */
  /* off-screen share image capture.                      */

  function renderCardContent() {
    if (!game) return null;
    return (
      <>
        {/* ─── Header ──────────────────────────── */}
        <div className="lq-header">
          <div className="lq-header-team">{teamName}</div>
          {game.opponent && (
            <div className="lq-header-opponent">
              <span className="lq-header-vs">vs </span>
              {game.opponent.toUpperCase()}
            </div>
          )}
          <div className="lq-header-meta">
            Game {game.game_number}
            {game.date ? ` \u00b7 ${formatDateShort(game.date)}` : ""}
            {homeVisitor && (
              <span className="lq-hv-badge">{homeVisitor}</span>
            )}
          </div>
        </div>

        {/* ─── Pitching Rotation Tiles ──────────── */}
        {pitchingPlan.length > 0 && (
          <div className="lq-pitching">
            <div className="lq-pitching-label">Pitching Rotation</div>
            <div className="lq-pitching-tiles">
              {pitchingPlan.map((pp) => {
                const pitcher = playerMap.get(pp.player_id);
                return (
                  <div key={pp.inning} className="lq-pitch-tile">
                    <span className="lq-pitch-tile-inn">Inn {pp.inning}</span>
                    <span className="lq-pitch-tile-name">
                      {pitcher?.name ?? "?"}
                    </span>
                    {pitcher?.jersey_number != null && (
                      <span className="lq-pitch-tile-jersey">
                        #{pitcher.jersey_number}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Batting Order (clean vertical list) ── */}
        <div className="lq-section-title">
          <span className="lq-section-title-text">Batting Order</span>
          <div className="lq-section-title-line" />
        </div>

        <div className="lq-batting-list">
          {battingOrder.map((b) => {
            const player = playerMap.get(b.player_id);
            return (
              <div key={b.player_id} className="lq-batting-row">
                <span className="lq-batting-num">{b.order_position}</span>
                <span className="lq-batting-player">
                  {player?.name ?? "?"}
                  {player?.jersey_number != null && (
                    <span className="lq-batting-jersey">
                      #{player.jersey_number}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        {absences.length > 0 && (
          <div className="lq-absent-line">
            Absent:{" "}
            {absences
              .map((a) => playerMap.get(a.player_id)?.name ?? "?")
              .join(", ")}
          </div>
        )}

        {/* ─── Divider ─────────────────────────── */}
        <div className="lq-divider">
          <div className="lq-divider-diamond" />
        </div>

        {/* ─── Field Positions Table ────────────── */}
        <div className="lq-section-title">
          <span className="lq-section-title-text">Field Positions</span>
          <div className="lq-section-title-line" />
        </div>

        <div style={{ padding: "0 8px 4px" }}>
          <table className="lq-field-table">
            <thead>
              <tr>
                <th
                  style={{
                    width: "34px",
                    textAlign: "left",
                    paddingLeft: 8,
                  }}
                >
                  Pos
                </th>
                {inningCols.map((inn) => (
                  <th
                    key={inn}
                    style={{
                      background:
                        inn % 2 === 0 ? COL_TINT_HEADER : COL_CLEAR_HEADER,
                    }}
                  >
                    {inn}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FIELD_POSITIONS.map((pos) => {
                const isPitcher = pos === "P";
                const isCatcher = pos === "C";
                const isInfield = INFIELD_POSITIONS.includes(pos);
                const isGroupEnd = GROUP_END_POSITIONS.has(pos);

                return (
                  <tr
                    key={pos}
                    className={[
                      isPitcher ? "lq-row-pitcher" : "",
                      isGroupEnd ? "lq-group-end" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <td
                      className="lq-pos-label"
                      style={
                        isPitcher
                          ? { color: "#DC2626", fontWeight: 800 }
                          : undefined
                      }
                    >
                      {pos}
                    </td>
                    {inningCols.map((inn) => {
                      const player = getPlayerAtPosition(inn, pos);
                      const colBg = inn % 2 === 0 ? COL_TINT : undefined;

                      return (
                        <td
                          key={inn}
                          className={[
                            "lq-name",
                            isPitcher ? "lq-pitcher-text" : "",
                            (isInfield || isCatcher) && !isPitcher
                              ? "lq-infield-text"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={
                            !isPitcher && colBg
                              ? { background: colBg }
                              : undefined
                          }
                        >
                          {playerNameShort(player)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* ─── Bench Row (stacked names) ──── */}
              <tr className="lq-row-bench">
                <td className="lq-bench-label">BN</td>
                {inningCols.map((inn) => {
                  const benchPlayers = getBenchPlayers(inn);
                  return (
                    <td
                      key={inn}
                      style={
                        inn % 2 === 0 ? { background: COL_TINT } : undefined
                      }
                    >
                      <div className="lq-bench-cell">
                        {benchPlayers.map((p) => (
                          <span key={p.id} className="lq-bench-name">
                            {p.name}
                          </span>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {/* ─── Footer ──────────────────────────── */}
        <div className="lq-footer">
          <div className="lq-footer-diamond" />
          <span className="lq-footer-text">
            Generated by Lineup<span className="lq-footer-iq">IQ</span>
          </span>
        </div>
      </>
    );
  }

  /* ─── Render ───────────────────────────────────────── */

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

        /* ═══════════════════════════════════════════
           UNIFIED CARD DESIGN — used by preview,
           print/PDF, and share-as-image
           ═══════════════════════════════════════════ */

        /* ─── Card Shell ─────────────────────────── */
        .lq-card {
          background: #ffffff;
          border-radius: 14px;
          border: 1px solid #E6ECF5;
          box-shadow: 0 2px 16px rgba(11, 31, 58, 0.07);
          overflow: hidden;
        }

        /* ─── Share-image outer wrapper (390px) ──── */
        .share-outer {
          background: #F7F9FC;
          padding: 10px;
          width: 390px;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          color: #0B1F3A;
        }

        /* ─── Header ────────────────────────────── */
        .lq-header {
          background: linear-gradient(180deg, #1E63E9 0%, #1856D0 100%);
          padding: 14px 18px 12px;
          text-align: center;
          position: relative;
        }
        .lq-header::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #FFC857, #FFC857 30%, #2F80FF 30%);
        }
        .lq-header-team {
          font-size: 18px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          color: #ffffff;
          line-height: 1.15;
        }
        .lq-header-opponent {
          font-size: 14px;
          font-weight: 700;
          color: rgba(255,255,255,0.92);
          margin-top: 2px;
          letter-spacing: 0.5px;
        }
        .lq-header-vs {
          font-weight: 500;
          text-transform: lowercase;
          letter-spacing: 0;
          opacity: 0.7;
        }
        .lq-header-meta {
          font-size: 11px;
          font-weight: 500;
          color: rgba(255,255,255,0.5);
          margin-top: 3px;
          letter-spacing: 0.3px;
        }
        .lq-hv-badge {
          display: inline-block;
          background: rgba(255,255,255,0.18);
          border-radius: 3px;
          padding: 1px 6px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.6px;
          margin-left: 5px;
          vertical-align: middle;
          color: #ffffff;
        }

        /* ─── Pitching Tiles ─────────────────────── */
        .lq-pitching {
          padding: 8px 12px 9px;
          background: #ffffff;
          border-bottom: 1px solid #E6ECF5;
        }
        .lq-pitching-label {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          color: #DC2626;
          margin-bottom: 5px;
        }
        .lq-pitching-tiles {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .lq-pitch-tile {
          flex: 1;
          min-width: 68px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0px;
          background: #ffffff;
          border: 1px solid #E6ECF5;
          border-radius: 8px;
          padding: 5px 6px 6px;
        }
        .lq-pitch-tile-inn {
          font-size: 8px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: #DC2626;
          line-height: 1;
          margin-bottom: 2px;
        }
        .lq-pitch-tile-name {
          font-size: 13px;
          font-weight: 700;
          color: #0B1F3A;
          line-height: 1.15;
        }
        .lq-pitch-tile-jersey {
          font-size: 10px;
          font-weight: 500;
          color: #94A3B8;
          line-height: 1;
          margin-top: 1px;
        }

        /* ─── Section Title ──────────────────────── */
        .lq-section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px 5px;
        }
        .lq-section-title-text {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: #1E63E9;
          white-space: nowrap;
        }
        .lq-section-title-line {
          flex: 1;
          height: 1px;
          background: #E6ECF5;
        }

        /* ─── Batting Order (clean list) ─────────── */
        .lq-batting-list {
          padding: 0 12px 2px;
        }
        .lq-batting-row {
          display: flex;
          align-items: baseline;
          padding: 3.5px 0;
          border-bottom: 1px solid #F0F4F8;
        }
        .lq-batting-row:last-child {
          border-bottom: none;
        }
        .lq-batting-num {
          width: 24px;
          font-size: 14px;
          font-weight: 800;
          color: #1E63E9;
          text-align: center;
          flex-shrink: 0;
        }
        .lq-batting-player {
          flex: 1;
          font-size: 13px;
          font-weight: 600;
          color: #0B1F3A;
          padding-left: 4px;
          white-space: nowrap;
        }
        .lq-batting-jersey {
          font-weight: 500;
          color: #94A3B8;
          font-size: 11px;
          margin-left: 3px;
        }

        /* ─── Divider ────────────────────────────── */
        .lq-divider {
          position: relative;
          height: 16px;
          margin: 2px 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .lq-divider::before {
          content: '';
          position: absolute;
          width: 100%;
          height: 1px;
          background: #E6ECF5;
        }
        .lq-divider-diamond {
          position: relative;
          z-index: 1;
          width: 7px;
          height: 7px;
          background: white;
          border: 1.5px solid #1E63E9;
          transform: rotate(45deg);
        }

        /* ─── Absent ─────────────────────────────── */
        .lq-absent-line {
          font-size: 10px;
          color: #94A3B8;
          padding: 3px 12px 0;
        }

        /* ─── Field Positions Table ──────────────── */
        .lq-field-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          table-layout: fixed;
        }
        .lq-field-table th {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          color: #6B7280;
          padding: 6px 2px 5px;
          border-bottom: 2px solid #E6ECF5;
        }
        .lq-field-table td {
          padding: 4px 2px;
          text-align: center;
          border-bottom: 1px solid #F0F4F8;
        }

        /* Position label column */
        .lq-pos-label {
          text-align: left;
          font-weight: 700;
          padding-left: 8px !important;
          color: #0B1F3A;
          font-size: 11px;
          width: 34px;
        }

        /* Name cells */
        .lq-name {
          font-size: 10.5px;
          font-weight: 500;
          color: #374151;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Pitcher row — red text accent */
        .lq-row-pitcher td:first-child {
          border-left: 3px solid #DC2626;
        }
        .lq-pitcher-text {
          color: #DC2626;
          font-weight: 700;
        }

        /* Infield cells */
        .lq-infield-text {
          color: #0B1F3A;
          font-weight: 600;
        }

        /* Group separator */
        .lq-group-end td {
          border-bottom: 2px solid #E6ECF5;
        }

        /* Bench row — stacked names per inning */
        .lq-row-bench td {
          border-bottom: none;
          vertical-align: top;
          padding-top: 5px;
          padding-bottom: 5px;
        }
        .lq-bench-label {
          text-align: left;
          font-weight: 600;
          padding-left: 8px !important;
          color: #94A3B8;
          font-size: 10px;
          vertical-align: middle;
        }
        .lq-bench-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1px;
        }
        .lq-bench-name {
          font-size: 9px;
          font-weight: 500;
          color: #8896AB;
          line-height: 1.25;
          white-space: nowrap;
        }

        /* ─── Footer ─────────────────────────────── */
        .lq-footer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 12px 10px;
          border-top: 1px solid #F0F4F8;
        }
        .lq-footer-diamond {
          width: 5px;
          height: 5px;
          background: #1E63E9;
          transform: rotate(45deg);
          flex-shrink: 0;
        }
        .lq-footer-text {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.5px;
          color: #94A3B8;
        }
        .lq-footer-iq {
          color: #2F80FF;
        }

        /* ─── Print Overrides ────────────────────── */
        @media print {
          .print-actions { display: none; }
          .share-offscreen { display: none !important; }
          .print-lineup-page { padding: 0; max-width: none; }
          .lq-card { box-shadow: none; border: none; border-radius: 0; }
          .lq-header { border-radius: 0; }
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

      {/* ===== ON-SCREEN PREVIEW / PRINT ===== */}
      <div className="lq-card">
        {renderCardContent()}
      </div>

      {/* ===== SHARE AS IMAGE (off-screen, 390px) ===== */}
      <div
        className="share-offscreen"
        style={{ position: "absolute", left: "-9999px", top: 0 }}
      >
        <div ref={shareRef}>
          <div className="share-outer">
            <div className="lq-card">
              {renderCardContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
