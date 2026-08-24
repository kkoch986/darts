import { useState, useMemo } from 'react';
import Dartboard from '../components/Dartboard';
import { BOARD_ORDER } from '../lib/types';
import { startCheckoutPractice, checkoutPracticeThrow } from '../lib/api';

const TARGET_OPTIONS: { label: string; display: string }[] = [
  ...BOARD_ORDER.flatMap(n => [
    { label: `${n}`, display: `${n}` },
    { label: `S${n}`, display: `S${n}` },
    { label: `D${n}`, display: `D${n}` },
    { label: `T${n}`, display: `T${n}` },
  ]),
  { label: 'SB', display: 'SB' },
  { label: 'DB', display: 'DB' },
];

const DART_COUNTS = [10, 20, 30, 50];

// Common checkout scores to train; filtered to valid range at runtime
const CHECKOUT_SCORES = [170, 161, 144, 138, 136, 134, 132, 130, 128, 126, 124, 122, 120, 118, 116, 114, 112, 110, 108, 106, 104, 102, 100, 98, 96, 95, 94, 92, 90, 88, 86, 84, 82, 80, 78, 76, 75, 74, 72, 70, 68, 66, 64, 62, 60, 58, 56, 54, 52, 50, 48, 46, 44, 42, 40, 38, 36, 34, 32, 30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2];

interface ThrowResult {
  label: string;
  hit: boolean;
}

interface CheckoutSession {
  practiceId: string;
  startingScore: number;
  currentScore: number;
  dartsUsed: number;
  turnDarts: { label: string; score: number }[];
  result?: 'continue' | 'checkout' | 'bust';
}

export default function Practice() {
  const [mode, setMode] = useState<'target' | 'checkout'>('target');

  // Target mode state
  const [target, setTarget] = useState<string>('D20');
  const [dartCount, setDartCount] = useState<number>(20);
  const [targetStarted, setTargetStarted] = useState(false);
  const [throws, setThrows] = useState<ThrowResult[]>([]);
  const [targetFinished, setTargetFinished] = useState(false);

  // Checkout mode state
  const [checkoutScore, setCheckoutScore] = useState<number>(40);
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession | null>(null);
  const [checkoutHistory, setCheckoutHistory] = useState<{ startingScore: number; result: 'checkout' | 'bust' | 'incomplete' }[]>([]);

  const targetHits = throws.filter(t => t.hit).length;
  const targetMisses = throws.length - targetHits;
  const targetAccuracy = throws.length > 0 ? (targetHits / throws.length) * 100 : 0;

  const isHit = (label: string) => {
    if (label === target) return true;
    if (!target.startsWith('S') && !target.startsWith('D') && !target.startsWith('T') && target !== 'SB' && target !== 'DB') {
      if (label === `S${target}`) return true;
    }
    return false;
  };

  const handleTargetThrow = (label: string, forceMiss?: boolean) => {
    if (!targetStarted || targetFinished) return;
    const hit = forceMiss ? false : isHit(label);
    const next = [...throws, { label, hit }];
    setThrows(next);
    if (next.length >= dartCount) {
      setTargetFinished(true);
    }
  };

  const randomizeTarget = () => {
    setTarget(TARGET_OPTIONS[Math.floor(Math.random() * TARGET_OPTIONS.length)].label);
  };

  const randomizeCheckoutScore = () => {
    setCheckoutScore(CHECKOUT_SCORES[Math.floor(Math.random() * CHECKOUT_SCORES.length)]);
  };

  const resetTarget = () => {
    setThrows([]);
    setTargetFinished(false);
    setTargetStarted(false);
  };

  const startTarget = () => {
    setThrows([]);
    setTargetFinished(false);
    setTargetStarted(true);
  };

  const startCheckout = async () => {
    try {
      const res = await startCheckoutPractice(checkoutScore);
      setCheckoutSession({
        practiceId: res.practice_id,
        startingScore: res.starting_score,
        currentScore: res.state.players[0].score,
        dartsUsed: 0,
        turnDarts: [],
      });
    } catch {
      // ignore
    }
  };

  const handleCheckoutThrow = async (label: string) => {
    if (!checkoutSession) return;
    try {
      const res = await checkoutPracticeThrow(checkoutSession.practiceId, label);
      const p = res.state.players[0];
      setCheckoutSession({
        practiceId: res.practice_id,
        startingScore: res.starting_score,
        currentScore: p.score,
        dartsUsed: p.darts_used,
        turnDarts: p.turn_darts,
        result: res.result,
      });
      const result = res.result;
      if (result === 'checkout' || result === 'bust') {
        setCheckoutHistory(prev => [...prev, { startingScore: res.starting_score, result }]);
      }
    } catch {
      // ignore
    }
  };

  const resetCheckout = () => {
    setCheckoutSession(null);
  };

  const nextCheckout = async () => {
    const score = CHECKOUT_SCORES[Math.floor(Math.random() * CHECKOUT_SCORES.length)];
    setCheckoutScore(score);
    try {
      const res = await startCheckoutPractice(score);
      setCheckoutSession({
        practiceId: res.practice_id,
        startingScore: res.starting_score,
        currentScore: res.state.players[0].score,
        dartsUsed: 0,
        turnDarts: [],
      });
    } catch {
      // ignore
    }
  };

  const hitHistory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of throws) {
      map[t.label] = (map[t.label] || 0) + 1;
    }
    return map;
  }, [throws]);

  const checkoutSuccessCount = checkoutHistory.filter(h => h.result === 'checkout').length;
  const checkoutTotal = checkoutHistory.length;
  const checkoutRate = checkoutTotal > 0 ? (checkoutSuccessCount / checkoutTotal) * 100 : 0;

  return (
    <div className="min-h-screen p-4 max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-emerald-400">Practice</h1>

      <div className="flex gap-2">
        {(['target', 'checkout'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-2 rounded-lg font-bold transition ${
              mode === m
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {m === 'target' ? 'Target Practice' : 'Checkout Practice'}
          </button>
        ))}
      </div>

      {mode === 'target' && (
        <>
          {!targetStarted && (
            <div className="bg-slate-800 rounded-xl p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Target</label>
                <div className="flex gap-2">
                  <select
                    value={target}
                    onChange={e => setTarget(e.target.value)}
                    className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                  >
                    {TARGET_OPTIONS.map(o => (
                      <option key={o.label} value={o.label}>{o.display}</option>
                    ))}
                  </select>
                  <button
                    onClick={randomizeTarget}
                    className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg font-bold transition"
                  >
                    Random
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Pick the exact segment you want to train. Plain number (e.g. 20) counts inner or outer single.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Darts</label>
                <div className="grid grid-cols-4 gap-2">
                  {DART_COUNTS.map(n => (
                    <button
                      key={n}
                      onClick={() => setDartCount(n)}
                      className={`py-2 rounded-lg font-bold transition ${
                        dartCount === n
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={startTarget}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold text-lg transition"
              >
                Start Practice
              </button>
            </div>
          )}

          {targetStarted && (
            <div className="space-y-6">
              <div className="bg-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="text-center">
                  <div className="text-xs text-slate-400 uppercase">Target</div>
                  <div className="text-2xl font-bold text-emerald-400">{target}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400 uppercase">Progress</div>
                  <div className="text-2xl font-bold text-white">{throws.length} / {dartCount}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400 uppercase">Hits</div>
                  <div className="text-2xl font-bold text-emerald-400">{targetHits}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400 uppercase">Misses</div>
                  <div className="text-2xl font-bold text-red-400">{targetMisses}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400 uppercase">Accuracy</div>
                  <div className="text-2xl font-bold text-white">{targetAccuracy.toFixed(0)}%</div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-3">
                <Dartboard
                  onSegmentClick={!targetFinished ? handleTargetThrow : undefined}
                  heatmap={hitHistory}
                  size={Math.min(360, typeof window !== 'undefined' ? window.innerWidth - 48 : 360)}
                />
                {!targetFinished && (
                  <button
                    onClick={() => handleTargetThrow('miss', true)}
                    className="px-6 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-bold transition"
                  >
                    Miss
                  </button>
                )}
              </div>

              {targetFinished && (
                <div className="bg-slate-800 rounded-xl p-6 text-center space-y-3">
                  <div className="text-2xl font-bold text-emerald-400">Session Complete</div>
                  <div className="text-slate-300">
                    You hit <span className="font-bold text-white">{target}</span> {targetHits} out of {dartCount} times ({targetAccuracy.toFixed(1)}%)
                  </div>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={startTarget}
                      className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold transition"
                    >
                      Retry Same Target
                    </button>
                    <button
                      onClick={resetTarget}
                      className="px-6 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg font-bold transition"
                    >
                      Change Target
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {mode === 'checkout' && (
        <div className="space-y-6">
          {!checkoutSession && (
            <div className="bg-slate-800 rounded-xl p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Starting Checkout Score</label>
                <div className="flex gap-2">
                  <select
                    value={checkoutScore}
                    onChange={e => setCheckoutScore(Number(e.target.value))}
                    className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                  >
                    {CHECKOUT_SCORES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    onClick={randomizeCheckoutScore}
                    className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg font-bold transition"
                  >
                    Random
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Pick a score and try to check out in 3 darts or fewer. Must finish on a double or bullseye.
                </p>
              </div>

              <button
                onClick={startCheckout}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold text-lg transition"
              >
                Start Checkout
              </button>

              {checkoutTotal > 0 && (
                <div className="text-center">
                  <div className="text-sm text-slate-400">Session Rate</div>
                  <div className="text-3xl font-bold text-emerald-400">{checkoutRate.toFixed(0)}%</div>
                  <div className="text-xs text-slate-500">{checkoutSuccessCount} / {checkoutTotal} checkouts</div>
                </div>
              )}
            </div>
          )}

          {checkoutSession && (
            <>
              <div className="bg-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="text-center">
                  <div className="text-xs text-slate-400 uppercase">Start</div>
                  <div className="text-2xl font-bold text-slate-300">{checkoutSession.startingScore}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400 uppercase">Remaining</div>
                  <div className="text-4xl font-bold text-emerald-400">{checkoutSession.currentScore}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400 uppercase">Darts This Turn</div>
                  <div className="text-2xl font-bold text-white">{checkoutSession.dartsUsed}</div>
                </div>
              </div>

              {checkoutSession.result === 'checkout' && (
                <div className="bg-emerald-900/40 border border-emerald-700 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-emerald-400">Checkout!</div>
                  <div className="text-emerald-200/80 text-sm">You finished {checkoutSession.startingScore} in {checkoutSession.dartsUsed} darts.</div>
                </div>
              )}

              {checkoutSession.result === 'bust' && (
                <div className="bg-red-900/40 border border-red-700 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-red-400">Bust</div>
                  <div className="text-red-200/80 text-sm">You went below the required finish. Try again.</div>
                </div>
              )}

              {checkoutSession.result !== 'checkout' && checkoutSession.result !== 'bust' && (
                <div className="flex justify-center">
                  <Dartboard
                    onSegmentClick={handleCheckoutThrow}
                    size={Math.min(360, typeof window !== 'undefined' ? window.innerWidth - 48 : 360)}
                  />
                </div>
              )}

              {(checkoutSession.result === 'checkout' || checkoutSession.result === 'bust') && (
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={nextCheckout}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold transition"
                  >
                    Next Checkout
                  </button>
                  <button
                    onClick={resetCheckout}
                    className="px-6 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg font-bold transition"
                  >
                    Choose Score
                  </button>
                </div>
              )}

              {checkoutSession.turnDarts.length > 0 && (
                <div className="bg-slate-800 rounded-xl p-4">
                  <div className="text-sm text-slate-400 mb-2">This turn</div>
                  <div className="flex gap-2">
                    {checkoutSession.turnDarts.map((d, i) => (
                      <span key={i} className="px-2 py-1 rounded bg-slate-700 font-mono text-sm">{d.label} ({d.score})</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
