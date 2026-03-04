"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useTeam, usePlayers } from "@/lib/hooks";
import { Player } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface PlayerForm {
  name: string;
  jersey_number: string;
  league_age: string;
  batting_rating: string;
  fielding_rating: string;
  pitching_rating: string;
  can_pitch: boolean;
  can_catch: boolean;
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
  preferred_pitcher: false,
  throws: "R",
  bats: "R",
  notes: "",
};

export default function RosterPage() {
  const { team, loading: teamLoading } = useTeam();
  const { players, loading: playersLoading, refresh } = usePlayers(team?.id);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [form, setForm] = useState(emptyPlayer);

  if (teamLoading || playersLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Roster</h1>
          <p className="text-muted-foreground">
            {players.length} player{players.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAdd}>Add Player</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
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
              <Button onClick={handleSave} className="w-full">
                {editingPlayer ? "Update Player" : "Add Player"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {players.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No players yet. Add your roster to get started.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-16">Age</TableHead>
                  <TableHead className="w-16">Bat</TableHead>
                  <TableHead className="w-16">Field</TableHead>
                  <TableHead className="w-16">Pitch</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.map((player) => (
                  <TableRow key={player.id}>
                    <TableCell className="font-mono">
                      {player.jersey_number}
                    </TableCell>
                    <TableCell className="font-medium">
                      {player.name}
                      {player.bats === "L" && (
                        <span className="text-xs text-muted-foreground ml-1">
                          (L)
                        </span>
                      )}
                      {player.bats === "S" && (
                        <span className="text-xs text-muted-foreground ml-1">
                          (S)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{player.league_age}</TableCell>
                    <TableCell>
                      <RatingDots value={player.batting_rating} />
                    </TableCell>
                    <TableCell>
                      <RatingDots value={player.fielding_rating} />
                    </TableCell>
                    <TableCell>
                      {player.can_pitch ? (
                        <RatingDots value={player.pitching_rating} />
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {player.can_pitch && (
                          <Badge variant="secondary" className="text-xs">
                            P
                          </Badge>
                        )}
                        {player.preferred_pitcher && (
                          <Badge variant="default" className="text-xs">
                            ACE
                          </Badge>
                        )}
                        {player.can_catch && (
                          <Badge variant="secondary" className="text-xs">
                            C
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(player)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => handleDelete(player)}
                        >
                          X
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RatingDots({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 10 }, (_, i) => (
        <div
          key={i}
          className={`w-1.5 h-3 rounded-sm ${
            i < value ? "bg-primary" : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
}
