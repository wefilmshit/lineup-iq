export type Database = {
  public: {
    Tables: {
      teams: {
        Row: Team;
        Insert: Omit<Team, "id" | "created_at">;
        Update: Partial<Omit<Team, "id" | "created_at">>;
      };
      players: {
        Row: Player;
        Insert: Omit<Player, "id" | "created_at">;
        Update: Partial<Omit<Player, "id" | "created_at">>;
      };
      games: {
        Row: Game;
        Insert: Omit<Game, "id" | "created_at">;
        Update: Partial<Omit<Game, "id" | "created_at">>;
      };
      game_lineups: {
        Row: GameLineup;
        Insert: Omit<GameLineup, "id">;
        Update: Partial<Omit<GameLineup, "id">>;
      };
      batting_orders: {
        Row: BattingOrder;
        Insert: Omit<BattingOrder, "id">;
        Update: Partial<Omit<BattingOrder, "id">>;
      };
      pitching_plans: {
        Row: PitchingPlan;
        Insert: Omit<PitchingPlan, "id">;
        Update: Partial<Omit<PitchingPlan, "id">>;
      };
    };
  };
};

export interface Team {
  id: string;
  name: string;
  season: string | null;
  league: string | null;
  innings_per_game: number;
  created_at: string;
}

export interface Player {
  id: string;
  team_id: string;
  name: string;
  jersey_number: number | null;
  league_age: number | null;
  batting_rating: number;
  fielding_rating: number;
  can_pitch: boolean;
  can_catch: boolean;
  throws: "R" | "L";
  bats: "R" | "L" | "S";
  active: boolean;
  notes: string | null;
  created_at: string;
}

export interface Game {
  id: string;
  team_id: string;
  game_number: number;
  date: string | null;
  opponent: string | null;
  innings: number;
  result: string | null;
  notes: string | null;
  created_at: string;
}

export interface GameLineup {
  id: string;
  game_id: string;
  player_id: string;
  inning: number;
  position: Position;
}

export interface BattingOrder {
  id: string;
  game_id: string;
  player_id: string;
  order_position: number;
}

export interface PitchingPlan {
  id: string;
  game_id: string;
  player_id: string;
  inning: number;
  pitch_count: number;
}

export type Position =
  | "P"
  | "C"
  | "1B"
  | "2B"
  | "SS"
  | "3B"
  | "RF"
  | "RCF"
  | "LCF"
  | "LF"
  | "BENCH";

export const FIELD_POSITIONS: Position[] = [
  "P",
  "C",
  "1B",
  "2B",
  "SS",
  "3B",
  "RF",
  "RCF",
  "LCF",
  "LF",
];

export const ALL_POSITIONS: Position[] = [...FIELD_POSITIONS, "BENCH"];

export const INFIELD_POSITIONS: Position[] = ["1B", "2B", "SS", "3B"];
export const OUTFIELD_POSITIONS: Position[] = ["RF", "RCF", "LCF", "LF"];

export const POSITION_LABELS: Record<Position, string> = {
  P: "Pitcher",
  C: "Catcher",
  "1B": "First Base",
  "2B": "Second Base",
  SS: "Shortstop",
  "3B": "Third Base",
  RF: "Right Field",
  RCF: "Right Center",
  LCF: "Left Center",
  LF: "Left Field",
  BENCH: "Bench",
};

// Season stats per player (computed from game_lineups)
export interface PlayerSeasonStats {
  playerId: string;
  playerName: string;
  totalInnings: number;
  infieldInnings: number;
  outfieldInnings: number;
  pitcherInnings: number;
  catcherInnings: number;
  benchInnings: number;
  gamesPlayed: number;
  avgBattingPosition: number;
}

// Generated lineup for a game
export interface GeneratedLineup {
  positions: { playerId: string; inning: number; position: Position }[];
  battingOrder: { playerId: string; orderPosition: number }[];
  pitchingPlan: { playerId: string; inning: number }[];
}
