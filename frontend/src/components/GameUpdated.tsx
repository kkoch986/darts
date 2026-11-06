import React, { useState, useEffect } from 'react';
import { gameService } from '../lib/GameService';
import GameBoard from './GameBoardUpdated';

/**
 * Main Game Component - Updated to use backend for all game logic
 */
const Game: React.FC<{ gameId?: string }> = ({ gameId }) => {
  const [currentGameId, setCurrentGameId] = useState<string | null>(gameId || null);
  const [gameType, setGameType] = useState<'x01' | 'cricket' | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Create a new game
  const createNewGame = async (type: 'x01' | 'cricket', players: Array<{name: string, isBot: boolean, difficulty?: string}>, matchLength?: number) => {
    setLoading(true);
    setError(null);
    
    try {
      let response;
      
      if (type === 'x01') {
        response = await gameService.createGame({
          type: 'x01',
          startingScore: 501,
          players,
          matchLength
        });
      } else {
        response = await gameService.createGame({
          type: 'cricket',
          players,
          matchLength
        });
      }
      
      setCurrentGameId(response.gameId);
      setGameType(type);
      
      // The GameBoard component will automatically fetch the initial state
    } catch (err) {
      setError('Failed to create game');
      console.error('Error creating game:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle game creation from UI
  const handleCreateGame = (type: 'x01' | 'cricket') => {
    // In a real app, this would come from user input
    const players = [
      { name: 'Player 1', isBot: false },
      { name: 'Player 2', isBot: true, difficulty: 'medium' }
    ];
    
    createNewGame(type, players);
  };

  // If we have a game ID in the URL, load that game
  useEffect(() => {
    if (gameId && !currentGameId) {
      setCurrentGameId(gameId);
      // We would need to fetch the game type from backend here
    }
  }, [gameId, currentGameId]);

  if (loading) {
    return <div className="loading">Creating game...</div>;
  }

  if (error) {
    return (
      <div className="error">
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  // If no game ID, show game creation options
  if (!currentGameId) {
    return (
      <div className="game-creation">
        <h2>Create New Game</h2>
        <div className="game-options">
          <button onClick={() => handleCreateGame('x01')}>
            Start X01 Game (501)
          </button>
          <button onClick={() => handleCreateGame('cricket')}>
            Start Cricket Game
          </button>
        </div>
      </div>
    );
  }

  // Show the game board with backend state
  return (
    <div className="game-container">
      <GameBoard gameId={currentGameId} />
    </div>
  );
};

export default Game;