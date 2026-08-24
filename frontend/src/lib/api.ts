import type { GameState, Player, LifetimeStats } from './types';

const BASE = '/api';

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface MatchScore {
  match_id: string;
  total_games: number;
  games_played: number;
  status: string;
  winner_id?: string;
  scores: Record<string, number>;
}

export interface MatchSummary {
  id: string;
  type: string;
  starting_score?: number;
  total_games: number;
  status: string;
  created_at: string;
  winner_name?: string;
  players: string[];
}

export interface MatchStats {
  legs_won: Record<string, number>;
  averages: Record<string, number>;
  mpr: Record<string, number>;
  checkout_pct: Record<string, number>;
  darts_per_leg: Record<string, number>;
}

export function createMatch(payload: {
  type: string;
  starting_score?: number;
  players: { name: string; player_id?: string; is_bot: boolean; difficulty?: string }[];
  match_length?: number;
  first_thrower_index?: number;
}) {
  return request<{ match: MatchState }>('/matches', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getMatch(matchId: string) {
  return request<{ match: MatchState }>(`/matches/${matchId}`);
}

export function getMatchStats(matchId: string) {
  return request<MatchStats>(`/matches/${matchId}/stats`);
}

export function throwInMatch(matchId: string, segment: string) {
  return request<{ match: MatchState; error?: string }>(`/matches/${matchId}/throw`, {
    method: 'POST',
    body: JSON.stringify({ segment }),
  });
}

export interface MatchEndTurnResponse {
  match: MatchState;
  ai_turns?: {
    player_id: string;
    name: string;
    aim: string;
    segment: string;
    score: number;
    error?: string;
  }[];
}

export function endTurnInMatch(matchId: string) {
  return request<MatchEndTurnResponse>(`/matches/${matchId}/end-turn`, {
    method: 'POST',
  });
}

export function undoInMatch(matchId: string) {
  return request<{ match: MatchState; error?: string }>(`/matches/${matchId}/undo`, {
    method: 'POST',
  });
}

export function listMatches() {
  return request<MatchSummary[]>('/matches');
}

export function deleteMatch(id: string) {
  return request<void>(`/matches/${id}`, { method: 'DELETE' });
}

// Legacy single-game helpers; kept for the old /game/:id route.
export function createGame(payload: {
  type: string;
  starting_score?: number;
  players: { name: string; player_id?: string; is_bot: boolean; difficulty?: string }[];
  match_length?: number;
}) {
  return request<{ game_id: string; type: string; state: GameState; match?: MatchScore }>('/games', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createNextMatchGame(matchId: string) {
  return request<{ game_id: string; type: string; state: GameState; match?: MatchScore }>(`/matches/${matchId}/next-game`, {
    method: 'POST',
  });
}

export function getGame(id: string) {
  return request<GameState>(`/games/${id}`);
}

export function throwDart(gameId: string, segment: string) {
  return request<{ state: GameState; error?: string; ai_turns?: unknown[] }>(`/games/${gameId}/throw`, {
    method: 'POST',
    body: JSON.stringify({ segment }),
  });
}

export function endTurn(gameId: string) {
  return request<{ state: GameState; ai_turns?: unknown[] }>(`/games/${gameId}/end-turn`, {
    method: 'POST',
  });
}

export function undoThrow(gameId: string) {
  return request<{ state: GameState; error?: string }>(`/games/${gameId}/undo`, {
    method: 'POST',
  });
}

export function listGames() {
  return request<unknown[]>('/games');
}

export function listActiveGames() {
  return request<{ id: string; type: string; state_json: string; created_at: string }[]>('/games/active');
}

export interface GameSummary {
  id: string;
  type: string;
  starting_score?: number;
  created_at: string;
  completed_at?: string;
  winner_name?: string;
  players: string[];
  scores?: Record<string, number>;
  rounds?: number;
}

export function listGamesWithDetails() {
  return request<GameSummary[]>('/games/history');
}

export function deleteGame(id: string) {
  return request<void>(`/games/${id}`, { method: 'DELETE' });
}

export function createPlayer(name: string) {
  return request<Player>('/players', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function listPlayers() {
  return request<Player[]>('/players');
}

export function deletePlayer(id: string) {
  return request<void>(`/players/${id}`, { method: 'DELETE' });
}

export function resetPlayerStats(id: string) {
  return request<void>(`/players/${id}/stats`, { method: 'DELETE' });
}

export function getPlayerStats(id: string, gameType?: string) {
  const params = gameType ? `?type=${encodeURIComponent(gameType)}` : '';
  return request<LifetimeStats>(`/stats/player/${id}${params}`);
}

export function getPlayerHeatmap(id: string, gameType?: string) {
  const params = gameType ? `?type=${encodeURIComponent(gameType)}` : '';
  return request<{ player_id: string; heatmap: Record<string, number> }>(`/stats/player/${id}/heatmap${params}`);
}

export interface DifficultyStat {
  difficulty: string;
  games_played: number;
  games_won: number;
  win_rate: number;
  avg_score: number;
  mpr: number;
}

export function getPlayerDifficultyStats(id: string) {
  return request<DifficultyStat[]>(`/stats/player/${id}/difficulty`);
}

export function getPlayerLifetimeMPR(id: string, gameType?: string) {
  const params = gameType ? `?type=${encodeURIComponent(gameType)}` : '';
  return request<{ player_id: string; mpr: number }>(`/stats/player/${id}/mpr${params}`);
}

export interface WinMatrixEntry {
  opponent: string;
  game_type: string;
  wins: number;
  losses: number;
  total_games: number;
  total_throws: number;
  total_rounds: number;
}

export function getPlayerWinsMatrix(id: string, gameType?: string) {
  const params = gameType ? `?type=${encodeURIComponent(gameType)}` : '';
  return request<WinMatrixEntry[]>(`/stats/player/${id}/wins${params}`);
}

export interface TimelineEntry {
  game_id: string;
  date: string;
  won: boolean;
  rounds: number;
  throws: number;
  opponent: string;
}

export function getPlayerTimeline(id: string, gameType?: string) {
  const params = gameType ? `?type=${encodeURIComponent(gameType)}` : '';
  return request<TimelineEntry[]>(`/stats/player/${id}/timeline${params}`);
}

export interface CheckoutPracticeState {
  practice_id: string;
  starting_score: number;
  state: {
    starting_score: number;
    current_player: number;
    is_over: boolean;
    players: {
      id: string;
      name: string;
      score: number;
      darts_used: number;
      turn_darts: { label: string; score: number }[];
      history: { label: string; score: number }[];
    }[];
  };
  result?: 'continue' | 'checkout' | 'bust';
}

export function startCheckoutPractice(startingScore: number) {
  return request<CheckoutPracticeState>('/practice/checkout', {
    method: 'POST',
    body: JSON.stringify({ starting_score: startingScore }),
  });
}

export function checkoutPracticeThrow(practiceId: string, segment: string) {
  return request<CheckoutPracticeState>(`/practice/checkout/${practiceId}/throw`, {
    method: 'POST',
    body: JSON.stringify({ segment }),
  });
}
