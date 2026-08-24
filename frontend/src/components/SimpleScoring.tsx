import { useState } from 'react';
import { BOARD_ORDER } from '../lib/types';

interface SimpleScoringProps {
  onSelect: (label: string) => void;
  gameType: 'x01' | 'cricket';
  cricketNumbers?: readonly number[];
}

const MULTIPLIERS = [
  { label: 'S', prefix: 'S', color: 'bg-slate-600 hover:bg-slate-500' },
  { label: 'D', prefix: 'D', color: 'bg-red-700 hover:bg-red-600' },
  { label: 'T', prefix: 'T', color: 'bg-green-700 hover:bg-green-600' },
];

export default function SimpleScoring({ onSelect, gameType, cricketNumbers }: SimpleScoringProps) {
  const [selectedMultiplier, setSelectedMultiplier] = useState(0);

  const allNumbers = [...BOARD_ORDER, 25] as number[];
  const numbers = gameType === 'cricket'
    ? allNumbers.filter(n => {
        const crickets = cricketNumbers || [20,19,18,17,16,15,25];
        return (crickets as number[]).includes(n);
      })
    : allNumbers;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 justify-center">
        {MULTIPLIERS.map((m, i) => (
          <button
            key={m.label}
            onClick={() => setSelectedMultiplier(i)}
            className={`px-4 py-2 rounded font-bold text-sm transition ${
              selectedMultiplier === i
                ? 'ring-2 ring-white ' + m.color
                : m.color
            }`}
          >
            {m.label}
          </button>
        ))}
        <button
          onClick={() => onSelect('SB')}
          className="px-4 py-2 rounded font-bold text-sm bg-green-700 hover:bg-green-600 transition"
        >
          SB
        </button>
        <button
          onClick={() => onSelect('DB')}
          className="px-4 py-2 rounded font-bold text-sm bg-red-700 hover:bg-red-600 transition"
        >
          DB
        </button>
        <button
          onClick={() => onSelect('MISS')}
          className="px-4 py-2 rounded font-bold text-sm bg-slate-600 hover:bg-slate-500 text-slate-300 transition"
        >
          MISS
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {numbers.filter(n => n !== 25).map(n => (
          <button
            key={n}
            onClick={() => {
              const prefix = MULTIPLIERS[selectedMultiplier].prefix;
              onSelect(prefix ? `${prefix}${n}` : `${n}`);
            }}
            className="aspect-square rounded font-bold text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 transition flex items-center justify-center"
          >
            {selectedMultiplier === 0 ? n : `${MULTIPLIERS[selectedMultiplier].prefix}${n}`}
          </button>
        ))}
      </div>
    </div>
  );
}
