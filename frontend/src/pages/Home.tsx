import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createMatch, listPlayers, createPlayer, listMatches, deleteMatch, listTournaments } from '../lib/api';
import { PERSONAS } from '../lib/types';
import type { Player, Persona } from '../lib/types';
import type { MatchSummary } from '../lib/api';

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function Home() {
  const navigate = useNavigate();
  const [gameType, setGameType] = useState<'x01' | 'cricket'>('x01');
  const [startScore, setStartScore] = useState(501);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [selectedPlayer2, setSelectedPlayer2] = useState<string>('');
  const [extraPlayers, setExtraPlayers] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [vsBot, setVsBot] = useState(true);
  const [persona, setPersona] = useState<Persona>('finisher');
  const [matchLength, setMatchLength] = useState<1 | 3 | 5 | 7>(1);
  const [firstThrower, setFirstThrower] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [tournaments, setTournaments] = useState<{ id: string; name: string; status: string; game_type: string; created_at: string }[]>([]);

  useEffect(() => {
    listPlayers().then(p => setPlayers(p || [])).catch(() => {});
    listMatches().then(m => setMatches(m || [])).catch(() => {});
    listTournaments().then(t => setTournaments(t || [])).catch(() => {});
  }, []);

  const activeMatches = matches.filter(m => m.status === 'active');
  const completedMatches = matches.filter(m => m.status === 'completed');

  const handleDeleteMatch = async (id: string) => {
    try {
      await deleteMatch(id);
      setMatches(prev => prev.filter(m => m.id !== id));
    } catch {}
  };

  const handleCreatePlayer = async () => {
    if (!newName.trim()) return;
    try {
      const p = await createPlayer(newName.trim());
      setPlayers(prev => [...prev, p]);
      setSelectedPlayer(p.id);
      setNewName('');
    } catch {}
  };

  const handleStartGame = async () => {
    if (!selectedPlayer && !newName.trim()) return;
    if (!vsBot && !selectedPlayer2) return;
    setLoading(true);
    try {
      let pid = selectedPlayer;
      if (!pid && newName.trim()) {
        const p = await createPlayer(newName.trim());
        pid = p.id;
      }

      const playerConfigs: { name: string; player_id?: string; is_bot: boolean; difficulty?: string }[] = [
        { name: players.find(p => p.id === pid)?.name || newName.trim(), player_id: pid, is_bot: false },
      ];

      if (vsBot) {
        const personaLabel = PERSONAS.find(p => p.id === persona)?.label ?? persona;
        playerConfigs.push({
          name: `Bot (${personaLabel})`,
          is_bot: true,
          difficulty: persona,
        });
      } else {
        const p2 = players.find(p => p.id === selectedPlayer2);
        if (p2) {
          playerConfigs.push({ name: p2.name, player_id: p2.id, is_bot: false });
        }
      }
      for (const epId of extraPlayers) {
        const ep = players.find(p => p.id === epId);
        if (ep) {
          playerConfigs.push({ name: ep.name, player_id: ep.id, is_bot: false });
        }
      }

      const res = await createMatch({
        type: gameType,
        starting_score: gameType === 'x01' ? startScore : undefined,
        players: playerConfigs,
        match_length: matchLength,
        first_thrower_index: firstThrower,
      });

      navigate(`/match/${res.match.id}`);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-5xl space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold text-emerald-400">Darts Practice</h1>
          <p className="text-slate-400 mt-2">Train your skills against the bot or locally</p>
          <button
            onClick={() => navigate('/tournaments/new')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm font-medium transition"
          >
            🏆 New Tournament
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: Game Setup */}
          <div className="bg-slate-800 rounded-xl p-6 space-y-6 lg:w-96 shrink-0">
          {/* Game Type */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Game Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['x01', 'cricket'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setGameType(t)}
                  className={`py-3 rounded-lg font-bold transition ${
                    gameType === t
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {t === 'x01' ? 'X01' : 'Cricket'}
                </button>
              ))}
            </div>
          </div>

          {/* Starting Score (X01 only) */}
          {gameType === 'x01' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Starting Score</label>
              <div className="grid grid-cols-4 gap-2">
                {[101, 201, 301, 501].map(s => (
                  <button
                    key={s}
                    onClick={() => setStartScore(s)}
                    className={`py-2 rounded-lg font-bold transition ${
                      startScore === s
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Player */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Your Name</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Enter your name"
                className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={handleCreatePlayer}
                disabled={!newName.trim()}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded-lg text-sm transition"
              >
                Save
              </button>
            </div>
            {players.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {players.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedPlayer(p.id); setNewName(p.name); }}
                    className={`px-3 py-1 rounded-full text-xs transition ${
                      selectedPlayer === p.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Opponent */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={vsBot}
                onChange={e => setVsBot(e.target.checked)}
                className="w-5 h-5 rounded bg-slate-700 border-slate-600 text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-sm font-medium text-slate-300">Play vs Bot</span>
            </label>

            {vsBot && (
              <div className="mt-3 space-y-2">
                <label className="block text-xs text-slate-500 uppercase tracking-wider">Bot Persona</label>
                <div className="grid grid-cols-2 gap-2">
                  {PERSONAS.slice().sort((a, b) => a.rank - b.rank).map(p => (
                    <button
                      key={p.id}
                      onClick={() => setPersona(p.id)}
                      className={`text-left px-3 py-2 rounded-lg text-sm font-bold transition ${
                        persona === p.id
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{p.label}</span>
                        <span className="flex gap-0.5">
                          {Array.from({ length: 5 }, (_, i) => (
                            <span
                              key={i}
                              className={`w-1.5 h-1.5 rounded-full ${
                                i < p.rank ? 'bg-current opacity-80' : 'bg-slate-500/40'
                              }`}
                            />
                          ))}
                        </span>
                      </div>
                      <div className={`text-[10px] font-normal ${persona === p.id ? 'text-emerald-100' : 'text-slate-400'}`}>
                        {p.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!vsBot && players.length > 0 && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-slate-300 mb-2">Opponent</label>
                <div className="flex flex-wrap gap-1">
                  {players.filter(p => p.id !== selectedPlayer).map(p => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPlayer2(p.id)}
                      className={`px-3 py-1 rounded-full text-xs transition ${
                        selectedPlayer2 === p.id
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Extra players for X01 */}
            {gameType === 'x01' && players.length > 2 && selectedPlayer && ((vsBot) || (!vsBot && selectedPlayer2)) && (
              (() => {
                const used = new Set([selectedPlayer, selectedPlayer2, ...extraPlayers]);
                const available = players.filter(p => !used.has(p.id));
                if (available.length === 0) return null;
                return (
                  <div className="mt-3">
                    <button
                      onClick={() => setExtraPlayers(prev => [...prev, available[0].id])}
                      className="px-3 py-1 rounded-full text-xs bg-slate-600 hover:bg-slate-500 text-slate-300 transition"
                    >
                      + Add Player
                    </button>
                  </div>
                );
              })()
            )}

            {extraPlayers.length > 0 && (
              <div className="mt-2 space-y-2">
                {extraPlayers.map((epId, idx) => {
                  const used = new Set([selectedPlayer, selectedPlayer2, ...extraPlayers.filter((_, i) => i !== idx)]);
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">P{idx + 3}</span>
                      <div className="flex flex-wrap gap-1">
                        {players.filter(p => !used.has(p.id)).map(p => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setExtraPlayers(prev => {
                                const next = [...prev];
                                next[idx] = p.id;
                                return next;
                              });
                            }}
                            className={`px-3 py-1 rounded-full text-xs transition ${
                              epId === p.id
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setExtraPlayers(prev => prev.filter((_, i) => i !== idx))}
                        className="text-red-400 hover:text-red-300 text-xs px-1"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

            {/* Match Length */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Match Length</label>
              <div className="grid grid-cols-4 gap-2">
                {([1, 3, 5, 7] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setMatchLength(n)}
                    className={`py-2 rounded-lg text-sm font-bold transition ${
                      matchLength === n
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {n === 1 ? 'Single' : `Best of ${n}`}
                  </button>
                ))}
              </div>
            </div>

            {/* First Thrower */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Throws First</label>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const names: string[] = [];
                  if (selectedPlayer || newName.trim()) names.push(players.find(p => p.id === selectedPlayer)?.name || newName.trim() || 'Player 1');
                  if (vsBot) names.push(`Bot (${PERSONAS.find(p => p.id === persona)?.label ?? persona})`);
                  else if (selectedPlayer2) names.push(players.find(p => p.id === selectedPlayer2)?.name || 'Player 2');
                  extraPlayers.forEach((epId, i) => {
                    names.push(players.find(p => p.id === epId)?.name || `P${i + 3}`);
                  });
                  return names.map((name, i) => (
                    <button
                      key={i}
                      onClick={() => setFirstThrower(i)}
                      className={`px-3 py-1 rounded-full text-xs transition ${
                        firstThrower === i
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {name}
                    </button>
                  ));
                })()}
              </div>
            </div>

            {/* Start */}
          <button
            onClick={handleStartGame}
            disabled={loading || (!selectedPlayer && !newName.trim()) || (!vsBot && !selectedPlayer2)}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg font-bold text-lg transition"
          >
            {loading ? 'Starting...' : 'Start Match'}
          </button>
        </div>

          {/* Right: Match Lists */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Active Matches */}
            {activeMatches.length > 0 && (
              <div className="bg-slate-800 rounded-xl p-6 space-y-3">
                <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider">Resume Match</h2>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {activeMatches.map(m => (
                    <div key={m.id} className="flex gap-2">
                      <button
                        onClick={() => navigate(`/match/${m.id}`)}
                        className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 rounded-lg text-left transition"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold text-emerald-400 uppercase text-sm">
                              {m.type === 'x01' && m.starting_score ? m.starting_score : m.type}
                            </span>
                            <span className="text-slate-400 mx-2">&middot;</span>
                            <span className="text-slate-200">{m.players.join(' vs ')}</span>
                            <span className="text-slate-500 mx-2">&middot;</span>
                            <span className="text-xs text-slate-400">Best of {m.total_games}</span>
                          </div>
                          <span className="text-slate-500 text-xs">{new Date(m.created_at).toLocaleDateString()}</span>
                        </div>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteMatch(m.id); }}
                        className="px-3 bg-red-900/50 hover:bg-red-800/70 rounded-lg text-red-400 text-sm transition shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Matches */}
            {completedMatches.length > 0 && (
              <div className="bg-slate-800 rounded-xl p-6 space-y-3">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Recent Matches</h2>
                <div className="max-h-80 overflow-y-auto space-y-2">
                  {completedMatches.map(m => (
                    <button
                      key={m.id}
                      onClick={() => navigate(`/match/${m.id}`)}
                      className="w-full py-2 px-4 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-left transition"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-emerald-400 uppercase text-xs">
                            {m.type === 'x01' && m.starting_score ? m.starting_score : m.type}
                          </span>
                          <span className="text-slate-500">&middot;</span>
                          <span className="text-slate-400 text-sm">{m.players.join(' vs ')}</span>
                          <span className="text-slate-500">&middot;</span>
                          <span className="text-xs text-slate-400">Best of {m.total_games}</span>
                        </div>
                        <span className="text-slate-500 text-xs">{timeAgo(m.created_at)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        {m.winner_name && m.winner_name !== 'Unknown' && (
                          <span className="text-emerald-400 text-xs font-bold">
                            {m.total_games > 1 && m.game_scores && m.player_ids
                              ? (() => {
                                  const scores = m.player_ids.map(id => m.game_scores![id] || 0);
                                  return `${m.winner_name} won ${scores[0]} - ${scores[1] ?? 0}`;
                                })()
                              : `${m.winner_name} won the match`
                            }
                          </span>
                        )}
                        {(!m.winner_name || m.winner_name === 'Unknown') && (
                          <span className="text-slate-500 text-xs">Match completed</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tournaments */}
            {tournaments.length > 0 && (
              <div className="bg-slate-800 rounded-xl p-6 space-y-3">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Tournaments</h2>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {tournaments.map(t => (
                    <button
                      key={t.id}
                      onClick={() => navigate(`/tournaments/${t.id}`)}
                      className="w-full py-2 px-4 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-left transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-slate-200 text-sm font-medium">{t.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                          t.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {t.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {t.game_type.toUpperCase()} · {timeAgo(t.created_at)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
