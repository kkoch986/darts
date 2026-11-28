import type { AdvicePriority, GameState, X01GameState, CricketGameState } from '../lib/types';
import { CRICKET_NUMBERS } from '../lib/types';

interface AdvisorProps {
  state: GameState;
}

function PriorityIcon({ priority }: { priority: AdvicePriority }) {
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

function adviceColor(priority: AdvicePriority): string {
  return priority === 'high' ? 'text-amber-400' : priority === 'medium' ? 'text-emerald-400' : 'text-slate-400';
}

function CricketAdvice({ state }: { state: CricketGameState }) {
  const advice = state.advice;
  // The engine omits advice for bot turns and finished games.
  if (!advice) return null;

  const current = state.players[state.current_player];
  if (!current) return null;

  const opp = state.players.find(p => p.id !== current.id);
  if (!opp) return null;

  const myMarks = current.marks || {};
  const oppMarks = opp.marks || {};

  const myClosedCount = CRICKET_NUMBERS.length - CRICKET_NUMBERS.filter(n => (myMarks[n] || 0) < 3).length;
  const oppClosedCount = CRICKET_NUMBERS.length - CRICKET_NUMBERS.filter(n => (oppMarks[n] || 0) < 3).length;

  // Score differential
  const scoreDiff = current.score - opp.score;
  const imWinning = scoreDiff > 0;

  const priority = advice.priority;
  const color = adviceColor(priority);

  return (
    <div className="mt-2 rounded-lg bg-slate-800/80 border border-slate-700 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Strategy</div>
      <div className={`text-xs leading-relaxed ${color}`}>
        <PriorityIcon priority={priority} />{advice.tip}
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

function X01Advice({ state }: { state: X01GameState }) {
  const advice = state.advice;
  // The engine omits advice for bot turns and finished games.
  if (!advice) return null;

  const current = state.players[state.current_player];
  if (!current) return null;

  const score = current.score;
  const routes = advice.routes || [];

  const priority = advice.priority;
  const color = adviceColor(priority);

  return (
    <div className="mt-2 rounded-lg bg-slate-800/80 border border-slate-700 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Strategy</div>
      <div className={`text-xs leading-relaxed ${color}`}>
        <PriorityIcon priority={priority} />{advice.tip}
        {routes.length > 0 && (
          <span className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 ml-4.5">
            {routes.map((r, i) => (
              <span key={i}>{r.darts.join(' ')}</span>
            ))}
          </span>
        )}
        {advice.opp_warning && <span className="ml-1">{advice.opp_warning}</span>}
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
