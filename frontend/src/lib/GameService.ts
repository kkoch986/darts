import { Game, GameState, ThrowRequest, GameResponse } from './types';

/**
 * Service class to handle all communication with the backend API
 */
export class GameService {
  private baseUrl: string;

  constructor() {
    // In production, this would come from environment variables
    this.baseUrl = 'http://localhost:8080'; // Default backend URL
  }

  /**
   * Create a new game
   * @param gameConfig Configuration for the new game
   * @returns Promise with created game details
   */
  async createGame(gameConfig: {
    type: 'x01' | 'cricket';
    startingScore?: number;
    players: Array<{
      name: string;
      isBot: boolean;
      difficulty?: string;
    }>;
    matchLength?: number;
  }): Promise<GameResponse> {
    const response = await fetch(`${this.baseUrl}/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gameConfig),
    });

    if (!response.ok) {
      throw new Error(`Failed to create game: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get current game state
   * @param gameId ID of the game to retrieve
   * @returns Promise with current game state
   */
  async getGame(gameId: string): Promise<GameState> {
    const response = await fetch(`${this.baseUrl}/games/${gameId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get game: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Record a throw in the game
   * @param gameId ID of the game
   * @param segment Segment that was thrown
   * @returns Promise with updated game state and any AI turns
   */
  async recordThrow(gameId: string, segment: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/games/${gameId}/throw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ segment }),
    });

    if (!response.ok) {
      throw new Error(`Failed to record throw: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * End the current turn
   * @param gameId ID of the game
   * @returns Promise with updated game state and any AI turns
   */
  async endTurn(gameId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/games/${gameId}/end-turn`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to end turn: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Undo the last throw
   * @param gameId ID of the game
   * @returns Promise with updated game state
   */
  async undoLastThrow(gameId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/games/${gameId}/undo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to undo throw: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get match score
   * @param matchId ID of the match
   * @returns Promise with match score details
   */
  async getMatch(matchId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/matches/${matchId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get match: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Create next game in a match
   * @param matchId ID of the match
   * @returns Promise with new game details
   */
  async createNextMatchGame(matchId: string): Promise<GameResponse> {
    const response = await fetch(`${this.baseUrl}/matches/${matchId}/next-game`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to create next match game: ${response.statusText}`);
    }

    return response.json();
  }
}

// Export a singleton instance
export const gameService = new GameService();