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
      game_absences: {
        Row: GameAbsence;
        Insert: Omit<GameAbsence, "id">;
        Update: Partial<Omit<GameAbsence, "id">>;
      };
      at_bats: {
        Row: AtBat;
        Insert: Omit<AtBat, "id" | "created_at">;
        Update: Partial<Omit<AtBat, "id" | "created_at">>;
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
  max_pitch_innings_per_game: number;
  max_pitches_per_game: number;
  pitch_rest_threshold: number;
  max_same_position_innings: number;
  require_infield_inning: boolean;
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
  pitching_rating: number;
  can_pitch: boolean;
  can_catch: boolean;
  preferred_pitcher: boolean;
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
  planned_innings: number | null;
  result: string | null;
  notes: string | null;
  home_away: "home" | "visitor" | null;
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

export interface GameAbsence {
  id: string;
  game_id: string;
  player_id: string;
  reason: string | null;
}

export type AtBatResult = "1B" | "2B" | "3B" | "HR" | "OUT";

export interface AtBat {
  id: string;
  game_id: string;
  player_id: string;
  inning: number;
  result: AtBatResult;
  order_in_inning: number;
  created_at: string;
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

export interface PlayerSeasonStats {
  playerId: string;
  playerName: string;
  totalInnings: number;
  positionCounts: Record<Position, number>;
  infieldInnings: number;
  outfieldInnings: number;
  pitcherInnings: number;
  catcherInnings: number;
  benchInnings: number;
  gamesPlayed: number;
  gamesAbsent: number;
  avgBattingPosition: number;
  battingSlotCounts: Record<number, number>;
  totalPitchCount: number;
}

export interface GeneratedLineup {
  positions: { playerId: string; inning: number; position: Position }[];
  battingOrder: { playerId: string; orderPosition: number }[];
  pitchingPlan: { playerId: string; inning: number }[];
}

export interface LeagueRules {
  maxPitchInningsPerGame: number;
  maxPitchesPerGame: number;
  pitchRestThreshold: number;
  maxSamePositionInnings: number;
  requireInfieldInning: boolean;
}
