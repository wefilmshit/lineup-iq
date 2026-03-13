"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useTeam, usePlayers } from "@/lib/hooks";
import { Player } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────

interface PlayerForm {
  name: string;
  jersey_number: string;
  league_age: string;
  batting_rating: string;
  fielding_rating: string;
  pitching_rating: string;
  can_pitch: boolean;
  can_catch: boolean;
  can_play_1b: boolean;
  preferred_pitcher: boolean;
  throws: string;
  bats: string;
  notes: string;
}

const emptyPlayer: PlayerForm = {
  name: "",
  jersey_number: "",
  league_age: "",
  batting_rating: "5",
  fielding_rating: "5",
  pitching_rating: "5",
  can_pitch: false,
  can_catch: false,
  can_play_1b: true,
  preferred_pitcher: false,
  throws: "R",
  bats: "R",
  notes: "",
};

type FilterType = "all" | "pitchers" | "catchers" | "infield";

// ─── Skill Bar Component ────────────────────────────────

function SkillBar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-xs font-medium text-[#6B7280] w-6 shrink-0">{label}</span>
      <div className="flex gap-[3px] items-center">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className="w-[5px] h-3.5 rounded-sm transition-colors"
            style={{
              backgroundColor: i < value ? color : "#E2E8F0",
            }}
          />
        ))}
      </div>
      <span className="text-xs font-semibold text-[#0B1F3A] w-4 text-right">{value}</span>
    </div>
  );
}

// ─── Role Chip Component ────────────────────────────────

function RoleChip({ label, variant = "default" }: { label: string; variant?: "default" | "accent" }) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide";
  const styles =
    variant === "accent"
      ? "bg-[#1E63E9] text-white"
      : "bg-[#F0F4F8] text-[#0B1F3A]";
  return <span className={`${base} ${styles}`}>{label}</span>;
}

// ─── Stat Card Component ────────────────────────────────

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] px-4 py-3 text-center shadow-sm">
      <div className="text-2xl font-bold text-[#0B1F3A]">{value}</div>
      <div className="text-xs font-medium text-[#6B7280] uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

// ─── Player Highlights ──────────────────────────────────

function getHighlights(players: Player[]) {
  if (players.length === 0) return { topBatter: "", topFielder: "", topPitcher: "" };
  const topBatter = players.reduce((a, b) => (b.batting_rating > a.batting_rating ? b : a)).id;
  const topFielder = players.reduce((a, b) => (b.fielding_rating > a.fielding_rating ? b : a)).id;
  const pitchers = players.filter((p) => p.can_pitch);
  const topPitcher = pitchers.length > 0 ? pitchers.reduce((a, b) => (b.pitching_rating > a.pitching_rating ? b : a)).id : "";
  return { topBatter, topFielder, topPitcher };
}

// ─── Action Menu Component ──────────────────────────────

function ActionMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F0F4F8] transition-colors text-[#6B7280]"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-lg border border-[#E2E8F0] py-1 min-w-[120px]">
            <button
              onClick={() => { onEdit(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-[#0B1F3A] hover:bg-[#F7F9FC] transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => { onDelete(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-[#EF4444] hover:bg-[#FEF2F2] transition-colors"
            >
              Remove
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Mobile Player Card ─────────────────────────────────

function PlayerMobileCard({
  player,
  highlights,
  onEdit,
  onDelete,
}: {
  player: Player;
  highlights: { topBatter: string; topFielder: string; topPitcher: string };
  onEdit: () => void;
  onDelete: () => void;
}) {
  const badges = [];
  if (highlights.topBatter === player.id) badges.push("Top Bat");
  if (highlights.topFielder === player.id) badges.push("Top Glove");
  if (highlights.topPitcher === player.id) badges.push("Top Arm");

  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 shadow-sm">
      {/* Top row: player info + actions */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#1E63E9] flex items-center justify-center text-white font-bold text-sm shrink-0">
            {player.jersey_number ?? "–"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#0B1F3A] text-base">{player.name}</span>
              {player.bats !== "R" && (
                <span className="text-[11px] text-[#6B7280] font-medium">
                  Bats {player.bats === "L" ? "L" : "S"}
                </span>
              )}
            </div>
            <div className="text-sm text-[#6B7280]">
              {player.league_age ? `Age ${player.league_age}` : ""}
              {player.league_age && player.throws ? " · " : ""}
              {player.throws ? `Throws ${player.throws}` : ""}
            </div>
          </div>
        </div>
        <ActionMenu onEdit={onEdit} onDelete={onDelete} />
      </div>

      {/* Roles */}
      <div className="flex gap-1.5 mt-3 flex-wrap">
        {player.preferred_pitcher && <RoleChip label="Ace" variant="accent" />}
        {player.can_pitch && !player.preferred_pitcher && <RoleChip label="P" />}
        {player.can_catch && <RoleChip label="C" />}
        {player.can_play_1b && <RoleChip label="1B" />}
        {badges.map((b) => (
          <span key={b} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FFC857]/15 text-[#B8860B] uppercase tracking-wide">
            {b}
          </span>
        ))}
      </div>

      {/* Ratings */}
      <div className="mt-3 space-y-1.5">
        <SkillBar value={player.batting_rating} label="BAT" color="#1E63E9" />
        <SkillBar value={player.fielding_rating} label="FLD" color="#2ECC71" />
        {player.can_pitch && (
          <SkillBar value={player.pitching_rating} label="PIT" color="#FFC857" />
        )}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────

export default function RosterPage() {
  const { team, loading: teamLoading } = useTeam();
  const { players, loading: playersLoading, refresh } = usePlayers(team?.id);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [form, setForm] = useState(emptyPlayer);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  const highlights = useMemo(() => getHighlights(players), [players]);

  const filtered = useMemo(() => {
    let list = players;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.jersey_number?.toString().includes(q)
      );
    }
    switch (filter) {
      case "pitchers":
        list = list.filter((p) => p.can_pitch);
        break;
      case "catchers":
        list = list.filter((p) => p.can_catch);
        break;
      case "infield":
        list = list.filter((p) => p.can_play_1b);
        break;
    }
    return list;
  }, [players, search, filter]);

  const stats = useMemo(() => ({
    total: players.length,
    pitchers: players.filter((p) => p.can_pitch).length,
    catchers: players.filter((p) => p.can_catch).length,
    firstBase: players.filter((p) => p.can_play_1b).length,
  }), [players]);

  if (teamLoading || playersLoading) {
    return <div className="text-[#6B7280]">Loading...</div>;
  }

  function openAdd() {
    setEditingPlayer(null);
    setForm(emptyPlayer);
    setDialogOpen(true);
  }

  function openEdit(player: Player) {
    setEditingPlayer(player);
    setForm({
      name: player.name,
      jersey_number: player.jersey_number?.toString() ?? "",
      league_age: player.league_age?.toString() ?? "",
      batting_rating: player.batting_rating.toString(),
      fielding_rating: player.fielding_rating.toString(),
      pitching_rating: player.pitching_rating.toString(),
      can_pitch: player.can_pitch,
      can_catch: player.can_catch,
      can_play_1b: player.can_play_1b,
      preferred_pitcher: player.preferred_pitcher,
      throws: player.throws,
      bats: player.bats,
      notes: player.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!team || !form.name.trim()) return;

    const payload = {
      team_id: team.id,
      name: form.name.trim(),
      jersey_number: form.jersey_number ? parseInt(form.jersey_number) : null,
      league_age: form.league_age ? parseInt(form.league_age) : null,
      batting_rating: parseInt(form.batting_rating) || 5,
      fielding_rating: parseInt(form.fielding_rating) || 5,
      pitching_rating: parseInt(form.pitching_rating) || 5,
      can_pitch: form.can_pitch,
      can_catch: form.can_catch,
      can_play_1b: form.can_play_1b,
      preferred_pitcher: form.preferred_pitcher,
      throws: form.throws,
      bats: form.bats,
      notes: form.notes || null,
    };

    if (editingPlayer) {
      const { error } = await supabase
        .from("players")
        .update(payload)
        .eq("id", editingPlayer.id);
      if (error) {
        toast.error("Failed to update player");
        return;
      }
      toast.success("Player updated");
    } else {
      const { error } = await supabase.from("players").insert(payload);
      if (error) {
        toast.error("Failed to add player");
        return;
      }
      toast.success("Player added");
    }

    setDialogOpen(false);
    refresh();
  }

  async function handleDelete(player: Player) {
    if (!confirm(`Remove ${player.name} from the roster?`)) return;
    const { error } = await supabase
      .from("players")
      .delete()
      .eq("id", player.id);
    if (error) {
      toast.error("Failed to remove player");
      return;
    }
    toast.success("Player removed");
    refresh();
  }

  const filters: { label: string; value: FilterType }[] = [
    { label: "All", value: "all" },
    { label: "Pitchers", value: "pitchers" },
    { label: "Catchers", value: "catchers" },
    { label: "1B Eligible", value: "infield" },
  ];

  return (
    <div className="space-y-5">
      {/* ─── Page Header ─────────────────────────────── */}
      <div className="flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
        <div>
          <h1 className="text-[28px] sm:text-4xl font-bold text-[#0B1F3A]">
            Team Roster
          </h1>
          <p className="text-[#6B7280] text-base mt-1">
            {players.length} player{players.length !== 1 ? "s" : ""}
            {team?.season ? ` · ${team.season}` : ""}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={openAdd}
              className="bg-[#1E63E9] hover:bg-[#2F80FF] text-white font-semibold px-5 py-2.5 rounded-xl shadow-sm"
            >
              + Add Player
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-[#0B1F3A]">
                {editingPlayer ? "Edit Player" : "Add Player"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Player name"
                  />
                </div>
                <div>
                  <Label>Jersey #</Label>
                  <Input
                    type="number"
                    value={form.jersey_number}
                    onChange={(e) =>
                      setForm({ ...form, jersey_number: e.target.value })
                    }
                    placeholder="#"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Age</Label>
                  <Input
                    type="number"
                    value={form.league_age}
                    onChange={(e) =>
                      setForm({ ...form, league_age: e.target.value })
                    }
                    placeholder="Age"
                  />
                </div>
                <div>
                  <Label>Batting (1-10)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={form.batting_rating}
                    onChange={(e) =>
                      setForm({ ...form, batting_rating: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Fielding (1-10)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={form.fielding_rating}
                    onChange={(e) =>
                      setForm({ ...form, fielding_rating: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Throws</Label>
                  <div className="flex gap-4 mt-1">
                    <label className="flex items-center gap-1 text-sm">
                      <input
                        type="radio"
                        checked={form.throws === "R"}
                        onChange={() => setForm({ ...form, throws: "R" })}
                      />
                      Right
                    </label>
                    <label className="flex items-center gap-1 text-sm">
                      <input
                        type="radio"
                        checked={form.throws === "L"}
                        onChange={() => setForm({ ...form, throws: "L" })}
                      />
                      Left
                    </label>
                  </div>
                </div>
                <div>
                  <Label>Bats</Label>
                  <div className="flex gap-4 mt-1">
                    <label className="flex items-center gap-1 text-sm">
                      <input
                        type="radio"
                        checked={form.bats === "R"}
                        onChange={() => setForm({ ...form, bats: "R" })}
                      />
                      R
                    </label>
                    <label className="flex items-center gap-1 text-sm">
                      <input
                        type="radio"
                        checked={form.bats === "L"}
                        onChange={() => setForm({ ...form, bats: "L" })}
                      />
                      L
                    </label>
                    <label className="flex items-center gap-1 text-sm">
                      <input
                        type="radio"
                        checked={form.bats === "S"}
                        onChange={() => setForm({ ...form, bats: "S" })}
                      />
                      Switch
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="can_pitch"
                    checked={form.can_pitch}
                    onCheckedChange={(v) =>
                      setForm({ ...form, can_pitch: v === true })
                    }
                  />
                  <Label htmlFor="can_pitch">Can Pitch</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="can_catch"
                    checked={form.can_catch}
                    onCheckedChange={(v) =>
                      setForm({ ...form, can_catch: v === true })
                    }
                  />
                  <Label htmlFor="can_catch">Can Catch</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="can_play_1b"
                    checked={form.can_play_1b}
                    onCheckedChange={(v) =>
                      setForm({ ...form, can_play_1b: v === true })
                    }
                  />
                  <Label htmlFor="can_play_1b">Can Play 1B</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="preferred_pitcher"
                    checked={form.preferred_pitcher}
                    onCheckedChange={(v) =>
                      setForm({ ...form, preferred_pitcher: v === true })
                    }
                  />
                  <Label htmlFor="preferred_pitcher">Preferred Pitcher</Label>
                </div>
              </div>
              {form.can_pitch && (
                <div className="w-1/3">
                  <Label>Pitch Rating (1-10)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={form.pitching_rating}
                    onChange={(e) =>
                      setForm({ ...form, pitching_rating: e.target.value })
                    }
                  />
                </div>
              )}
              <div>
                <Label>Notes</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Optional notes"
                />
              </div>
              <Button
                onClick={handleSave}
                className="w-full bg-[#1E63E9] hover:bg-[#2F80FF] rounded-xl"
              >
                {editingPlayer ? "Update Player" : "Add Player"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* ─── Summary Stats ───────────────────────────── */}
      {players.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <StatCard value={stats.total} label="Players" />
          <StatCard value={stats.pitchers} label="Pitchers" />
          <StatCard value={stats.catchers} label="Catchers" />
          <StatCard value={stats.firstBase} label="1B Eligible" />
        </div>
      )}

      {/* ─── Search & Filters ────────────────────────── */}
      {players.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]"
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Search players..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-xl border border-[#E2E8F0] bg-white text-sm text-[#0B1F3A] placeholder:text-[#6B7280]/60 focus:outline-none focus:ring-2 focus:ring-[#1E63E9]/20 focus:border-[#1E63E9] transition-colors"
            />
          </div>
          <div className="flex gap-1.5">
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                  filter === f.value
                    ? "bg-[#1E63E9] text-white"
                    : "bg-white text-[#6B7280] border border-[#E2E8F0] hover:text-[#0B1F3A] hover:border-[#CBD5E1]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Roster Content ──────────────────────────── */}
      {players.length === 0 ? (
        <Card className="border-[#E2E8F0] shadow-sm rounded-2xl">
          <CardContent className="py-12 text-center text-[#6B7280]">
            No players yet. Add your roster to get started.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ─── Desktop Table ─────────────────────── */}
          <div className="hidden md:block">
            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="sticky top-[48px] sm:top-[56px] z-10">
                  <tr className="bg-[#F7F9FC] border-b border-[#E2E8F0]">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#6B7280] uppercase tracking-wider w-[240px]">Player</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#6B7280] uppercase tracking-wider w-[140px]">Roles</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Bat</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Field</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Pitch</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((player, idx) => {
                    const badges = [];
                    if (highlights.topBatter === player.id) badges.push("Top Bat");
                    if (highlights.topFielder === player.id) badges.push("Top Glove");
                    if (highlights.topPitcher === player.id) badges.push("Top Arm");

                    return (
                      <tr
                        key={player.id}
                        className={`border-b border-[#E2E8F0] last:border-b-0 hover:bg-[#F7F9FC]/60 transition-colors ${
                          idx % 2 === 0 ? "" : "bg-[#FAFBFD]"
                        }`}
                      >
                        {/* Player */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#1E63E9] flex items-center justify-center text-white font-bold text-xs shrink-0">
                              {player.jersey_number ?? "–"}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-[#0B1F3A] text-sm">{player.name}</span>
                                {player.bats !== "R" && (
                                  <span className="text-[11px] text-[#6B7280]">
                                    ({player.bats})
                                  </span>
                                )}
                                {badges.map((b) => (
                                  <span key={b} className="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-semibold bg-[#FFC857]/15 text-[#B8860B]">
                                    {b}
                                  </span>
                                ))}
                              </div>
                              <span className="text-xs text-[#6B7280]">
                                {player.league_age ? `Age ${player.league_age}` : ""}
                                {player.league_age && player.throws ? " · " : ""}
                                Throws {player.throws}
                              </span>
                            </div>
                          </div>
                        </td>
                        {/* Roles */}
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {player.preferred_pitcher && <RoleChip label="Ace" variant="accent" />}
                            {player.can_pitch && !player.preferred_pitcher && <RoleChip label="P" />}
                            {player.can_catch && <RoleChip label="C" />}
                            {player.can_play_1b && <RoleChip label="1B" />}
                          </div>
                        </td>
                        {/* Bat */}
                        <td className="px-4 py-3">
                          <SkillBar value={player.batting_rating} label="" color="#1E63E9" />
                        </td>
                        {/* Field */}
                        <td className="px-4 py-3">
                          <SkillBar value={player.fielding_rating} label="" color="#2ECC71" />
                        </td>
                        {/* Pitch */}
                        <td className="px-4 py-3">
                          {player.can_pitch ? (
                            <SkillBar value={player.pitching_rating} label="" color="#FFC857" />
                          ) : (
                            <span className="text-xs text-[#CBD5E1]">—</span>
                          )}
                        </td>
                        {/* Actions */}
                        <td className="px-2 py-3">
                          <ActionMenu
                            onEdit={() => openEdit(player)}
                            onDelete={() => handleDelete(player)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── Mobile Cards ──────────────────────── */}
          <div className="md:hidden space-y-3">
            {filtered.map((player) => (
              <PlayerMobileCard
                key={player.id}
                player={player}
                highlights={highlights}
                onEdit={() => openEdit(player)}
                onDelete={() => handleDelete(player)}
              />
            ))}
          </div>

          {/* ─── Empty filter state ────────────────── */}
          {filtered.length === 0 && (
            <div className="text-center py-8 text-[#6B7280] text-sm">
              No players match your search or filters.
            </div>
          )}
        </>
      )}
    </div>
  );
}
