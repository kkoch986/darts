import type { X01GameState, CricketGameState, GameState, X01Player, CricketPlayer, ThrowRecord } from '../lib/types';
import { CRICKET_NUMBERS } from '../lib/types';

interface ScoreboardProps {
  state: GameState;
  lastDarts?: Record<string, string | null>;
  // Renders a tighter, single-row-per-player layout for use in a pinned bar,
  // so the remaining score stays readable while the scoring input is scrolled to.
  pin?: boolean;
}

function lastThrowDisplay(player: X01Player | CricketPlayer, lastDart?: string | null): string | null {
  if (lastDart) return lastDart;
  const hist = (player as X01Player).history;
  if (hist && hist.length > 0) return hist[hist.length - 1].label;
  const turn = player.turn_darts;
  if (turn && turn.length > 0) return turn[turn.length - 1].label;
  return null;
}

function TurnChips({ darts, compact }: { darts: ThrowRecord[]; compact?: boolean }) {
  if (!darts || darts.length === 0) return null;
  return (
    <div className="flex gap-1 flex-wrap">
      {darts.map((d, di) => (
        <span
          key={di}
          className={`font-mono bg-slate-600 rounded ${compact ? 'text-[11px] px-1.5 py-0.5' : 'text-xs px-1.5 py-0.5'}`}
        >
          {d.label} ({d.score})
        </span>
      ))}
    </div>
  );
}

function X01Scoreboard({
  state,
  lastDarts,
  pin,
}: {
  state: X01GameState;
  lastDarts?: Record<string, string | null>;
  pin?: boolean;
}) {
  const currentPlayerIdx = state.current_player;

  if (pin) {
    return (
      <div>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${state.players.length}, 1fr)` }}>
          {state.players.map((p, i) => (
            <div
              key={p.id}
              className={`rounded-lg px-2.5 py-1.5 transition ${
                i === currentPlayerIdx
                  ? 'bg-slate-700 ring-2 ring-emerald-500'
                  : 'bg-slate-800/80'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold text-xs truncate">{p.name}</span>
                <span className="text-2xl font-mono font-bold leading-none">{p.score}</span>
              </div>
              {/* Reserved height so the pinned bar does not jump as darts land. */}
              <div className="flex items-baseline justify-between gap-2 mt-0.5 min-h-[14px]">
                <span className="text-[11px] text-emerald-400 font-mono">
                  {p.turn_darts?.length ? `${p.turn_score} (${p.darts_used}/3)` : ''}
                </span>
              </div>
              <div className="mt-1 min-h-[18px]">
                <TurnChips darts={p.turn_darts} compact />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${state.players.length}, 1fr)` }}>
        {state.players.map((p, i) => (
          <div
            key={p.id}
            className={`rounded-lg p-3 text-center transition ${
              i === currentPlayerIdx
                ? 'bg-slate-700 ring-2 ring-emerald-500'
                : 'bg-slate-800'
            }`}
          >
            <div className="font-bold text-sm truncate">{p.name}</div>
            <div className="text-3xl font-mono font-bold mt-1">{p.score}</div>
            <div className="text-xs text-slate-400 mt-0.5">{p.is_bot ? 'Bot' : 'Player'}</div>
            {p.turn_darts && p.turn_darts.length > 0 && (
              <div className="text-xs text-emerald-400 mt-1">
                Turn: {p.turn_score} ({p.darts_used}/3 darts)
              </div>
            )}
            {p.turn_darts && p.turn_darts.length > 0 && (
              <div className="flex gap-1 justify-center mt-1">
                <TurnChips darts={p.turn_darts} />
              </div>
            )}
            <div className="text-xs text-slate-500 mt-2 h-4">
              {lastThrowDisplay(p, lastDarts?.[p.id]) && (
                <span>Last: <span className="text-white font-mono">{lastThrowDisplay(p, lastDarts?.[p.id])}</span></span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function marksDisplay(marks: number): string {
  if (marks >= 3) return 'X';
  if (marks === 2) return 'O';
  if (marks === 1) return '/';
  return '-';
}

function CricketScoreboard({
  state,
  lastDarts,
  pin,
}: {
  state: CricketGameState;
  lastDarts?: Record<string, string | null>;
  pin?: boolean;
}) {
  const currentPlayerIdx = state.current_player;

  const playerMPR = state.players.map(p => {
    const totalMarks = CRICKET_NUMBERS.reduce((sum, n) => sum + ((p.marks || {})[n] || 0), 0);
    const rounds = Math.max(1, state.round - 1);
    return totalMarks / rounds;
  });

  // Transposed for a pinned bar: the marks table as seven columns is far taller
  // than two rows, and players-as-rows is the usual way cricket is displayed.
  if (pin) {
    return (
      <div
        className="grid gap-x-1 gap-y-0.5"
        style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${CRICKET_NUMBERS.length}, minmax(0,1fr))` }}
      >
        <div />
        {CRICKET_NUMBERS.map(n => (
          <div key={n} className="text-center text-[10px] font-mono text-slate-500 leading-tight py-0.5">
            {n === 25 ? 'B' : n}
          </div>
        ))}
        {state.players.map((p, i) => {
          const row = i === currentPlayerIdx ? 'bg-slate-700/60' : '';
          return [
            <div key={`${p.id}-name`} className={`flex items-baseline gap-1 min-w-0 rounded px-1 ${row}`}>
              <span className="text-xs font-bold truncate">{p.name}</span>
              <span className="text-xs font-mono text-emerald-400 ml-auto">{p.score}</span>
            </div>,
            ...CRICKET_NUMBERS.map(n => {
              const marks = (p.marks || {})[n] || 0;
              const allClosed = state.players.every(pp => ((pp.marks || {})[n] || 0) >= 3);
              const tone = marks >= 3
                ? 'text-red-400'
                : marks > 0
                ? 'text-yellow-400'
                : 'text-slate-600';
              return (
                <div
                  key={`${p.id}-${n}`}
                  className={`text-center font-mono font-bold text-sm leading-tight py-0.5 rounded ${row} ${tone} ${
                    allClosed ? 'opacity-40' : ''
                  }`}
                >
                  {marksDisplay(marks)}
                </div>
              );
            }),
          ];
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${state.players.length}, 1fr)` }}>
        {state.players.map((p, i) => (
          <div
            key={p.id}
            className={`rounded-lg p-3 text-center transition ${
              i === currentPlayerIdx
                ? 'bg-slate-700 ring-2 ring-emerald-500'
                : 'bg-slate-800'
            }`}
          >
            <div className="font-bold text-sm truncate">{p.name}</div>
            <div className="text-3xl font-mono font-bold mt-1">{p.score}</div>
            <div className="text-xs text-slate-400 mt-1">MPR: <span className="font-mono text-slate-300">{playerMPR[i].toFixed(2)}</span></div>
            <div className="text-xs text-slate-400">{p.is_bot ? 'Bot' : 'Player'}</div>
            <div className="text-xs text-slate-500 mt-2 h-4">
              {lastThrowDisplay(p, lastDarts?.[p.id]) && (
                <span>Last: <span className="text-white font-mono">{lastThrowDisplay(p, lastDarts?.[p.id])}</span></span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-slate-800 rounded-xl p-2 overflow-y-auto">
        <table className="text-sm border-separate border-spacing-0 h-full w-full">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left text-slate-400 sticky left-0 bg-slate-900 z-10">Number</th>
              {state.players.map((p, i) => (
                <th key={p.id} className={`px-4 py-2 text-center font-bold ${i === currentPlayerIdx ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="h-full">
            {CRICKET_NUMBERS.map(n => {
              const allClosed = state.players.every(p => ((p.marks || {})[n] || 0) >= 3);
              return (
                <tr key={n} className={`h-full ${allClosed ? 'opacity-40' : ''}`}>
                  <td className={`px-4 py-3 font-bold text-lg sticky left-0 bg-slate-900 z-10 ${allClosed ? 'line-through text-slate-500' : 'text-slate-300'}`}>
                    {n === 25 ? 'Bull' : n}
                  </td>
                  {state.players.map((p, pi) => {
                    const marks = ((p.marks || {})[n] || 0);
                    const closed = marks >= 3;
                    return (
                      <td key={p.id} className={`px-4 py-3 text-center font-mono font-bold text-xl ${
                        closed
                          ? 'text-red-400 line-through'
                          : marks > 0
                          ? 'text-yellow-400'
                          : 'text-slate-600'
                      } ${pi === currentPlayerIdx ? 'bg-slate-700/50' : ''}`}>
                        {marksDisplay(marks)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Scoreboard({ state, lastDarts, pin }: ScoreboardProps) {
  if (state.type === 'x01') {
    return <X01Scoreboard state={state as X01GameState} lastDarts={lastDarts} pin={pin} />;
  }
  return <CricketScoreboard state={state as CricketGameState} lastDarts={lastDarts} pin={pin} />;
}
