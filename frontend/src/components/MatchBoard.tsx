import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Trophy } from 'lucide-react';
import type { MatchState, CricketGameState, X01GameState, GameState } from '../lib/types';
import { CRICKET_NUMBERS } from '../lib/types';
import { throwInMatch, endTurnInMatch, undoInMatch, getMatchStats, getGame, type MatchEndTurnResponse, type MatchStats } from '../lib/api';
import Dartboard from './Dartboard';
import SimpleScoring from './SimpleScoring';
import Scoreboard from './Scoreboard';
import StrategyAdvisor from './StrategyAdvisor';
import ThrowLog from './ThrowLog';
import BotShow from './BotShow';
import PlayerHeatmap from './PlayerHeatmap';
import MPRGraph from './MPRGraph';

interface MatchBoardProps {
  matchId: string;
  initialMatch: MatchState;
  onMatchChange?: (match: MatchState) => void;
}

export default function MatchBoard({ matchId, initialMatch, onMatchChange }: MatchBoardProps) {
  const [match, setMatch] = useState<MatchState>(initialMatch);
  const [inputMode, setInputMode] = useState<'detailed' | 'simple'>('detailed');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bustInfo, setBustInfo] = useState<string | null>(null);
  const [botThrows, setBotThrows] = useState<MatchEndTurnResponse['ai_turns'] | null>(null);
  const [preBotMatch, setPreBotMatch] = useState<MatchState | null>(null);
  const [matchStats, setMatchStats] = useState<MatchStats | null>(null);
  const [fanfare, setFanfare] = useState<{ type: 'leg' | 'match'; winnerName: string } | null>(null);
  const pendingFanfare = useRef<{ type: 'leg' | 'match'; winnerName: string } | null>(null);
  const botInProgress = useRef(false);
  const [selectedLeg, setSelectedLeg] = useState<number | null>(null);
  const [historicalGame, setHistoricalGame] = useState<GameState | null>(null);
  const [loadingLeg, setLoadingLeg] = useState(false);

  useEffect(() => {
    getMatchStats(matchId).then(setMatchStats).catch(() => {});
  }, [matchId, match]);

  // Load historical game when a leg is selected
  useEffect(() => {
    if (selectedLeg === null || !match.leg_history || !match.leg_history[selectedLeg]) {
      setHistoricalGame(null);
      return;
    }
    const gameId = match.leg_history[selectedLeg].game_id;
    setLoadingLeg(true);
    getGame(gameId)
      .then(g => setHistoricalGame(g))
      .catch(() => setHistoricalGame(null))
      .finally(() => setLoadingLeg(false));
  }, [selectedLeg, match.leg_history]);

  const state = match.current_game_state;
  const displayState = historicalGame || state;
  const viewingHistorical = selectedLeg !== null;
  const currentPlayer = displayState.players[displayState.current_player];
  const isHumanTurn = !currentPlayer?.is_bot && !viewingHistorical;

  const computeFanfare = useCallback((prev: MatchState, newMatch: MatchState): { type: 'leg' | 'match'; winnerName: string } | null => {
    const prevLegs = prev.leg_history?.length ?? 0;
    const newLegs = newMatch.leg_history?.length ?? 0;
    const justCompleted = newMatch.status === 'completed' && prev.status !== 'completed';
    const justWonLeg = newLegs > prevLegs;
    if (!justCompleted && !justWonLeg) return null;
    const winner = newMatch.players.find(p => p.id === newMatch.winner_id) || newMatch.players.find(p => p.id === newMatch.leg_history?.[newLegs - 1]?.winner_id);
    if (!winner) return null;
    return { type: justCompleted ? 'match' : 'leg', winnerName: winner.name };
  }, []);

  const handleUpdate = useCallback((res: { match: MatchState; error?: string }, deferFanfare?: boolean) => {
    const newMatch = res.match;
    setMatch(prev => {
      const f = computeFanfare(prev, newMatch);
      if (f) {
        if (deferFanfare) {
          pendingFanfare.current = f;
        } else {
          setFanfare(f);
        }
      }
      return newMatch;
    });
    onMatchChange?.(newMatch);
    return newMatch;
  }, [onMatchChange, computeFanfare]);

  const handleThrow = useCallback(async (label: string) => {
    if (!isHumanTurn || loading || state.is_over) return;
    setLoading(true);
    setError(null);
    setBustInfo(null);

    try {
      const res = await throwInMatch(matchId, label);
      handleUpdate(res);
      if (res.error) {
        setBustInfo(res.error);
        setTimeout(() => setBustInfo(null), 2500);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Throw failed');
    } finally {
      setLoading(false);
    }
  }, [matchId, isHumanTurn, loading, state.is_over, handleUpdate]);

  const playBotTurn = useCallback(async () => {
    if (loading || state.is_over || botThrows) return;
    setLoading(true);
    try {
      const res = await endTurnInMatch(matchId);
      const hasBotTurns = res.ai_turns && res.ai_turns.length > 0;
      if (hasBotTurns) {
        setPreBotMatch(match);
        setBotThrows(res.ai_turns);
      }
      handleUpdate(res, !!hasBotTurns);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bot turn failed');
    } finally {
      setLoading(false);
    }
  }, [matchId, loading, state.is_over, botThrows, handleUpdate, match]);

  useEffect(() => {
    if (!isHumanTurn && !state.is_over && !loading && !botThrows && !botInProgress.current) {
      botInProgress.current = true;
      playBotTurn().finally(() => {
        botInProgress.current = false;
      });
    }
  }, [isHumanTurn, state.is_over, loading, botThrows, playBotTurn]);

  const handleBotAnimationDone = useCallback(() => {
    setBotThrows(null);
    setPreBotMatch(null);
    if (pendingFanfare.current) {
      setFanfare(pendingFanfare.current);
      pendingFanfare.current = null;
    }
  }, []);

  const handleEndTurn = useCallback(async () => {
    if (loading || state.is_over || !isHumanTurn) return;
    setLoading(true);
    setBustInfo(null);

    try {
      const res = await endTurnInMatch(matchId);
      const hasBotTurns = res.ai_turns && res.ai_turns.length > 0;
      if (hasBotTurns) {
        setPreBotMatch(match);
        setBotThrows(res.ai_turns);
      }
      handleUpdate(res, !!hasBotTurns);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'End turn failed');
    } finally {
      setLoading(false);
    }
  }, [matchId, loading, state.is_over, isHumanTurn, handleUpdate, match]);

  const handleUndo = useCallback(async () => {
    if (loading || state.is_over) return;
    setLoading(true);
    setBustInfo(null);

    try {
      const res = await undoInMatch(matchId);
      handleUpdate(res);
      if (res.error) {
        setError(res.error);
      } else {
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Undo failed');
    } finally {
      setLoading(false);
    }
  }, [matchId, loading, state.is_over, handleUpdate]);

  const needed = Math.floor(match.total_games / 2) + 1;

  const statsPanel = matchStats && match.total_games > 1 && (
    <div className="bg-slate-800 rounded-xl p-3 space-y-2 w-full">
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Match Stats</div>
        <div className="text-[10px] text-slate-500">Best of {match.total_games} · First to {needed} legs</div>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${match.players?.length ?? 1}, 1fr)` }}>
        {match.players.map(p => (
          <div key={p.id} className="text-center bg-slate-700/50 rounded-lg p-1.5">
            <div className="text-xs text-slate-300 truncate">{p.name}</div>
            <div className="text-lg font-bold text-emerald-400">{match.game_scores[p.id] || 0}</div>
            {displayState.type === 'x01' ? (
              <>
                <div className="text-[10px] text-slate-400">Avg {matchStats.averages[p.id]?.toFixed(1) ?? '-'}</div>
                <div className="text-[10px] text-slate-400">Co {matchStats.checkout_pct[p.id]?.toFixed(0) ?? 0}%</div>
                <div className="text-[10px] text-slate-400">D/L {matchStats.darts_per_leg[p.id]?.toFixed(0) ?? '-'}</div>
              </>
            ) : (
              <>
                <div className="text-[10px] text-emerald-400">MPR {matchStats.mpr[p.id]?.toFixed(2) ?? '-'}</div>
                <div className="text-[10px] text-slate-400">D/L {matchStats.darts_per_leg[p.id]?.toFixed(0) ?? '-'}</div>
              </>
            )}
          </div>
        ))}
      </div>
      {match.status === 'completed' && (
        <div className="text-center text-emerald-400 font-bold text-xs">
          Match Complete — {match.players.find(p => p.id === match.winner_id)?.name} wins
        </div>
      )}
    </div>
  );

  const lastDarts = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const p of displayState.players || []) {
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
  }, [displayState]);

  const cricketNumbers = displayState.type === 'cricket'
    ? (displayState as CricketGameState).players[0]
      ? Object.keys((displayState as CricketGameState).players[0].marks).map(Number)
      : [20,19,18,17,16,15,25]
    : undefined;

  const scoringInput = (
    <div className="flex flex-col items-center gap-3">
      {inputMode === 'detailed' ? (
        <>
          <Dartboard
            onSegmentClick={isHumanTurn && !state.is_over ? handleThrow : undefined}
            size={Math.min(350, typeof window !== 'undefined' ? window.innerWidth - 32 : 350)}
          />
          <button
            onClick={() => handleThrow('MISS')}
            disabled={!isHumanTurn || loading || state.is_over}
            className="px-6 py-2 rounded-lg font-bold text-sm bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:text-slate-500 text-slate-300 transition"
          >
            MISS
          </button>
        </>
      ) : (
        <SimpleScoring
          onSelect={handleThrow}
          gameType={displayState.type}
          cricketNumbers={cricketNumbers}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {error && (
        <div className="border rounded-lg px-4 py-2 text-sm bg-red-900/50 border-red-700 text-red-300">
          {error}
        </div>
      )}

      {bustInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-amber-950 rounded-2xl px-8 py-6 shadow-2xl border border-amber-700/60 max-w-sm w-full mx-4 text-center space-y-3 animate-in fade-in zoom-in duration-150">
            <div className="text-amber-400 font-black text-3xl tracking-wide">BUST</div>
            <div className="text-amber-200/80 text-sm">{bustInfo}</div>
            <div className="text-amber-500/50 text-xs mt-1">turn reverted</div>
          </div>
        </div>
      )}

      {fanfare && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700 max-w-sm w-full mx-4 text-center space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-center">
              <Trophy size={56} className="text-emerald-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-400">
                {fanfare.type === 'match' ? 'Match Winner' : 'Leg Winner'}
              </div>
              <div className="text-xl text-white font-medium mt-1">{fanfare.winnerName}</div>
            </div>
            {fanfare.type === 'match' ? (
              <button
                onClick={() => window.location.href = '/'}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold transition"
              >
                New Match
              </button>
            ) : (
              <button
                onClick={() => setFanfare(null)}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold transition"
              >
                Continue
              </button>
            )}
          </div>
        </div>
      )}

      {botThrows && preBotMatch && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700 max-w-md w-full mx-4">
            <BotShow
              throws={botThrows}
              gameType={match.current_game_state.type}
              closedNumbers={
                match.current_game_state.type === 'cricket'
                  ? new Set(CRICKET_NUMBERS.filter(n =>
                      (match.current_game_state as CricketGameState).players.every(p => ((p.marks || {})[n] || 0) >= 3)
                    ))
                  : new Set<number>()
              }
              onDone={handleBotAnimationDone}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        <div className="flex-1 min-w-0 space-y-4">
          {match.status === 'completed' && (
            <div className="bg-emerald-900/40 border border-emerald-700 rounded-xl p-4 text-center space-y-1">
              <div className="text-emerald-400 font-bold text-sm uppercase tracking-wider">Match Complete</div>
              <div className="text-white text-xl font-bold">
                {match.players.find(p => p.id === match.winner_id)?.name ?? 'Unknown'} wins
              </div>
            </div>
          )}
          {(match.leg_history?.length ?? 0) > 0 && (
            <div className="flex gap-1 overflow-x-auto pb-1">
              {match.leg_history.map((leg, i) => {
                const winner = match.players.find(p => p.id === leg.winner_id);
                const isSelected = selectedLeg === i;
                return (
                  <button
                    key={leg.game_id}
                    onClick={() => setSelectedLeg(selectedLeg === i ? null : i)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                      isSelected
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                    }`}
                  >
                    Leg {i + 1}{winner ? ` · ${winner.name}` : ''}
                  </button>
                );
              })}
              {selectedLeg !== null && (
                <button
                  onClick={() => setSelectedLeg(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition bg-slate-600 text-slate-300 hover:bg-slate-500"
                >
                  Latest
                </button>
              )}
            </div>
          )}
          <Scoreboard state={displayState} lastDarts={lastDarts} />
          {match.status !== 'completed' && <StrategyAdvisor state={displayState} />}
        </div>
        <div className="flex flex-col items-center gap-3 lg:w-auto">
          {statsPanel}
          {match.status !== 'completed' && !viewingHistorical && (
            <>
              <div className="w-full text-center text-sm text-slate-400">
                Round {displayState.round} &middot; {displayState.type === 'x01' ? `${(displayState as X01GameState).starting_score} game` : 'Cricket'}
              </div>
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

              {!isHumanTurn && !state.is_over && (
                <div className="text-center text-slate-400 animate-pulse text-sm">
                  Bot is thinking...
                </div>
              )}

              {scoringInput}

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
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
        <PlayerHeatmap state={displayState} playerIndex={0} lastDarts={displayState.players[0]?.turn_darts} />
        {loadingLeg ? (
          <div className="bg-slate-800/80 rounded-xl p-4 flex-1 min-w-0 flex items-center justify-center h-80">
            <span className="text-slate-400 text-sm animate-pulse">Loading leg...</span>
          </div>
        ) : (
          <ThrowLog state={displayState} />
        )}
        {(displayState.players?.length ?? 0) > 1 && (
          <PlayerHeatmap state={displayState} playerIndex={1} lastDarts={displayState.players[1]?.turn_darts} />
        )}
      </div>

      {displayState.type === 'cricket' && (
        <MPRGraph state={displayState as CricketGameState} />
      )}
    </div>
  );
}
