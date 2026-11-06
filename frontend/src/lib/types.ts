/**
 * Game types and interfaces
 */

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  difficulty?: string;
  score: number;
  dartsUsed: number;
  turnScore: number;
  history: ThrowRecord[];
  turnDarts: ThrowRecord[];
  busted: boolean;
}

export interface ThrowRecord {
  segment: Segment;
  label: string;
  score: number;
  round: number;
  dartNum: number;
  timestamp: string;
  busted?: boolean;
  extraScore?: number;
}

export interface Segment {
  type: 'single' | 'double' | 'triple' | 'outer_bull' | 'bullseye';
  value: number;
  multiplier: number;
  rawLabel?: string;
}

export interface GameState {
  id: string;
  type: 'x01' | 'cricket';
  startingScore?: number;
  players: Player[];
  currentPlayer: number;
  round: number;
  isOver: boolean;
  winner?: Player;
  createdAt: string;
  stats?: Record<string, any>;
}

export interface GameResponse {
  gameId: string;
  type: 'x01' | 'cricket';
  state: GameState;
  match?: any;
}

export interface CreateGameRequest {
  type: 'x01' | 'cricket';
  startingScore?: number;
  players: Array<{
    name: string;
    isBot: boolean;
    difficulty?: string;
  }>;
  matchLength?: number;
}

export interface ThrowRequest {
  segment: string;
}