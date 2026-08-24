import { useState, useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import type { GameState } from '../lib/types';
import { getGame } from '../lib/api';
import GameBoard from '../components/GameBoard';

export default function Game() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const locationState = location.state as GameState | null;
  const [state, setState] = useState<GameState | null>(locationState || null);
  const [loading, setLoading] = useState(!state);

  useEffect(() => {
    if (!id) return;
    if (state) return;
    getGame(id)
      .then(s => setState(s))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, state]);

  if (!id || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400">Loading game...</p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-slate-400">Game not found. Start a new game.</p>
          <a href="/" className="text-emerald-400 hover:underline">Go Home</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 max-w-5xl mx-auto">
      <GameBoard
        gameId={id}
        initialState={state}
        onStateChange={() => {}}
      />
    </div>
  );
}
