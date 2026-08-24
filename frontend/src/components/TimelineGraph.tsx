interface TimelineEntry {
  game_id: string;
  date: string;
  won: boolean;
  rounds: number;
  throws: number;
  opponent: string;
}

interface TimelineGraphProps {
  entries: TimelineEntry[];
}

const PADDING = { top: 20, right: 40, bottom: 30, left: 40 };
const WIDTH = 600;
const HEIGHT = 200;
const CHART_W = WIDTH - PADDING.left - PADDING.right;
const CHART_H = HEIGHT - PADDING.top - PADDING.bottom;

export default function TimelineGraph({ entries }: TimelineGraphProps) {
  if (entries.length < 2) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-3 text-center text-slate-500 text-xs">
        Not enough games for a timeline
      </div>
    );
  }

  const points = entries.map((e, i) => {
    const winsSoFar = entries.slice(0, i + 1).filter(x => x.won).length;
    const winPct = (winsSoFar / (i + 1)) * 100;
    return {
      index: i,
      rounds: e.rounds,
      throws: e.throws,
      winPct,
    };
  });

  const maxRounds = Math.max(1, ...points.map(p => p.rounds));
  const maxThrows = Math.max(1, ...points.map(p => p.throws));
  const maxY = Math.max(maxRounds, maxThrows, 10);

  const xScale = (i: number) => PADDING.left + (i / Math.max(1, points.length - 1)) * CHART_W;
  const yScaleRounds = (v: number) => PADDING.top + CHART_H - (v / maxY) * CHART_H;
  const yScaleWin = (v: number) => PADDING.top + CHART_H - (v / 100) * CHART_H;

  const line = (key: 'rounds' | 'throws' | 'winPct', color: string, yScale: (v: number) => number) => {
    const pts = points.map((p, i) => `${xScale(i)},${yScale(p[key])}`).join(' ');
    return (
      <g key={key}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={xScale(points.length - 1)} cy={yScale(points[points.length - 1][key])} r="3" fill={color} />
      </g>
    );
  };

  return (
    <div className="bg-slate-800/50 rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 text-center">Performance Over Time</div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full">
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(v => (
          <g key={`win-${v}`}>
            <line x1={PADDING.left} y1={yScaleWin(v)} x2={WIDTH - PADDING.right} y2={yScaleWin(v)} stroke="#334155" strokeWidth="0.5" />
            <text x={WIDTH - PADDING.right + 4} y={yScaleWin(v) + 3} textAnchor="start" fill="#64748b" fontSize="9">{v}%</text>
          </g>
        ))}
        {[0, Math.ceil(maxY / 2), maxY].map(v => (
          <g key={`y-${v}`}>
            <line x1={PADDING.left} y1={yScaleRounds(v)} x2={WIDTH - PADDING.right} y2={yScaleRounds(v)} stroke="#334155" strokeWidth="0.5" strokeDasharray="2,2" />
            <text x={PADDING.left - 4} y={yScaleRounds(v) + 3} textAnchor="end" fill="#64748b" fontSize="9">{v}</text>
          </g>
        ))}

        {/* X-axis labels */}
        {points.length <= 12 ? (
          points.map((_, i) => (
            <text key={i} x={xScale(i)} y={HEIGHT - 6} textAnchor="middle" fill="#64748b" fontSize="9">{i + 1}</text>
          ))
        ) : (
          [0, Math.floor(points.length / 4), Math.floor(points.length / 2), Math.floor(points.length * 3 / 4), points.length - 1].map(i => (
            <text key={i} x={xScale(i)} y={HEIGHT - 6} textAnchor="middle" fill="#64748b" fontSize="9">{i + 1}</text>
          ))
        )}

        {line('rounds', '#22d3ee', yScaleRounds)}
        {line('throws', '#f472b6', yScaleRounds)}
        {line('winPct', '#34d399', yScaleWin)}

        {/* Legend */}
        <g transform={`translate(${PADDING.left}, 12)`}>
          <circle cx={0} cy={0} r={3} fill="#22d3ee" />
          <text x={6} y={3} fill="#cbd5e1" fontSize="9">Rounds</text>
        </g>
        <g transform={`translate(${PADDING.left + 70}, 12)`}>
          <circle cx={0} cy={0} r={3} fill="#f472b6" />
          <text x={6} y={3} fill="#cbd5e1" fontSize="9">Darts</text>
        </g>
        <g transform={`translate(${PADDING.left + 135}, 12)`}>
          <circle cx={0} cy={0} r={3} fill="#34d399" />
          <text x={6} y={3} fill="#cbd5e1" fontSize="9">Win %</text>
        </g>
      </svg>
    </div>
  );
}
