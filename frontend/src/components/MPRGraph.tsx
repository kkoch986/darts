import type { CricketGameState } from '../lib/types';
import { CRICKET_NUMBERS } from '../lib/types';

interface MPRGraphProps {
  state: CricketGameState;
}

const PLAYER_COLORS = ['#22d3ee', '#f472b6', '#a78bfa', '#fb923c'];
const PADDING = { top: 20, right: 16, bottom: 30, left: 40 };
const WIDTH = 600;
const HEIGHT = 180;
const CHART_W = WIDTH - PADDING.left - PADDING.right;
const CHART_H = HEIGHT - PADDING.top - PADDING.bottom;

function marksForThrow(segment: { type: number; value: number }): number {
  if (!CRICKET_NUMBERS.includes(segment.value as typeof CRICKET_NUMBERS[number])) return 0;
  if (segment.value === 25) {
    return segment.type === 4 ? 2 : 1;
  }
  switch (segment.type) {
    case 2: return 3;
    case 1: return 2;
    default: return 1;
  }
}

function computeMPRPerRound(history: { segment: { type: number; value: number }; round: number }[]): number[] {
  const maxRound = history.reduce((max, t) => Math.max(max, t.round), 0);
  if (maxRound === 0) return [];

  const cumulativeMarks = new Array(maxRound + 1).fill(0);
  for (const t of history) {
    cumulativeMarks[t.round] += marksForThrow(t.segment);
  }

  // Prefix sum
  for (let i = 1; i <= maxRound; i++) {
    cumulativeMarks[i] += cumulativeMarks[i - 1];
  }

  const mpr: number[] = [];
  for (let r = 1; r <= maxRound; r++) {
    mpr.push(cumulativeMarks[r] / r);
  }
  return mpr;
}

export default function MPRGraph({ state }: MPRGraphProps) {
  const playerData = state.players.map(p => ({
    name: p.name,
    isBot: p.is_bot,
    mpr: computeMPRPerRound(p.history || []),
  }));

  const maxRounds = Math.max(1, ...playerData.map(d => d.mpr.length));
  const maxMPR = Math.max(2, ...playerData.flatMap(d => d.mpr));

  const xScale = (round: number) => PADDING.left + (round / Math.max(1, maxRounds - 1)) * CHART_W;
  const yScale = (mpr: number) => PADDING.top + CHART_H - (mpr / maxMPR) * CHART_H;

  return (
    <div className="bg-slate-800/50 rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 text-center">MPR Over Time</div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full">
        {/* Grid lines */}
        {[0, 0.5, 1, 1.5, 2].filter(v => v <= maxMPR).map(v => (
          <g key={v}>
            <line x1={PADDING.left} y1={yScale(v)} x2={WIDTH - PADDING.right} y2={yScale(v)} stroke="#334155" strokeWidth="0.5" />
            <text x={PADDING.left - 4} y={yScale(v) + 3} textAnchor="end" fill="#64748b" fontSize="9">{v.toFixed(1)}</text>
          </g>
        ))}

        {/* X-axis labels */}
        {maxRounds <= 20 ? (
          Array.from({ length: maxRounds }, (_, i) => i + 1).map(r => (
            <text key={r} x={xScale(r)} y={HEIGHT - 6} textAnchor="middle" fill="#64748b" fontSize="9">{r}</text>
          ))
        ) : (
          [1, Math.ceil(maxRounds / 4), Math.ceil(maxRounds / 2), Math.ceil(maxRounds * 3 / 4), maxRounds].map(r => (
            <text key={r} x={xScale(r)} y={HEIGHT - 6} textAnchor="middle" fill="#64748b" fontSize="9">{r}</text>
          ))
        )}

        {/* Player lines */}
        {playerData.map((d, pi) => {
          if (d.mpr.length < 2) return null;
          const points = d.mpr.map((v, i) => `${xScale(i + 1)},${yScale(v)}`).join(' ');
          const color = PLAYER_COLORS[pi % PLAYER_COLORS.length];
          return (
            <g key={pi}>
              <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
              {/* End dot */}
              <circle cx={xScale(d.mpr.length)} cy={yScale(d.mpr[d.mpr.length - 1])} r="3" fill={color} />
            </g>
          );
        })}

        {/* Legend */}
        {playerData.map((d, pi) => {
          const color = PLAYER_COLORS[pi % PLAYER_COLORS.length];
          const x = PADDING.left + 8 + pi * 90;
          return (
            <g key={`leg-${pi}`} transform={`translate(${x}, 12)`}>
              <circle cx={0} cy={0} r={3} fill={color} />
              <text x={6} y={3} fill="#cbd5e1" fontSize="9">{d.name}{d.isBot ? ' 🤖' : ''}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
