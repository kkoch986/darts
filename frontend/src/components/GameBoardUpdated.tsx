import React, { useState, useEffect } from 'react';
import { gameService, GameResponse, GameState } from '../lib/GameService';

/**
 * GameBoard Component - Updated to use backend state management
 * This component now fetches and updates game state from the backend
 */
const GameBoard: React.FC<{ gameId: string }> = ({ gameId }) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial game state
  useEffect(() => {
    const fetchGame = async () => {
      try {
        setLoading(true);
        const response = await gameService.getGame(gameId);
        setGameState(response);
        setError(null);
      } catch (err) {
        setError('Failed to load game state');
        console.error('Error loading game:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchGame();
  }, [gameId]);

  // Handle throwing a dart
  const handleThrow = async (segment: string) => {
    if (!gameState) return;

    try {
      const result = await gameService.recordThrow(gameId, segment);
      setGameState(result.state);
      
      // If there are AI turns, we might want to process them too
      if (result.aiTurns && result.aiTurns.length > 0) {
        // Process AI turns if needed
        console.log('AI turns:', result.aiTurns);
      }
    } catch (err) {
      setError('Failed to record throw');
      console.error('Error recording throw:', err);
    }
  };

  // End current turn
  const handleEndTurn = async () => {
    if (!gameState) return;

    try {
      const result = await gameService.endTurn(gameId);
      setGameState(result.state);
      
      // Handle AI turns if needed
      if (result.aiTurns && result.aiTurns.length > 0) {
        console.log('AI turns after ending turn:', result.aiTurns);
      }
    } catch (err) {
      setError('Failed to end turn');
      console.error('Error ending turn:', err);
    }
  };

  // Undo last throw
  const handleUndo = async () => {
    if (!gameState) return;

    try {
      const result = await gameService.undoLastThrow(gameId);
      setGameState(result.state);
    } catch (err) {
      setError('Failed to undo throw');
      console.error('Error undoing throw:', err);
    }
  };

  if (loading) {
    return <div className="game-loading">Loading game...</div>;
  }

  if (error) {
    return (
      <div className="game-error">
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (!gameState) {
    return <div className="game-not-found">Game not found</div>;
  }

  // Render game based on state
  return (
    <div className="game-board">
      <div className="game-header">
        <h2>{gameState.type.toUpperCase()} Game</h2>
        <p>Round: {gameState.round}</p>
        <p>Current Player: {gameState.players[gameState.currentPlayer]?.name}</p>
      </div>

      <div className="game-players">
        {gameState.players.map((player, index) => (
          <div 
            key={player.id} 
            className={`player-card ${index === gameState.currentPlayer ? 'current-player' : ''}`}
          >
            <h3>{player.name}</h3>
            <p>Score: {player.score}</p>
            {gameState.type === 'x01' && (
              <p>Turn Score: {player.turnScore}</p>
            )}
            {gameState.type === 'cricket' && (
              <div className="cricket-stats">
                <p>Marks: {Object.entries(player.marks).map(([num, count]) => `${num}:${count}`).join(', ')}</p>
                <p>Open Numbers: {Object.entries(player.opens).filter(([_, open]) => open).length}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="game-controls">
        <button onClick={handleEndTurn} disabled={!gameState.players[gameState.currentPlayer]?.dartsUsed}>
          End Turn
        </button>
        <button onClick={handleUndo} disabled={gameState.isOver}>
          Undo Last Throw
        </button>
      </div>

      <div className="dartboard">
        {/* Dartboard component would go here */}
        <p>Throw darts using the backend API</p>
      </div>
    </div>
  );
};

export default GameBoard;