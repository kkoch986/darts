import type { GameState, Segment, ThrowRecord } from '../lib/types';

interface PlayerHeatmapProps {
  state: GameState;
  playerIndex: number;
  lastDarts?: ThrowRecord[];
}

const BOARD_R = 120;
const CX = BOARD_R + 12;
const CY = BOARD_R + 12;
const SVG_SIZE = (BOARD_R + 12) * 2;
const OUTER_BULL_R = 11;
const INNER_SINGLE_R = 69;
const TRIPLE_INNER_R = 69;
const TRIPLE_OUTER_R = 75;
const OUTER_SINGLE_R = 75;
const DOUBLE_INNER_R = 113;
const DOUBLE_OUTER_R = 120;
const SECTOR_ANGLE = 18;

const boardOrder = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

function polar(r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function sectorPath(iR: number, oR: number, sA: number, eA: number) {
  const a1 = polar(oR, sA);
  const a2 = polar(oR, eA);
  const b2 = polar(iR, eA);
  const b1 = polar(iR, sA);
  return `M ${a1.x} ${a1.y} A ${oR} ${oR} 0 0 1 ${a2.x} ${a2.y} L ${b2.x} ${b2.y} A ${iR} ${iR} 0 0 0 ${b1.x} ${b1.y} Z`;
}

function heatColor(intensity: number): string {
  if (intensity <= 0) return 'transparent';
  if (intensity > 0.75) return 'rgba(239, 68, 68, 0.7)';
  if (intensity > 0.5) return 'rgba(249, 115, 22, 0.6)';
  if (intensity > 0.25) return 'rgba(234, 179, 8, 0.5)';
  return 'rgba(34, 197, 94, 0.4)';
}

function dotPosition(segment: Segment): { x: number; y: number } | null {
  const value = segment.value;
  if (segment.type === 4) return polar(6, 0);
  if (segment.type === 3) return polar(OUTER_BULL_R - 2, 0);

  const boardIdx = boardOrder.indexOf(value);
  if (boardIdx === -1) return null;
  const midAngle = boardIdx * SECTOR_ANGLE;

  if (segment.type === 2) return polar((TRIPLE_INNER_R + TRIPLE_OUTER_R) / 2, midAngle);
  if (segment.type === 1) return polar((DOUBLE_INNER_R + DOUBLE_OUTER_R) / 2, midAngle);
  if (segment.type === 0) {
    return polar((OUTER_BULL_R + INNER_SINGLE_R) / 2, midAngle);
  }
  return polar((OUTER_SINGLE_R + DOUBLE_INNER_R) / 2, midAngle);
}

export default function PlayerHeatmap({ state, playerIndex, lastDarts }: PlayerHeatmapProps) {
  const player = state.players[playerIndex];
  if (!player) return null;

  const allDarts = [...(player.history || []), ...(player.turn_darts || [])];
  const segmentHits: Record<string, number> = {};
  for (const d of allDarts) {
    let label = d.label;
    if (d.segment.type === 0 && d.segment.value > 0 && d.segment.value !== 25 && d.segment.raw_label) {
      label = d.segment.raw_label;
    }
    segmentHits[label] = (segmentHits[label] || 0) + 1;
  }
  const maxHits = Math.max(1, ...Object.values(segmentHits));

  const heatMap: Record<string, number> = {};
  for (const [label, count] of Object.entries(segmentHits)) {
    heatMap[label] = count / maxHits;
  }

  const sectors = boardOrder.map((value, i) => {
    const sA = i * SECTOR_ANGLE - SECTOR_ANGLE / 2;
    const eA = sA + SECTOR_ANGLE;
    return { value, sA, eA };
  });

  const topHits = Object.entries(segmentHits)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const darts = lastDarts || [];

  return (
    <div className="bg-slate-800/50 rounded-xl p-3 flex flex-col items-center gap-2">
      <div className="text-xs font-bold text-slate-300 truncate w-full text-center">
        {player.name}
        {player.is_bot && <span className="text-slate-500"> (bot)</span>}
      </div>

      <svg viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} width={BOARD_R * 2 + 24} height={BOARD_R * 2 + 24}>
        <circle cx={CX} cy={CY} r={BOARD_R + 6} fill="transparent" stroke="#475569" strokeWidth="1" />

        {/* Wireframe sectors */}
        {sectors.map(({ value, sA, eA }) => (
          <g key={value}>
            <path d={sectorPath(OUTER_BULL_R, INNER_SINGLE_R, sA, eA)} fill="transparent" stroke="#475569" strokeWidth="0.3" />
            <path d={sectorPath(TRIPLE_INNER_R, TRIPLE_OUTER_R, sA, eA)} fill="transparent" stroke="#475569" strokeWidth="0.3" />
            <path d={sectorPath(OUTER_SINGLE_R, DOUBLE_INNER_R, sA, eA)} fill="transparent" stroke="#475569" strokeWidth="0.3" />
            <path d={sectorPath(DOUBLE_INNER_R, DOUBLE_OUTER_R, sA, eA)} fill="transparent" stroke="#475569" strokeWidth="0.3" />
          </g>
        ))}

        <circle cx={CX} cy={CY} r={OUTER_BULL_R} fill="transparent" stroke="#475569" strokeWidth="0.3" />
        <circle cx={CX} cy={CY} r={6} fill="transparent" stroke="#475569" strokeWidth="0.3" />

        {/* Heatmap overlays - inner singles */}
        {sectors.map(({ value, sA, eA }) => (
          <path key={`h-is-${value}`} d={sectorPath(OUTER_BULL_R, INNER_SINGLE_R, sA, eA)} fill={heatColor(heatMap[`S${value}`] || 0)} className="pointer-events-none" />
        ))}

        {/* Heatmap overlays - triples */}
        {sectors.map(({ value, sA, eA }) => (
          <path key={`h-t-${value}`} d={sectorPath(TRIPLE_INNER_R, TRIPLE_OUTER_R, sA, eA)} fill={heatColor(heatMap[`T${value}`] || 0)} className="pointer-events-none" />
        ))}

        {/* Heatmap overlays - outer singles */}
        {sectors.map(({ value, sA, eA }) => (
          <path key={`h-os-${value}`} d={sectorPath(OUTER_SINGLE_R, DOUBLE_INNER_R, sA, eA)} fill={heatColor(heatMap[`${value}`] || 0)} className="pointer-events-none" />
        ))}

        {/* Heatmap overlays - doubles */}
        {sectors.map(({ value, sA, eA }) => (
          <path key={`h-d-${value}`} d={sectorPath(DOUBLE_INNER_R, DOUBLE_OUTER_R, sA, eA)} fill={heatColor(heatMap[`D${value}`] || 0)} className="pointer-events-none" />
        ))}

        {/* Heatmap overlays - bull */}
        <circle cx={CX} cy={CY} r={OUTER_BULL_R} fill={heatColor(heatMap['SB'] || 0)} className="pointer-events-none" />
        <circle cx={CX} cy={CY} r={6} fill={heatColor(heatMap['DB'] || 0)} className="pointer-events-none" />

        {/* Miss / UNK indicators */}
        <>
          <g transform="translate(8, 10)">
            <rect x="0" y="0" width="54" height="18" rx="4"
              fill={heatColor(heatMap['Miss'] || 0)}
              stroke="#475569" strokeWidth="0.4"
              className="pointer-events-none" />
            <text x="27" y="9" textAnchor="middle" dominantBaseline="central"
              fill="#e2e8f0" fontSize="9" fontWeight="bold" className="pointer-events-none">
              Miss {segmentHits['Miss'] || 0}
            </text>
          </g>
          <g transform={`translate(${SVG_SIZE - 62}, 10)`}>
            <rect x="0" y="0" width="54" height="18" rx="4"
              fill={heatColor(heatMap['UNK'] || 0)}
              stroke="#475569" strokeWidth="0.4"
              className="pointer-events-none" />
            <text x="27" y="9" textAnchor="middle" dominantBaseline="central"
              fill="#e2e8f0" fontSize="9" fontWeight="bold" className="pointer-events-none">
              UNK {segmentHits['UNK'] || 0}
            </text>
          </g>
        </>

        {/* Last throw markers */}
        {darts.map((d, i) => {
          const pos = dotPosition(d.segment);
          if (!pos) return null;
          return (
            <g key={`dart-${i}`}>
              <circle cx={pos.x} cy={pos.y} r={7} fill="rgba(250, 204, 21, 0.3)" className="pointer-events-none" />
              <circle cx={pos.x} cy={pos.y} r={4} fill="#facc15" stroke="#fff" strokeWidth="1" className="pointer-events-none" />
            </g>
          );
        })}
      </svg>

      <div className="text-xs text-slate-400 w-full">
        {topHits.length > 0 ? (
          <div className="flex flex-wrap gap-1 justify-center">
            {topHits.map(([label, count]) => (
              <span key={label} className="bg-slate-700 px-1.5 py-0.5 rounded font-mono text-[10px]">
                {label} <span className="text-slate-500">x{count}</span>
              </span>
            ))}
          </div>
        ) : (
          <div className="text-center text-slate-600">No throws yet</div>
        )}
      </div>
    </div>
  );
}
