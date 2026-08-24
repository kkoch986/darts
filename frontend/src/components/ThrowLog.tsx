import type { GameState, X01GameState, CricketGameState, ThrowRecord, Segment } from '../lib/types';

function segmentLabel(seg: Segment): string {
  if (seg.value === 25) return seg.type === 4 ? 'D25' : 'SB';
  switch (seg.type) {
    case 2: return `T${seg.value}`;
    case 1: return `D${seg.value}`;
    default: return `${seg.value}`;
  }
}

interface ThrowLogProps {
  state: GameState;
}

function X01Log({ state }: { state: X01GameState }) {
  const turns: { player: string; darts: ThrowRecord[]; turnScore: number; round: number; order: number; remaining?: number }[] = [];
  let order = 0;

  for (const p of state.players) {
    const hist = p.history || [];
    let currentTurn: ThrowRecord[] = [];
    let currentRound: number | null = null;
    for (const d of hist) {
      if (d.round !== currentRound) {
        if (currentTurn.length > 0) {
          turns.push({
            player: p.name,
            darts: currentTurn,
            turnScore: currentTurn.reduce((s, d) => s + d.score, 0),
            round: currentRound || 0,
            order: order++,
          });
        }
        currentTurn = [];
        currentRound = d.round;
      }
      currentTurn.push(d);
    }
    if (currentTurn.length > 0) {
      turns.push({
        player: p.name,
        darts: currentTurn,
        turnScore: currentTurn.reduce((s, d) => s + d.score, 0),
        round: currentRound || 0,
        order: order++,
      });
    }
    if (p.turn_darts && p.turn_darts.length > 0) {
      turns.push({
        player: p.name,
        darts: p.turn_darts,
        turnScore: p.turn_darts.reduce((s, d) => s + d.score, 0),
        round: p.turn_darts[0]?.round || 0,
        order: order++,
      });
    }
  }

  turns.sort((a, b) => b.round - a.round || b.order - a.order);

  const seen = new Set<string>();
  const unique = turns.filter(t => {
    const key = `${t.round}-${t.player}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Compute running remaining for each turn (single-player only)
  if (state.players.length === 1) {
    const p = state.players[0];
    const allTurns = [...unique].reverse(); // chronological
    // Reverse-walk to find starting score
    let startScore = p.score;
    for (const t of allTurns) startScore += t.turnScore;
    // Forward-walk: compute remaining after each turn
    const remaining: number[] = [];
    let score = startScore;
    for (const t of allTurns) {
      score -= t.turnScore;
      remaining.push(score);
    }
    // Map back to desc order
    const remDesc = [...remaining].reverse();
    for (let i = 0; i < unique.length; i++) {
      unique[i].remaining = remDesc[i];
    }
  }

  return (
    <>
      {unique.map((turn, i) => (
        <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-slate-700/40">
          <span className="font-bold text-slate-300 w-20 truncate shrink-0">{turn.player}</span>
          <span className="text-slate-600 text-[10px] w-6 shrink-0">R{turn.round}</span>
          <div className="flex gap-1 flex-wrap">
            {turn.darts.map((d, di) => (
              <span key={di} className={`px-1.5 py-0.5 rounded font-mono ${
                d.busted ? 'bg-amber-900/60 text-amber-300' : 'bg-slate-700'
              }`}>
                {d.busted ? `${segmentLabel(d.segment)} ✗` : d.label}
              </span>
            ))}
          </div>
          <span className="ml-auto text-emerald-400 font-mono font-bold shrink-0">
            {turn.remaining !== undefined ? turn.remaining : (turn.turnScore > 0 ? `-${turn.turnScore}` : turn.turnScore)}
          </span>
        </div>
      ))}
    </>
  );
}

function CricketLog({ state }: { state: CricketGameState }) {
  const isCricketNumber = (val: number) => val >= 15 && val <= 20 || val === 25;

  const isScoring = (dart: ThrowRecord, playerIdx: number): boolean => {
    const val = dart.segment.value;
    if (!isCricketNumber(val)) return false;
    const player = state.players[playerIdx];
    if (!player) return false;
    const marks = player.marks[val] || 0;
    if (marks < 3) return false;
    for (const opp of state.players) {
      if (opp.id !== player.id && (opp.marks[val] || 0) < 3) return true;
    }
    return false;
  };

  const isMarking = (dart: ThrowRecord, playerIdx: number): boolean => {
    const val = dart.segment.value;
    if (!isCricketNumber(val)) return false;
    if (dart.score > 0) return false;
    const player = state.players[playerIdx];
    if (!player) return false;
    return (player.marks[val] || 0) < 3;
  };

  const turns: { player: string; playerIdx: number; darts: ThrowRecord[]; round: number; order: number }[] = [];
  let order = 0;

  for (let pi = 0; pi < state.players.length; pi++) {
    const p = state.players[pi];
    const hist = p.history || [];
    let currentTurn: ThrowRecord[] = [];
    let currentRound: number | null = null;
    for (const d of hist) {
      if (d.round !== currentRound) {
        if (currentTurn.length > 0) {
          turns.push({
            player: p.name,
            playerIdx: pi,
            darts: currentTurn,
            round: currentRound || 0,
            order: order++,
          });
        }
        currentTurn = [];
        currentRound = d.round;
      }
      currentTurn.push(d);
    }
    if (currentTurn.length > 0) {
      turns.push({
        player: p.name,
        playerIdx: pi,
        darts: currentTurn,
        round: currentRound || 0,
        order: order++,
      });
    }
    if (p.turn_darts && p.turn_darts.length > 0) {
      turns.push({
        player: p.name,
        playerIdx: pi,
        darts: p.turn_darts,
        round: p.turn_darts[0]?.round || 0,
        order: order++,
      });
    }
  }

  turns.sort((a, b) => b.round - a.round || b.order - a.order);

  const seen = new Set<string>();
  const unique = turns.filter(t => {
    const key = `${t.round}-${t.player}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <>
      {unique.map((turn, i) => {
        let runningScore = 0;
        return (
          <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-slate-700/40">
            <span className="font-bold text-slate-300 w-20 truncate shrink-0">{turn.player}</span>
            <span className="text-slate-600 text-[10px] w-6 shrink-0">R{turn.round}</span>
            <div className="flex gap-1 flex-wrap">
              {turn.darts.map((d, di) => {
                const scoring = isScoring(d, turn.playerIdx);
                const marking = isMarking(d, turn.playerIdx);
                const miss = d.segment.value === 0;
                runningScore += d.score;

                const color = miss
                  ? 'bg-red-900/60 text-red-300'
                  : scoring
                  ? 'bg-emerald-900/60 text-emerald-300'
                  : marking
                  ? 'bg-amber-900/60 text-amber-300'
                  : 'bg-slate-700 text-slate-400';

                return (
                  <span key={di} className={`px-1.5 py-0.5 rounded font-mono ${color}`}>
                    {d.label}
                  </span>
                );
              })}
            </div>
            <span className="ml-auto text-emerald-400 font-mono font-bold shrink-0">
              {runningScore > 0 ? `+${runningScore}` : runningScore}
            </span>
          </div>
        );
      })}
    </>
  );
}

export default function ThrowLog({ state }: ThrowLogProps) {
  const hasThrows = state.players.some(p => (p.history && p.history.length > 0) || (p.turn_darts && p.turn_darts.length > 0));

  return (
    <div className="bg-slate-800/80 rounded-xl p-4 flex-1 min-w-0 flex flex-col h-80 max-h-80">
      <h3 className="text-sm font-bold text-slate-300 mb-2">Throw History</h3>
      <div className="flex-1 overflow-y-auto space-y-0 min-h-0">
        {hasThrows ? (
          state.type === 'x01' ? (
            <X01Log state={state as X01GameState} />
          ) : (
            <CricketLog state={state as CricketGameState} />
          )
        ) : (
          <div className="text-xs text-slate-600 text-center py-4">No throws yet</div>
        )}
      </div>
    </div>
  );
}
