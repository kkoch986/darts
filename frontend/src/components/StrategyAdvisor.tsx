import type { GameState, X01GameState, CricketGameState } from '../lib/types';
import { CRICKET_NUMBERS } from '../lib/types';

interface AdvisorProps {
  state: GameState;
}

function PriorityIcon({ priority }: { priority: 'high' | 'medium' | 'low' }) {
  if (priority === 'high') {
    return (
      <svg className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
      </svg>
    );
  }
  if (priority === 'medium') {
    return (
      <svg className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" viewBox="0 0 16 16" fill="currentColor">
        <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/>
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.399l-.451.003.082-.381 1.998-.003.024-.002z"/>
      <circle cx="8" cy="4.5" r="1"/>
    </svg>
  );
}

function CricketAdvice({ state }: { state: CricketGameState }) {
  const current = state.players[state.current_player];
  if (!current || current.is_bot) return null;

  const opp = state.players.find(p => p.id !== current.id);
  if (!opp) return null;

  const myMarks = current.marks || {};
  const oppMarks = opp.marks || {};
  const myScore = current.score;
  const oppScore = opp.score;

  const myOpen = CRICKET_NUMBERS.filter(n => (myMarks[n] || 0) < 3);
  const oppOpen = CRICKET_NUMBERS.filter(n => (oppMarks[n] || 0) < 3);
  const myClosedCount = CRICKET_NUMBERS.length - myOpen.length;
  const oppClosedCount = CRICKET_NUMBERS.length - oppOpen.length;
  const myClosed = CRICKET_NUMBERS.filter(n => (myMarks[n] || 0) >= 3);
  const scoringTargets = myClosed.filter(n => (oppMarks[n] || 0) < 3);

  interface Move {
    number: number;
    label: string;
    type: 'close' | 'score' | 'both';
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }

  const moves: Move[] = [];

  for (const n of CRICKET_NUMBERS) {
    const label = n === 25 ? 'Bull' : String(n);
    const my = myMarks[n] || 0;
    const opp_ = oppMarks[n] || 0;
    const iHaveIt = my >= 3;
    const oppHasIt = opp_ >= 3;

    // Skip fully closed numbers
    if (iHaveIt && oppHasIt) continue;

    // Can I close it this turn? (2 marks → need 1 more)
    if (my === 2 && !oppHasIt) {
      moves.push({
        number: n,
        label,
        type: 'close',
        reason: `Close ${label} (2/3 marks)`,
        priority: 'high',
      });
    }

    // Can I score on it? (I have it, opponent doesn't)
    if (iHaveIt && !oppHasIt) {
      moves.push({
        number: n,
        label,
        type: 'score',
        reason: `Score on ${label} (opponent has ${opp_}/3 marks)`,
        priority: opp_ >= 1 ? 'high' : 'medium',
      });
    }

    // Opponent has it and I don't — they can score on me
    if (oppHasIt && !iHaveIt) {
      moves.push({
        number: n,
        label,
        type: 'close',
        reason: `Close ${label} — opponent scoring on it`,
        priority: 'high',
      });
    }

    // Opponent is 1 away from closing a number I need
    if (opp_ === 2 && my < 3) {
      moves.push({
        number: n,
        label,
        type: 'close',
        reason: `Close ${label} before opponent does (${opp_}/3 marks)`,
        priority: 'high',
      });
    }
  }

  // Score differential
  const scoreDiff = myScore - oppScore;
  const imWinning = scoreDiff > 0;

  // Sort moves by priority and strategic value
  moves.sort((a, b) => {
    const pOrder = { high: 0, medium: 1, low: 2 };
    if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority];
    // Within same priority, prefer close over score when winning, score when losing
    if (a.type !== b.type) {
      if (imWinning) return a.type === 'close' ? -1 : 1;
      return a.type === 'score' ? -1 : 1;
    }
    // Within same type, prefer higher numbers for scoring
    return b.number - a.number;
  });

  let tip = '';
  let priority: 'high' | 'medium' | 'low' = 'medium';

  if (myClosedCount === CRICKET_NUMBERS.length) {
    if (scoringTargets.length > 0) {
      const best = scoringTargets.sort((a, b) => b - a)[0];
      const label = best === 25 ? 'Bull' : String(best);
      tip = `All closed! Score on ${label} — free points`;
      priority = 'high';
    } else {
      tip = 'All closed, opponent too. Go for bull!';
      priority = 'medium';
    }
  } else if (moves.length > 0) {
    const best = moves[0];
    tip = best.reason;
    priority = best.priority;

    // Add context about game state
    if (imWinning && scoreDiff > 20) {
      tip += ` — you're ahead by ${scoreDiff}, close up`;
    } else if (!imWinning && scoreDiff < -20) {
      tip += ` — behind by ${Math.abs(scoreDiff)}, need points`;
    }
  } else if (myOpen.length > 0) {
    // Fallback: suggest the number with most opponent marks
    const defensive = myOpen.sort((a, b) => (oppMarks[b] || 0) - (oppMarks[a] || 0))[0];
    const label = defensive === 25 ? 'Bull' : String(defensive);
    tip = `Work on ${label} (${myMarks[defensive] || 0}/3)`;
    priority = 'low';
  }

  const color = priority === 'high' ? 'text-amber-400' : priority === 'medium' ? 'text-emerald-400' : 'text-slate-400';

  return (
    <div className="mt-2 rounded-lg bg-slate-800/80 border border-slate-700 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Strategy</div>
      <div className={`text-xs leading-relaxed ${color}`}>
        <PriorityIcon priority={priority} />{tip}
      </div>
      <div className="flex gap-2 mt-1.5 text-[10px] text-slate-500">
        <span>You: {myClosedCount}/{CRICKET_NUMBERS.length} closed</span>
        <span>&middot;</span>
        <span>Opp: {oppClosedCount}/{CRICKET_NUMBERS.length} closed</span>
        <span>&middot;</span>
        <span className={imWinning ? 'text-emerald-500' : scoreDiff < 0 ? 'text-red-400' : ''}>
          {imWinning ? `+${scoreDiff}` : scoreDiff === 0 ? 'Tied' : `${scoreDiff}`}
        </span>
      </div>
    </div>
  );
}

const CHECKOUT_ROUTES: Record<number, string[]> = {
  170: ['T20 T20 DB'],
  167: ['T20 T19 DB'],
  164: ['T20 T18 DB', 'T19 T19 DB'],
  161: ['T20 T17 DB'],
  160: ['T20 T20 D20'],
  158: ['T20 T20 D19', 'T20 T16 DB'],
  156: ['T20 T20 D18', 'T19 T19 D20'],
  154: ['T20 T20 D17', 'T20 T14 DB'],
  152: ['T20 T20 D16', 'T19 T17 D20'],
  150: ['T20 T20 D15', 'T19 T19 D18', 'T20 T10 DB'],
  148: ['T20 T20 D14', 'T18 T18 DB'],
  147: ['T20 T19 D20'],
  145: ['T20 T19 D18', 'T20 T15 D20'],
  144: ['T20 T20 D12', 'T19 T19 D14'],
  143: ['T20 T19 D16', 'T18 T18 D20'],
  142: ['T20 T18 D19', 'T19 T17 D18'],
  140: ['T20 T20 D10', 'T19 T19 D12', 'T18 T18 D16'],
  139: ['T20 T19 D11', 'T17 T18 DB'],
  138: ['T20 T18 D12', 'T19 T19 D10'],
  137: ['T20 T17 D13', 'T18 T17 DB'],
  136: ['T20 T20 D8', 'T19 T19 D9', 'T18 T18 D13'],
  135: ['T20 T19 D9', 'T17 T18 D12'],
  134: ['T20 T18 D10', 'T19 T17 D12'],
  133: ['T20 T17 D10', 'T18 T16 DB'],
  132: ['T20 T20 D6', 'T19 T19 D7', 'T18 T18 D12'],
  130: ['T20 T20 D5', 'T19 T18 D10'],
  128: ['T18 T20 D7', 'T19 T19 D6', 'T16 T20 DB'],
  126: ['T19 T19 D12', 'T20 T16 D8', 'T18 T16 D12'],
  124: ['T20 T16 D8', 'T19 T17 D8', 'T18 T18 D8'],
  121: ['T20 T11 D14', 'T19 T12 D13'],
  120: ['T20 D20', 'T19 T19 D3'],
  118: ['T20 D19', 'T18 T20 D2'],
  116: ['T20 D18', 'T19 T19 D1'],
  114: ['T20 D17', 'T18 T18 D3'],
  112: ['T20 D16', 'T18 T18 D2'],
  110: ['T20 D15', 'T18 T18 D1'],
  108: ['T20 D14', 'T16 T20 D6'],
  106: ['T20 D13', 'T16 T18 D8'],
  104: ['T20 D12', 'T16 T18 D6'],
  102: ['T20 D11', 'T16 T18 D5'],
  100: ['T20 D10', 'T16 T18 D4'],
  98: ['T20 D9', 'T16 T18 D3'],
  96: ['T20 D8', 'T16 T18 D2'],
  94: ['T20 D7', 'T16 T18 D1'],
  92: ['T20 D6', 'T14 T18 D5'],
  90: ['T20 D5', 'T14 T18 D4'],
  88: ['T20 D4', 'T14 T18 D3'],
  86: ['T20 D3', 'T14 T18 D2'],
  84: ['T20 D2', 'T14 T18 D1'],
  82: ['T20 D1', 'T14 T16 D5'],
  80: ['T20 D10', 'T14 T16 D4'],
  78: ['T18 D12', 'T16 T16 D5'],
  76: ['T20 D8', 'T16 T16 D4'],
  74: ['T18 D10', 'T14 T16 D2'],
  72: ['T12 D18', 'T16 D12'],
  70: ['T18 D8', 'T14 D14'],
  68: ['T20 D4', 'T16 D10'],
  66: ['T10 D18', 'T14 D12'],
  64: ['T16 D8', 'T14 D10'],
  62: ['T10 D16', 'T12 D13'],
  60: ['20 D20', 'T10 D15'],
  58: ['18 D20', 'T10 D14'],
  56: ['16 D20', 'T10 D13'],
  54: ['14 D20', 'T10 D12'],
  52: ['12 D20', 'T10 D11'],
  50: ['10 D20', 'T10 D10'],
  48: ['8 D20', 'T12 D6'],
  46: ['6 D20', 'T10 D8'],
  44: ['4 D20', 'T12 D4'],
  42: ['10 D16', 'T10 D6'],
  40: ['D20', 'T10 D5'],
  38: ['D19'],
  36: ['D18'],
  34: ['D17'],
  32: ['D16'],
  30: ['D15'],
  28: ['D14'],
  26: ['D13'],
  24: ['D12'],
  22: ['D11'],
  20: ['D10'],
  18: ['D9'],
  16: ['D8'],
  14: ['D7'],
  12: ['D6'],
  10: ['D5'],
  8: ['D4'],
  6: ['D3'],
  4: ['D2'],
  2: ['D1'],
};

function findCheckouts(score: number): string[] | null {
  if (score < 2 || score > 170 || score % 2 !== 0) return null;
  const routes = CHECKOUT_ROUTES[score];
  if (!routes || routes.length === 0) return null;
  if (routes.length === 1) return routes;
  return routes.slice().sort((a, b) => routeDifficulty(a) - routeDifficulty(b));
}

function routeDifficulty(route: string): number {
  return route.split(/\s+/).reduce((sum, seg) => sum + segmentDifficulty(seg), 0);
}

function segmentDifficulty(seg: string): number {
  if (seg === 'DB') return 10;
  if (seg === 'SB') return 6;
  const num = parseInt(seg.slice(1), 10);
  if (seg.startsWith('T')) {
    if (num >= 19) return 1;
    if (num >= 17) return 2;
    if (num >= 15) return 3;
    return 5;
  }
  if (seg.startsWith('D')) {
    if (num >= 16) return 2;
    if (num >= 12) return 3;
    if (num >= 8) return 4;
    return 6;
  }
  return 4;
}

function suggestSegment(score: number): string {
  if (score > 170) return 'Aim T20 — reduce fast';
  if (score % 2 !== 0) {
    const target = score - 1;
    if (target >= 2 && target <= 20 && target % 2 === 0) {
      return `Hit S${target} → leaves D${target / 2}`;
    }
    return 'Odd — hit any single to make even';
  }
  const checkouts = findCheckouts(score);
  if (checkouts) return `Finish: ${checkouts[0]}`;
  if (score > 40) return 'Aim T20 — set up finish';
  return `Aim D${score / 2} to finish`;
}

function X01Advice({ state }: { state: X01GameState }) {
  const current = state.players[state.current_player];
  if (!current || current.is_bot) return null;

  const opp = state.players.find(p => p.id !== current.id);
  const score = current.score;

  let tip = '';
  let routes: string[] = [];
  let priority: 'high' | 'medium' | 'low' = 'medium';

  if (score <= 0) return null;

  const checkouts = findCheckouts(score);
  if (checkouts) {
    routes = checkouts;
    tip = 'Finish:';
    priority = 'high';
  } else if (score <= 70 && score % 2 !== 0) {
    const target = score - 1;
    const nextCheckouts = findCheckouts(target);
    if (target >= 2 && target <= 20) {
      tip = `Hit S${target} → leaves D${target / 2}`;
    } else if (nextCheckouts && nextCheckouts.length > 0) {
      tip = `Make ${target} even — then finish:`;
      routes = nextCheckouts;
    } else {
      tip = 'Odd score — hit any single to make even';
    }
    priority = 'medium';
  } else if (score <= 50) {
    tip = suggestSegment(score);
    priority = 'high';
  } else {
    tip = suggestSegment(score);
    priority = 'low';
  }

  const oppWarning = opp && opp.score <= 40 && opp.score > 0
    ? ` · Opponent on ${opp.score} — hurry!`
    : '';

  const color = priority === 'high' ? 'text-amber-400' : priority === 'medium' ? 'text-emerald-400' : 'text-slate-400';

  return (
    <div className="mt-2 rounded-lg bg-slate-800/80 border border-slate-700 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Strategy</div>
      <div className={`text-xs leading-relaxed ${color}`}>
        <PriorityIcon priority={priority} />{tip}
        {routes.length > 0 && (
          <span className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 ml-4.5">
            {routes.map((r, i) => (
              <span key={i}>{r}</span>
            ))}
          </span>
        )}
        {oppWarning && <span className="ml-1">{oppWarning}</span>}
      </div>
      <div className="text-[10px] text-slate-500 mt-1">
        {score} remaining{score % 2 !== 0 ? ' (odd)' : ''}
      </div>
    </div>
  );
}

export default function StrategyAdvisor({ state }: AdvisorProps) {
  if (state.is_over) return null;

  if (state.type === 'cricket') {
    return <CricketAdvice state={state as CricketGameState} />;
  }
  return <X01Advice state={state as X01GameState} />;
}
