import { useState, useEffect, useRef } from 'react';
import type { AiThrowResult } from '../lib/types';

interface BotShowProps {
  throws: AiThrowResult[];
  gameType?: string;
  closedNumbers?: Set<number>;
  onDone: () => void;
}

const DART_DELAY_MS = 1500;

export default function BotShow({ throws, gameType, closedNumbers, onDone }: BotShowProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [hitSegments, setHitSegments] = useState<{ label: string; x: number; y: number }[]>([]);
  const [missCount, setMissCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (visibleCount >= throws.length) {
      const t = setTimeout(() => onDone(), 1200);
      return () => clearTimeout(t);
    }

    const throw_ = throws[visibleCount];
    const isMiss = throw_.segment === 'Miss';

    if (!isMiss) {
      const hitAngle = getAngleForSegment(throw_.segment);
      const hitRadius = getRadiusForSegment(throw_.segment);
      setHitSegments(prev => [...prev, {
        label: throw_.segment,
        x: 200 + 20 + hitRadius * Math.cos((hitAngle - 90) * Math.PI / 180),
        y: 200 + 20 + hitRadius * Math.sin((hitAngle - 90) * Math.PI / 180),
      }]);
    } else {
      setMissCount(prev => prev + 1);
    }

    timerRef.current = setTimeout(() => {
      setVisibleCount(prev => prev + 1);
    }, DART_DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visibleCount, throws, onDone]);

  if (throws.length === 0) return null;

  const totalScore = throws.reduce((s, t) => s + (t.points || 0), 0);

  const isCricketNumber = (seg: string) => {
    if (seg === 'SB' || seg === 'DB') return true;
    const clean = seg.replace(/^[TDS]/, '');
    const n = parseInt(clean);
    return n >= 15 && n <= 20;
  };

  const getCricketNumber = (seg: string): number | null => {
    if (seg === 'SB' || seg === 'DB') return 25;
    const clean = seg.replace(/^[TDS]/, '');
    const n = parseInt(clean);
    return (n >= 15 && n <= 20) ? n : null;
  };

  return (
    <div className="space-y-3">
      <div className="text-center">
        <div className="text-sm text-slate-400 animate-pulse">
          {visibleCount < throws.length
            ? `${throws[0].name} is throwing...`
            : 'Turn complete'}
        </div>
      </div>

      <div className="flex justify-center gap-3">
        {throws.map((t, i) => {
          const isRevealed = i < visibleCount;
          const isMiss = t.segment === 'Miss';
          const isScoring = t.points > 0;
          const cricketNum = getCricketNumber(t.segment);
          const isClosed = cricketNum !== null && closedNumbers?.has(cricketNum);
          const isMarking = gameType === 'cricket' && !isMiss && !isScoring && !isClosed && isCricketNumber(t.segment);

          const boxColor = isMiss
            ? 'bg-red-900/60 text-red-300 line-through'
            : isScoring
            ? 'bg-emerald-900/60 text-emerald-300 ring-1 ring-emerald-700'
            : isMarking
            ? 'bg-amber-900/60 text-amber-300 ring-1 ring-amber-700'
            : 'bg-slate-800/60 text-slate-600';

          const labelColor = isMiss
            ? 'text-red-400'
            : isScoring
            ? 'text-emerald-400'
            : isMarking
            ? 'text-amber-400'
            : 'text-slate-700';

          const labelText = isMiss
            ? 'Miss!'
            : isScoring
            ? `+${t.points}`
            : isMarking
            ? 'Marks'
            : '+0';

          return (
            <div
              key={i}
              className={`flex flex-col items-center gap-1 transition-all duration-300 ${
                isRevealed ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
              }`}
            >
              <span className="text-xs text-slate-500">Dart {i + 1}</span>

              <div className={`px-3 py-1.5 rounded-lg font-mono font-bold text-sm min-w-[50px] text-center ${boxColor}`}>
                {isMiss ? 'Miss' : t.segment}
              </div>

              {isRevealed && (
                <span className={`text-xs font-mono font-bold ${labelColor}`}>
                  {labelText}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {visibleCount >= throws.length && (
        <div className="text-center text-sm font-bold text-emerald-400 animate-fade-in">
          {gameType === 'cricket' ? (
            totalScore > 0 ? `Turn total: ${totalScore}` : 'No points scored'
          ) : (
            `Turn total: ${totalScore}`
          )}
          {missCount > 0 && (
            <span className="text-red-400 ml-2">({missCount} {missCount === 1 ? 'miss' : 'misses'})</span>
          )}
        </div>
      )}

      {hitSegments.length > 0 && (
        <svg viewBox="0 0 440 440" className="w-32 h-32 mx-auto opacity-50">
          <circle cx={220} cy={220} r={200} fill="none" stroke="#475569" strokeWidth="1" />
          <circle cx={220} cy={220} r={19} fill="none" stroke="#475569" strokeWidth="0.4" />
          <circle cx={220} cy={220} r={7} fill="none" stroke="#475569" strokeWidth="0.4" />
          <circle cx={220} cy={220} r={115} fill="none" stroke="#475569" strokeWidth="0.4" />
          <circle cx={220} cy={220} r={125} fill="none" stroke="#475569" strokeWidth="0.4" />
          <circle cx={220} cy={220} r={188} fill="none" stroke="#475569" strokeWidth="0.4" />
          {Array.from({ length: 20 }, (_, i) => {
            const angle = (i * 18 - 90) * Math.PI / 180;
            return (
              <line
                key={i}
                x1={220 + 19 * Math.cos(angle)}
                y1={220 + 19 * Math.sin(angle)}
                x2={220 + 200 * Math.cos(angle)}
                y2={220 + 200 * Math.sin(angle)}
                stroke="#475569"
                strokeWidth="0.4"
              />
            );
          })}
          {hitSegments.map((h, i) => (
            <circle
              key={i}
              cx={h.x}
              cy={h.y}
              r={6}
              fill="#ef4444"
              opacity={0.8}
              className="animate-ping"
              style={{ animationDuration: '1s', animationIterationCount: '1' }}
            />
          ))}
        </svg>
      )}
    </div>
  );
}

function getAngleForSegment(label: string): number {
  const boardOrder = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  const clean = label.replace(/^[TDS]/, '');
  const value = parseInt(clean) || 25;

  if (label === 'DB' || label === 'SB') return 0;

  const idx = boardOrder.indexOf(value);
  if (idx === -1) return 0;
  return idx * 18;
}

function getRadiusForSegment(label: string): number {
  if (label.startsWith('T')) return 120;
  if (label.startsWith('D')) return 194;
  if (label === 'DB') return 10;
  if (label === 'SB') return 16;
  return 70;
}
