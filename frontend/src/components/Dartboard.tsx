import { useState, useCallback } from 'react';
import { BOARD_ORDER } from '../lib/types';

interface DartboardProps {
  onSegmentClick?: (label: string) => void;
  heatmap?: Record<string, number>;
  showLabels?: boolean;
  size?: number;
  wireframe?: boolean;
}

// Regulation dartboard proportions, normalized to 200 radius
// Inner bull: 0-7, Outer bull: 7-19, Inner singles: 19-115,
// Triple: 115-125, Outer singles: 125-188, Double: 188-200
const BOARD_RADIUS = 200;
const INNER_BULL_R = 7;
const OUTER_BULL_R = 19;
const INNER_SINGLE_R = 115;
const TRIPLE_INNER_R = 115;
const TRIPLE_OUTER_R = 125;
const OUTER_SINGLE_R = 125;
const DOUBLE_INNER_R = 188;
const DOUBLE_OUTER_R = 200;

function polarToCart(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function sectorPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number
) {
  const a1 = polarToCart(cx, cy, outerR, startAngle);
  const a2 = polarToCart(cx, cy, outerR, endAngle);
  const b2 = polarToCart(cx, cy, innerR, endAngle);
  const b1 = polarToCart(cx, cy, innerR, startAngle);

  return [
    `M ${a1.x} ${a1.y}`,
    `A ${outerR} ${outerR} 0 0 1 ${a2.x} ${a2.y}`,
    `L ${b2.x} ${b2.y}`,
    `A ${innerR} ${innerR} 0 0 0 ${b1.x} ${b1.y}`,
    'Z',
  ].join(' ');
}

const SECTOR_ANGLE = 18;

function getHeatmapColor(count: number, max: number): string {
  if (count === 0) return 'transparent';
  const intensity = count / max;
  if (intensity > 0.75) return 'rgba(255, 0, 0, 0.6)';
  if (intensity > 0.5) return 'rgba(255, 165, 0, 0.5)';
  if (intensity > 0.25) return 'rgba(255, 255, 0, 0.4)';
  return 'rgba(0, 255, 0, 0.3)';
}

export default function Dartboard({ onSegmentClick, heatmap, showLabels = true, size = 400, wireframe = false }: DartboardProps) {
  const [flash, setFlash] = useState<{ x: number; y: number } | null>(null);
  const cx = BOARD_RADIUS + 20;
  const cy = BOARD_RADIUS + 20;
  const svgSize = (BOARD_RADIUS + 20) * 2;

  const maxHeat = heatmap
    ? Math.max(1, ...Object.values(heatmap))
    : 1;

  const handleClick = useCallback((label: string, x: number, y: number) => {
    setFlash({ x, y });
    setTimeout(() => setFlash(null), 300);
    onSegmentClick?.(label);
  }, [onSegmentClick]);

  const sectors = BOARD_ORDER.map((value, i) => {
    const startAngle = i * SECTOR_ANGLE - SECTOR_ANGLE / 2;
    const endAngle = startAngle + SECTOR_ANGLE;
    const midAngle = (startAngle + endAngle) / 2;
    const isEven = i % 2 === 0;
    return { value, startAngle, endAngle, midAngle, isEven };
  });

  return (
    <svg
      viewBox={`0 0 ${svgSize} ${svgSize}`}
      width={size}
      height={size}
      className="mx-auto select-none"
    >
      <defs>
        <filter id="board-shadow">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.5" />
        </filter>
      </defs>

      {/* Board background */}
      <circle cx={cx} cy={cy} r={BOARD_RADIUS + 10} fill={wireframe ? 'transparent' : '#2d2d2d'} stroke={wireframe ? '#475569' : 'none'} strokeWidth="1" filter={wireframe ? undefined : 'url(#board-shadow)'} />

      {/* Inner singles (big area from outer bull to triple) */}
      {sectors.map(({ value, startAngle, endAngle, isEven }) => (
        <path
          key={`is-${value}`}
          d={sectorPath(cx, cy, OUTER_BULL_R, INNER_SINGLE_R, startAngle, endAngle)}
          fill={wireframe ? 'transparent' : (isEven ? '#1a1a1a' : '#f5f5dc')}
          stroke={wireframe ? '#475569' : '#555'}
          strokeWidth="0.3"
        />
      ))}

      {/* Triple ring */}
      {sectors.map(({ value, startAngle, endAngle, isEven }) => (
        <path
          key={`t-${value}`}
          d={sectorPath(cx, cy, TRIPLE_INNER_R, TRIPLE_OUTER_R, startAngle, endAngle)}
          fill={wireframe ? 'transparent' : (isEven ? '#c41e3a' : '#006400')}
          stroke={wireframe ? '#475569' : '#555'}
          strokeWidth="0.3"
        />
      ))}

      {/* Outer singles (between triple and double) */}
      {sectors.map(({ value, startAngle, endAngle, isEven }) => (
        <path
          key={`os-${value}`}
          d={sectorPath(cx, cy, OUTER_SINGLE_R, DOUBLE_INNER_R, startAngle, endAngle)}
          fill={wireframe ? 'transparent' : (isEven ? '#1a1a1a' : '#f5f5dc')}
          stroke={wireframe ? '#475569' : '#555'}
          strokeWidth="0.3"
        />
      ))}

      {/* Double ring */}
      {sectors.map(({ value, startAngle, endAngle, isEven }) => (
        <path
          key={`d-${value}`}
          d={sectorPath(cx, cy, DOUBLE_INNER_R, DOUBLE_OUTER_R, startAngle, endAngle)}
          fill={wireframe ? 'transparent' : (isEven ? '#c41e3a' : '#006400')}
          stroke={wireframe ? '#475569' : '#555'}
          strokeWidth="0.3"
        />
      ))}

      {/* Outer bull */}
      <circle cx={cx} cy={cy} r={OUTER_BULL_R} fill={wireframe ? 'transparent' : '#006400'} stroke={wireframe ? '#475569' : '#555'} strokeWidth="0.5"
        className="pointer-events-none" />

      {/* Inner bull / bullseye */}
      <circle cx={cx} cy={cy} r={INNER_BULL_R} fill={wireframe ? 'transparent' : '#c41e3a'} stroke={wireframe ? '#475569' : '#555'} strokeWidth="0.5"
        className="pointer-events-none" />

      {/* Clickable bull targets (larger for easier tapping) */}
      <circle cx={cx} cy={cy} r={30} fill="transparent"
        onClick={() => handleClick('SB', cx, cy)} className="cursor-pointer" />
      <circle cx={cx} cy={cy} r={INNER_BULL_R} fill="transparent"
        onClick={() => handleClick('DB', cx, cy)} className="cursor-pointer" />

      {/* Clickable overlays for each segment */}
      {sectors.map(({ value, startAngle, endAngle }) => {
        const midAngle = (startAngle + endAngle) / 2;
        const clickR = (OUTER_BULL_R + DOUBLE_OUTER_R) / 2;
        const clickPos = polarToCart(cx, cy, clickR, midAngle);
        return (
          <g key={`click-${value}`}>
            {/* Inner single clickable */}
            <path
              d={sectorPath(cx, cy, 30, INNER_SINGLE_R, startAngle, endAngle)}
              fill="transparent"
              onClick={() => handleClick(`S${value}`, clickPos.x, clickPos.y)}
              className="cursor-pointer"
            />
            {/* Triple clickable */}
            <path
              d={sectorPath(cx, cy, TRIPLE_INNER_R, TRIPLE_OUTER_R, startAngle, endAngle)}
              fill="transparent"
              onClick={() => handleClick(`T${value}`, clickPos.x, clickPos.y)}
              className="cursor-pointer"
            />
            {/* Outer single clickable */}
            <path
              d={sectorPath(cx, cy, OUTER_SINGLE_R, DOUBLE_INNER_R, startAngle, endAngle)}
              fill="transparent"
              onClick={() => handleClick(`${value}`, clickPos.x, clickPos.y)}
              className="cursor-pointer"
            />
            {/* Double clickable */}
            <path
              d={sectorPath(cx, cy, DOUBLE_INNER_R, DOUBLE_OUTER_R, startAngle, endAngle)}
              fill="transparent"
              onClick={() => handleClick(`D${value}`, clickPos.x, clickPos.y)}
              className="cursor-pointer"
            />
          {/* Heatmap overlay */}
          {heatmap && (
            <>
              <path
                d={sectorPath(cx, cy, OUTER_BULL_R, INNER_SINGLE_R, startAngle, endAngle)}
                fill={getHeatmapColor(heatmap[`S${value}`] || 0, maxHeat)}
                className="pointer-events-none"
              />
              <path
                d={sectorPath(cx, cy, TRIPLE_INNER_R, TRIPLE_OUTER_R, startAngle, endAngle)}
                fill={getHeatmapColor(heatmap[`T${value}`] || 0, maxHeat)}
                className="pointer-events-none"
              />
              <path
                d={sectorPath(cx, cy, OUTER_SINGLE_R, DOUBLE_INNER_R, startAngle, endAngle)}
                fill={getHeatmapColor(heatmap[`${value}`] || 0, maxHeat)}
                className="pointer-events-none"
              />
              <path
                d={sectorPath(cx, cy, DOUBLE_INNER_R, DOUBLE_OUTER_R, startAngle, endAngle)}
                fill={getHeatmapColor(heatmap[`D${value}`] || 0, maxHeat)}
                className="pointer-events-none"
              />
            </>
          )}
        </g>
        );
      })}

      {/* Heatmap overlay for bull */}
      {heatmap && (
        <>
          <circle cx={cx} cy={cy} r={OUTER_BULL_R} fill={getHeatmapColor(heatmap['SB'] || 0, maxHeat)} className="pointer-events-none" />
          <circle cx={cx} cy={cy} r={INNER_BULL_R} fill={getHeatmapColor(heatmap['DB'] || 0, maxHeat)} className="pointer-events-none" />
        </>
      )}

      {/* Miss / UNK heatmap indicators */}
      {heatmap && (
        <>
          <g transform="translate(14, 16)">
            <rect x="0" y="0" width="78" height="26" rx="5"
              fill={getHeatmapColor(heatmap['Miss'] || 0, maxHeat)}
              stroke="#475569" strokeWidth="0.5"
              className="pointer-events-none" />
            <text x="39" y="13" textAnchor="middle" dominantBaseline="central"
              fill="#e2e8f0" fontSize="12" fontWeight="bold" className="pointer-events-none">
              Miss {heatmap['Miss'] || 0}
            </text>
          </g>
          <g transform={`translate(${svgSize - 92}, 16)`}>
            <rect x="0" y="0" width="78" height="26" rx="5"
              fill={getHeatmapColor(heatmap['UNK'] || 0, maxHeat)}
              stroke="#475569" strokeWidth="0.5"
              className="pointer-events-none" />
            <text x="39" y="13" textAnchor="middle" dominantBaseline="central"
              fill="#e2e8f0" fontSize="12" fontWeight="bold" className="pointer-events-none">
              UNK {heatmap['UNK'] || 0}
            </text>
          </g>
        </>
      )}

      {/* Number labels around outside */}
      {showLabels && sectors.map(({ value, midAngle }) => {
        const pos = polarToCart(cx, cy, BOARD_RADIUS + 14, midAngle);
        return (
          <text
            key={`label-${value}`}
            x={pos.x}
            y={pos.y}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#e2e8f0"
            fontSize="13"
            fontWeight="bold"
            className="pointer-events-none"
          >
            {value}
          </text>
        );
      })}

      {/* Click flash effect */}
      {flash && (
        <circle
          cx={flash.x}
          cy={flash.y}
          r={15}
          fill="white"
          opacity={0.8}
          className="pointer-events-none"
          style={{
            animation: 'flash 0.3s ease-out forwards',
          }}
        />
      )}
    </svg>
  );
}
