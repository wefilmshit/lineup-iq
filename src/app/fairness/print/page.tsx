"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useTeam, usePlayers, useGames, useSeasonData } from "@/lib/hooks";
import { computeSeasonStats } from "@/lib/generate-lineup";
import {
  PlayerSeasonStats,
  AtBat,
  Position,
  FIELD_POSITIONS,
} from "@/lib/types";
import { toPng } from "html-to-image";

export default function PrintFairnessPage() {
  const contentRef = useRef<HTMLDivElement>(null);
  const { team, loading: teamLoading } = useTeam();
  const { players, loading: playersLoading } = usePlayers(team?.id);
  const { games, loading: gamesLoading } = useGames(team?.id);
  const finalizedGames = useMemo(
    () => games.filter((g) => g.is_finalized),
    [games]
  );
  const {
    lineups,
    battingOrders,
    pitchingPlans,
    absences,
    loading: seasonLoading,
  } = useSeasonData(team?.id, true);

  const [atBats, setAtBats] = useState<AtBat[]>([]);
  const [atBatsLoading, setAtBatsLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  const loadAtBats = useCallback(async () => {
    if (finalizedGames.length === 0) {
      setAtBats([]);
      setAtBatsLoading(false);
      return;
    }
    const gameIds = finalizedGames.map((g) => g.id);
    const { data } = await supabase
      .from("at_bats")
      .select("*")
      .in("game_id", gameIds);
    if (data) setAtBats(data as AtBat[]);
    setAtBatsLoading(false);
  }, [finalizedGames]);

  useEffect(() => {
    if (!gamesLoading) loadAtBats();
  }, [loadAtBats, gamesLoading]);

  const loading =
    teamLoading || playersLoading || gamesLoading || seasonLoading || atBatsLoading;

  const stats = useMemo(() => {
    if (players.length === 0) return [];
    const statsMap = computeSeasonStats(
      players,
      lineups,
      battingOrders,
      pitchingPlans,
      absences
    );
    return Array.from(statsMap.values()).sort(
      (a, b) => b.totalInnings - a.totalInnings
    );
  }, [players, lineups, battingOrders, pitchingPlans, absences]);

  const posColumns: Position[] = [...FIELD_POSITIONS, "BENCH"];

  // Batting order stats
  const battingStats = useMemo(() => {
    const filtered = stats.filter((s) => s.avgBattingPosition > 0);
    const sorted = [...filtered].sort(
      (a, b) => a.avgBattingPosition - b.avgBattingPosition
    );
    const maxSlot = Math.max(
      ...stats.map((s) =>
        Math.max(...Object.keys(s.battingSlotCounts).map(Number), 0)
      ),
      players.length
    );
    const slots = Array.from({ length: maxSlot }, (_, i) => i + 1);
    return { sorted, slots, maxSlot };
  }, [stats, players.length]);

  // Pitching stats
  const pitchers = useMemo(
    () =>
      stats
        .filter((s) => s.pitcherInnings > 0)
        .sort((a, b) => b.pitcherInnings - a.pitcherInnings),
    [stats]
  );

  // Batting hits
  const playerHits = useMemo(() => {
    const hitsByPlayer = new Map<string, number>();
    for (const ab of atBats) {
      hitsByPlayer.set(
        ab.player_id,
        (hitsByPlayer.get(ab.player_id) || 0) + 1
      );
    }
    return stats
      .map((s) => ({ name: s.playerName, hits: hitsByPlayer.get(s.playerId) || 0 }))
      .sort((a, b) => b.hits - a.hits);
  }, [stats, atBats]);

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
        `fairness-report-${team?.name ?? "team"}.png`,
        { type: "image/png" }
      );
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${team?.name} Fairness Report`,
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

  if (loading) {
    return <div style={{ padding: 32, color: "#94a3b8" }}>Loading...</div>;
  }

  if (stats.length === 0) {
    return (
      <div style={{ padding: 32, color: "#94a3b8" }}>
        No finalized games yet.
      </div>
    );
  }

  return (
    <div className="print-fairness-page">
      <style>{`
        .print-fairness-page {
          font-family: system-ui, -apple-system, sans-serif;
          color: #1a1a1a;
          padding: 12px;
          max-width: 780px;
          margin: 0 auto;
        }

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
        .btn-share { background: #0a6ff2; color: white; }
        .btn-print { background: #e5e7eb; color: #374151; }

        .report-header {
          text-align: center;
          margin-bottom: 10px;
          padding-bottom: 8px;
          position: relative;
        }
        .report-header::after {
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
        .report-subtitle {
          font-size: 12px;
          color: #64748b;
          margin-top: 2px;
        }

        .section-title {
          font-size: 11px;
          font-weight: 700;
          color: #0a6ff2;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 4px;
          margin-top: 12px;
        }

        .seam-divider {
          position: relative;
          height: 16px;
          margin: 10px 0;
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
          width: 8px;
          height: 8px;
          background: white;
          border: 2px solid #0a6ff2;
          transform: rotate(45deg);
        }

        .fair-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 10px;
          table-layout: auto;
        }
        .fair-table th,
        .fair-table td {
          border: 1px solid #e2e8f0;
          padding: 3px 4px;
          text-align: center;
        }
        .fair-table th {
          background: #f8fafc;
          font-weight: 700;
          font-size: 9px;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .fair-table td.player-col {
          text-align: left;
          font-weight: 600;
          padding-left: 5px;
          white-space: nowrap;
        }
        .fair-table td.zero { color: #d1d5db; }
        .fair-table td.total-col { font-weight: 700; }
        .fair-table td.avg-col {
          font-weight: 600;
          color: #64748b;
        }
        .fair-table td.high { color: #ea580c; font-weight: 700; }

        .pitch-row {
          display: flex;
          justify-content: space-between;
          padding: 2px 0;
          font-size: 10px;
          border-bottom: 1px solid #f1f5f9;
        }
        .pitch-row:last-child { border-bottom: none; }
        .pitch-name { font-weight: 600; }
        .pitch-stats { color: #64748b; }

        .hits-row {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          padding: 1px 0;
        }
        .hits-name { font-weight: 600; width: 80px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .hits-bar { flex: 1; height: 10px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
        .hits-fill { height: 100%; background: #22c55e; border-radius: 3px; }
        .hits-count { font-weight: 700; width: 20px; text-align: right; font-variant-numeric: tabular-nums; }

        .watermark {
          text-align: center;
          font-size: 9px;
          color: #cbd5e1;
          margin-top: 8px;
          letter-spacing: 0.5px;
        }

        @media print {
          .print-actions { display: none; }
          .print-fairness-page { padding: 0; max-width: none; }
          @page {
            size: portrait;
            margin: 0.4in;
          }
        }
      `}</style>

      <div className="print-actions">
        <button className="btn-share" onClick={shareAsImage} disabled={sharing}>
          {sharing ? "Generating..." : "Share as Image"}
        </button>
        <button className="btn-print" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <div ref={contentRef}>
        <div className="report-header">
          <div className="team-name">{team?.name}</div>
          <div className="report-subtitle">
            Season Fairness Report &bull; {finalizedGames.length} game{finalizedGames.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Position Distribution */}
        <div className="section-title">Position Distribution</div>
        <table className="fair-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left", paddingLeft: 5 }}>Player</th>
              {posColumns.map((pos) => (
                <th key={pos}>{pos === "BENCH" ? "BN" : pos}</th>
              ))}
              <th>ABS</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.playerId}>
                <td className="player-col">{s.playerName}</td>
                {posColumns.map((pos) => {
                  const count = s.positionCounts[pos] || 0;
                  return (
                    <td key={pos} className={count === 0 ? "zero" : ""}>
                      {count || "\u00b7"}
                    </td>
                  );
                })}
                <td className={s.gamesAbsent === 0 ? "zero" : ""}>
                  {s.gamesAbsent || "\u00b7"}
                </td>
                <td className="total-col">{s.totalInnings}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="seam-divider">
          <div className="seam-diamond" />
        </div>

        {/* Batting Order */}
        <div className="section-title">Batting Order Fairness</div>
        <table className="fair-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left", paddingLeft: 5 }}>Player</th>
              {battingStats.slots.map((slot) => (
                <th key={slot}>{slot}</th>
              ))}
              <th>Avg</th>
            </tr>
          </thead>
          <tbody>
            {battingStats.sorted.map((s) => {
              const slotAvgs = new Map<number, number>();
              for (const slot of battingStats.slots) {
                const total = stats.reduce(
                  (sum, st) => sum + (st.battingSlotCounts[slot] || 0),
                  0
                );
                slotAvgs.set(slot, total / stats.length);
              }
              return (
                <tr key={s.playerId}>
                  <td className="player-col">{s.playerName}</td>
                  {battingStats.slots.map((slot) => {
                    const count = s.battingSlotCounts[slot] || 0;
                    const avg = slotAvgs.get(slot) || 0;
                    const isHigh = count > 0 && count > avg + 1;
                    return (
                      <td
                        key={slot}
                        className={
                          count === 0 ? "zero" : isHigh ? "high" : ""
                        }
                      >
                        {count || "\u00b7"}
                      </td>
                    );
                  })}
                  <td className="avg-col">{s.avgBattingPosition.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Batting Hits + Pitching side by side */}
        <div className="seam-divider">
          <div className="seam-diamond" />
        </div>

        <div style={{ display: "flex", gap: 20 }}>
          {/* Batting Hits */}
          <div style={{ flex: 1 }}>
            <div className="section-title">Batting Hits</div>
            {playerHits.some((p) => p.hits > 0) ? (
              <div>
                {playerHits.map((p) => {
                  const maxHits = Math.max(...playerHits.map((x) => x.hits), 1);
                  return (
                    <div className="hits-row" key={p.name}>
                      <span className="hits-name">{p.name}</span>
                      <div className="hits-bar">
                        {p.hits > 0 && (
                          <div
                            className="hits-fill"
                            style={{
                              width: `${Math.max((p.hits / maxHits) * 100, 8)}%`,
                            }}
                          />
                        )}
                      </div>
                      <span className="hits-count">{p.hits}</span>
                    </div>
                  );
                })}
                <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 3 }}>
                  Team total: {atBats.length} hits
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 10, color: "#94a3b8" }}>
                No hits recorded
              </div>
            )}
          </div>

          {/* Pitching Stats */}
          {pitchers.length > 0 && (
            <div style={{ flex: 1 }}>
              <div className="section-title">Pitching</div>
              {pitchers.map((s) => (
                <div className="pitch-row" key={s.playerId}>
                  <span className="pitch-name">{s.playerName}</span>
                  <span className="pitch-stats">
                    {s.pitcherInnings} inn &bull; {s.totalPitchCount} pitches
                    {s.pitcherInnings > 0 &&
                      ` \u00b7 ${(s.totalPitchCount / s.pitcherInnings).toFixed(1)} p/inn`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="watermark">LineupIQ</div>
      </div>
    </div>
  );
}
