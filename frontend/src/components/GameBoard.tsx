import { useState, useCallback, useMemo } from 'react';
import type { GameState, CricketGameState, X01GameState, AiThrowResult } from '../lib/types';
import { CRICKET_NUMBERS } from '../lib/types';
import { throwDart, endTurn, undoThrow } from '../lib/api';
import Dartboard from './Dartboard';
import SimpleScoring from './SimpleScoring';
import Scoreboard from './Scoreboard';
import ThrowLog from './ThrowLog';
import BotShow from './BotShow';
import PlayerHeatmap from './PlayerHeatmap';
import MPRGraph from './MPRGraph';

interface GameBoardProps {
  gameId: string;
  initialState: GameState;
  onStateChange: (state: GameState) => void;
}

export default function GameBoard({ gameId, initialState, onStateChange }: GameBoardProps) {
  const [state, setState] = useState<GameState>(initialState);
  const [inputMode, setInputMode] = useState<'detailed' | 'simple'>('detailed');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [bustInfo, setBustInfo] = useState<string | null>(null);

  const [botThrows, setBotThrows] = useState<AiThrowResult[] | null>(null);
  const [preBotState, setPreBotState] = useState<GameState | null>(null);
  const [pendingFinalState, setPendingFinalState] = useState<GameState | null>(null);

  const currentPlayer = state.players[state.current_player];
  const isHumanTurn = !currentPlayer?.is_bot;
  const isAnimatingBot = botThrows !== null;

  const handleThrow = useCallback(async (label: string) => {
    if (!isHumanTurn || loading || state.is_over || isAnimatingBot) return;
      setLoading(true);
      setError(null);
      setBustInfo(null);

    try {
      const res = await throwDart(gameId, label);
      if (res.state) {
        setState(res.state);
        onStateChange(res.state);
      }
      if (res.error) {
        setBustInfo(res.error);
        setTimeout(() => setBustInfo(null), 2500);
      } else {
        setError(null);
      }
      const aiTurns = res.ai_turns as AiThrowResult[] | undefined;
      if (aiTurns && aiTurns.length > 0) {
        setPreBotState(state);
        setPendingFinalState(res.state);
        setBotThrows(aiTurns);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Throw failed');
    } finally {
      setLoading(false);
    }
  }, [gameId, isHumanTurn, loading, state.is_over, isAnimatingBot, onStateChange]);

  const handleEndTurn = useCallback(async () => {
    if (loading || state.is_over || isAnimatingBot) return;
    setLoading(true);
    setError(null);
    setBustInfo(null);

    try {
      const res = await endTurn(gameId);
      const aiTurns = res.ai_turns as AiThrowResult[] | undefined;

      if (aiTurns && aiTurns.length > 0) {
        setPreBotState(state);
        setPendingFinalState(res.state);
        setBotThrows(aiTurns);
      } else {
        setState(res.state);
        onStateChange(res.state);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'End turn failed');
    } finally {
      setLoading(false);
    }
  }, [gameId, loading, state, state.is_over, isAnimatingBot, onStateChange]);

  const handleBotAnimationDone = useCallback(() => {
    if (pendingFinalState) {
      setState(pendingFinalState);
      onStateChange(pendingFinalState);
    }
    setBotThrows(null);
    setPreBotState(null);
    setPendingFinalState(null);
    setBustInfo(null);
  }, [pendingFinalState, onStateChange]);

  const handleUndo = useCallback(async () => {
    if (loading || state.is_over || isAnimatingBot) return;
    setLoading(true);
    setError(null);
    setBustInfo(null);

    try {
      const res = await undoThrow(gameId);
      if (res.error) {
        setError(res.error);
      } else {
        setState(res.state);
        onStateChange(res.state);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Undo failed');
    } finally {
      setLoading(false);
    }
  }, [gameId, loading, state.is_over, isAnimatingBot, onStateChange]);

  const lastDarts = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const p of state.players) {
      const hist = (p as { history?: { label: string }[] }).history;
      if (hist && hist.length > 0) {
        map[p.id] = hist[hist.length - 1].label;
      } else if (p.turn_darts && p.turn_darts.length > 0) {
        map[p.id] = p.turn_darts[p.turn_darts.length - 1].label;
      } else {
        map[p.id] = null;
      }
    }
    return map;
  }, [state]);

  if (state.is_over) {
    const winner = 'winner' in state ? state.winner : null;
    return (
      <div className="text-center space-y-6 py-12">
        <div className="text-5xl font-bold text-emerald-400">Game Over!</div>
        {winner && (
          <div className="text-2xl text-slate-300">
            <span className="font-bold text-white">{winner.name}</span> wins!
          </div>
        )}
        <Scoreboard state={state} lastDarts={lastDarts} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
          <PlayerHeatmap state={state} playerIndex={0} lastDarts={[]} />
          <ThrowLog state={state} />
          {state.players.length > 1 && (
            <PlayerHeatmap state={state} playerIndex={1} lastDarts={[]} />
          )}
        </div>
        {state.type === 'cricket' && (
          <MPRGraph state={state as CricketGameState} />
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => window.location.href = '/'}
            className="px-6 py-3 bg-slate-600 hover:bg-slate-500 rounded-lg font-bold transition"
          >
            New Game
          </button>
        </div>
      </div>
    );
  }

  const cricketNumbers = state.type === 'cricket'
    ? (state as CricketGameState).players[0]
      ? Object.keys((state as CricketGameState).players[0].marks).map(Number)
      : [20,19,18,17,16,15,25]
    : undefined;

  const closedNumbers = state.type === 'cricket'
    ? new Set(
        CRICKET_NUMBERS.filter(n =>
          (state as CricketGameState).players.every(p => ((p.marks || {})[n] || 0) >= 3)
        )
      )
    : new Set<number>();

  const displayState = preBotState || state;

  const scoringInput = !isAnimatingBot && (
    inputMode === 'detailed' ? (
      <div className="flex flex-col items-center gap-3">
        <Dartboard
          onSegmentClick={isHumanTurn ? handleThrow : undefined}
          size={Math.min(350, typeof window !== 'undefined' ? window.innerWidth - 32 : 350)}
        />
        <button
          onClick={() => handleThrow('MISS')}
          disabled={!isHumanTurn || loading || state.is_over}
          className="px-6 py-2 rounded-lg font-bold text-sm bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:text-slate-500 text-slate-300 transition"
        >
          MISS
        </button>
      </div>
    ) : (
      <SimpleScoring
        onSelect={handleThrow}
        gameType={state.type}
        cricketNumbers={cricketNumbers}
      />
    )
  );

  return (
    <div className="space-y-5">
      {/* Error + last dart */}
      {error && (
        <div className="border rounded-lg px-4 py-2 text-sm bg-red-900/50 border-red-700 text-red-300">
          {error}
        </div>
      )}
      {/* Bust modal */}
      {bustInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-amber-950 rounded-2xl px-8 py-6 shadow-2xl border border-amber-700/60 max-w-sm w-full mx-4 text-center space-y-3 animate-in fade-in zoom-in duration-150">
            <div className="text-amber-400 font-black text-3xl tracking-wide">BUST</div>
            <div className="text-amber-200/80 text-sm">{bustInfo}</div>
            <div className="text-amber-500/50 text-xs mt-1">turn reverted</div>
          </div>
        </div>
      )}

      {isAnimatingBot && botThrows && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700 max-w-md w-full mx-4">
            <BotShow throws={botThrows} gameType={state.type} closedNumbers={closedNumbers} onDone={handleBotAnimationDone} />
          </div>
        </div>
      )}

      {/* Main game area: scoreboard + scoring input side by side */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        <div
          className={
            displayState.type === 'x01'
              ? 'flex-1 min-w-0 sticky top-[var(--fs-top-offset,0px)] z-30 py-2 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 lg:static lg:py-0 lg:bg-transparent lg:backdrop-blur-none lg:border-b-0'
              : 'flex-1 min-w-0'
          }
        >
          <Scoreboard state={displayState} lastDarts={lastDarts} pin={displayState.type === 'x01'} />
        </div>
        <div className="flex flex-col items-center gap-3 lg:w-auto">
          <div className="w-full text-center text-sm text-slate-400">
            Round {state.round} &middot; {state.type === 'x01' ? `${(state as X01GameState).starting_score} game` : 'Cricket'}
          </div>

          {/* Input mode toggle */}
          {!isAnimatingBot && (
            <div className="flex gap-2">
              <button
                onClick={() => setInputMode('simple')}
                className={`px-4 py-2 rounded text-sm font-medium transition ${
                  inputMode === 'simple'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Simple
              </button>
              <button
                onClick={() => setInputMode('detailed')}
                className={`px-4 py-2 rounded text-sm font-medium transition ${
                  inputMode === 'detailed'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Board
              </button>
            </div>
          )}

          {!isHumanTurn && !state.is_over && !isAnimatingBot && (
            <div className="text-center text-slate-400 animate-pulse text-sm">
              Bot is thinking...
            </div>
          )}

          {scoringInput}

          {!isAnimatingBot && (
            <div className="flex gap-3">
              <button
                onClick={handleUndo}
                disabled={loading || state.is_over || !isHumanTurn}
                className="px-5 py-3 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-bold transition"
              >
                Undo
              </button>
              <button
                onClick={handleEndTurn}
                disabled={loading || state.is_over || !isHumanTurn}
                className="px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-bold transition"
              >
                End Turn
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom section: heatmaps + throw log */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
        <PlayerHeatmap state={state} playerIndex={0} lastDarts={state.players[0]?.turn_darts} />
        <ThrowLog state={state} />
        {state.players.length > 1 && (
          <PlayerHeatmap state={state} playerIndex={1} lastDarts={state.players[1]?.turn_darts} />
        )}
      </div>

      {state.type === 'cricket' && (
        <MPRGraph state={state as CricketGameState} />
      )}
    </div>
  );
}
