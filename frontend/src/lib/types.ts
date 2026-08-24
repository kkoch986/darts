export type GameType = 'x01' | 'cricket';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'professional';

export interface Segment {
  type: 0 | 1 | 2 | 3 | 4; // single=0, double=1, triple=2, outer_bull=3, bullseye=4
  value: number;
  multiplier: number;
  raw_label?: string;
}

export interface X01Player {
  id: string;
  name: string;
  is_bot: boolean;
  difficulty?: string;
  score: number;
  score_at_turn_start: number;
  darts_used: number;
  turn_score: number;
  turn_darts: ThrowRecord[];
  history: ThrowRecord[];
  darts_thrown: number;
  total_score: number;
}

export interface CricketPlayer {
  id: string;
  name: string;
  is_bot: boolean;
  difficulty?: string;
  marks: Record<number, number>;
  score: number;
  darts_used: number;
  turn_darts: ThrowRecord[];
  history: ThrowRecord[];
}

export interface ThrowRecord {
  segment: Segment;
  label: string;
  score: number;
  round: number;
  dart_num: number;
  timestamp: string;
  busted?: boolean;
  extra_score?: number;
}

export interface X01GameState {
  id: string;
  type: 'x01';
  starting_score: number;
  players: X01Player[];
  current_player: number;
  round: number;
  is_over: boolean;
  winner?: X01Player;
  stats: Record<string, GameStats>;
}

export interface CricketGameState {
  id: string;
  type: 'cricket';
  players: CricketPlayer[];
  current_player: number;
  round: number;
  is_over: boolean;
  winner?: CricketPlayer;
  stats: Record<string, GameStats>;
}

export type GameState = X01GameState | CricketGameState;

export interface MatchPlayer {
  id: string;
  name: string;
  is_bot: boolean;
  difficulty?: string;
}

export interface MatchLegResult {
  game_id: string;
  winner_id: string;
  index: number;
}

export interface MatchState {
  id: string;
  type: GameType;
  starting_score?: number;
  total_games: number;
  status: 'active' | 'completed';
  winner_id?: string;
  players: MatchPlayer[];
  current_game_index: number;
  current_game_state: GameState;
  game_scores: Record<string, number>;
  games_played: number;
  first_thrower_index: number;
  leg_history: MatchLegResult[];
  created_at: string;
}

export interface GameStats {
  throw_count: number;
  turn_count: number;
  segment_hits: Record<string, number>;
  type_hits: Record<string, number>;
  total_score: number;
  turn_averages: number[];
  high_turn: number;
}

export interface Player {
  id: string;
  name: string;
  created_at?: string;
}

export interface LifetimeStats {
  player_id: string;
  games_played: number;
  games_won: number;
  total_throws: number;
  total_rounds: number;
  avg_rounds_per_game: number;
  avg_darts_per_game: number;
  segment_hits: Record<string, number>;
  heatmap_data?: Record<string, number>;
}

export interface AiThrowResult {
  player_id: string;
  name: string;
  segment: string;
  score: number;
  error?: string;
}

export interface ThrowResponse {
  state: GameState;
  error?: string;
  ai_throw?: AiThrowResult;
}

export interface EndTurnResponse {
  state: GameState;
  ai_turns?: AiThrowResult[];
}

export const CRICKET_NUMBERS = [20, 19, 18, 17, 16, 15, 25] as const;
export const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5] as const;
