import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Trophy } from 'lucide-react';
import { createTournament } from '../lib/api';
import { PERSONAS, type Persona, type GameType } from '../lib/types';

type TournamentType = 'single_elimination' | 'round_robin' | 'double_elimination';

const TOURNAMENT_TYPES: { id: TournamentType; label: string; description: string }[] = [
  { id: 'single_elimination', label: 'Single Elimination', description: 'Classic bracket - lose once and you are out' },
  { id: 'round_robin', label: 'Round Robin', description: 'Every player faces every other - standings decide the winner' },
  { id: 'double_elimination', label: 'Double Elimination', description: 'Winners + losers bracket - lose twice and you are out' },
];

interface Entrant {
  name: string;
  is_bot: boolean;
  difficulty: Persona;
}

export default function TournamentCreate() {
  const navigate = useNavigate();
  const [tournamentType, setTournamentType] = useState<TournamentType>('single_elimination');
  const [name, setName] = useState('Tournament');
  const [gameType, setGameType] = useState<GameType>('x01');
  const [startingScore, setStartingScore] = useState(501);
  const [matchLength, setMatchLength] = useState(1);
  const [entrants, setEntrants] = useState<Entrant[]>([
    { name: 'Player 1', is_bot: false, difficulty: 'steady' },
    { name: 'Bot A', is_bot: true, difficulty: 'steady' },
    { name: 'Bot B', is_bot: true, difficulty: 'finisher' },
    { name: 'Bot C', is_bot: true, difficulty: 'bully' },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateEntrant = (idx: number, patch: Partial<Entrant>) => {
    setEntrants((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };

  const addEntrant = () => {
    const n = entrants.length + 1;
    setEntrants((prev) => [...prev, { name: `Player ${n}`, is_bot: false, difficulty: 'steady' }]);
  };

  const removeEntrant = (idx: number) => {
    if (entrants.length <= 2) return;
    setEntrants((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = {
        name,
        type: tournamentType,
        game_type: gameType,
        starting_score: gameType === 'x01' ? startingScore : undefined,
        match_length: matchLength,
        players: entrants.map((e) => ({
          name: e.name,
          is_bot: e.is_bot,
          difficulty: e.is_bot ? e.difficulty : undefined,
        })),
      };
      const t = await createTournament(payload);
      navigate(`/tournaments/${t.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tournament');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-6">
        <Trophy className="text-emerald-400" size={28} />
        <h1 className="text-2xl font-bold">New Tournament</h1>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/50 text-red-100 rounded border border-red-700">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tournament Type */}
        <div>
          <label className="block text-sm text-slate-400 mb-2">Tournament Format</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TOURNAMENT_TYPES.map((tt) => (
              <button
                key={tt.id}
                type="button"
                onClick={() => setTournamentType(tt.id)}
                className={`text-left p-4 rounded-lg border transition ${
                  tournamentType === tt.id
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                }`}
              >
                <div className="font-bold text-sm">{tt.label}</div>
                <div className={`text-xs mt-1 ${tournamentType === tt.id ? 'text-emerald-100' : 'text-slate-400'}`}>
                  {tt.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Tournament name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded focus:outline-none focus:border-emerald-400"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Game type</label>
            <select
              value={gameType}
              onChange={(e) => setGameType(e.target.value as GameType)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded focus:outline-none focus:border-emerald-400"
            >
              <option value="x01">X01</option>
              <option value="cricket">Cricket</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Match length (best of)</label>
            <select
              value={matchLength}
              onChange={(e) => setMatchLength(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded focus:outline-none focus:border-emerald-400"
            >
              <option value={1}>1 leg</option>
              <option value={3}>3 legs</option>
              <option value={5}>5 legs</option>
              <option value={7}>7 legs</option>
            </select>
          </div>
        </div>

        {gameType === 'x01' && (
          <div>
            <label className="block text-sm text-slate-400 mb-1">Starting score</label>
            <select
              value={startingScore}
              onChange={(e) => setStartingScore(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded focus:outline-none focus:border-emerald-400"
            >
              <option value={301}>301</option>
              <option value={501}>501</option>
              <option value={701}>701</option>
            </select>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Entrants</h2>
            <button
              type="button"
              onClick={addEntrant}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition"
            >
              <Plus size={16} /> Add player
            </button>
          </div>

          <div className="space-y-2">
            {entrants.map((entrant, idx) => (
              <div key={idx} className="flex items-center gap-2 p-3 bg-slate-800 rounded border border-slate-700">
                <span className="text-slate-500 w-8">#{idx + 1}</span>
                <input
                  type="text"
                  value={entrant.name}
                  onChange={(e) => updateEntrant(idx, { name: e.target.value })}
                  className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded focus:outline-none focus:border-emerald-400"
                  required
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={entrant.is_bot}
                    onChange={(e) => updateEntrant(idx, { is_bot: e.target.checked })}
                    className="accent-emerald-400"
                  />
                  Bot
                </label>
                {entrant.is_bot && (
                  <select
                    value={entrant.difficulty}
                    onChange={(e) => updateEntrant(idx, { difficulty: e.target.value as Persona })}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded focus:outline-none focus:border-emerald-400"
                  >
                    {PERSONAS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => removeEntrant(idx)}
                  disabled={entrants.length <= 2}
                  className="p-2 text-red-400 hover:bg-red-900/30 rounded disabled:opacity-30 transition"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-900 font-bold rounded transition"
        >
          {loading ? 'Creating...' : 'Create tournament'}
        </button>
      </form>
    </div>
  );
}
