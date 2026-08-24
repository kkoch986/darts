import { useState, useEffect } from 'react';
import { listPlayers, getPlayerStats, getPlayerHeatmap, getPlayerLifetimeMPR, deletePlayer, resetPlayerStats, getPlayerWinsMatrix, getPlayerTimeline, type WinMatrixEntry, type TimelineEntry } from '../lib/api';
import type { Player, LifetimeStats } from '../lib/types';
import Dartboard from '../components/Dartboard';
import TimelineGraph from '../components/TimelineGraph';

export default function Stats() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [stats, setStats] = useState<LifetimeStats | null>(null);
  const [heatmap, setHeatmap] = useState<Record<string, number>>({});
  const [lifetimeMPR, setLifetimeMPR] = useState<number | null>(null);
  const [winMatrix, setWinMatrix] = useState<WinMatrixEntry[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [allGameTypes, setAllGameTypes] = useState<string[]>([]);
  const [gameTypeFilter, setGameTypeFilter] = useState<string>('all');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    listPlayers().then(p => setPlayers(p || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setConfirmDelete(false);
    setConfirmReset(false);
    setGameTypeFilter('all');
    getPlayerWinsMatrix(selectedId).then(m => {
      const data = m || [];
      setAllGameTypes([...new Set(data.map(e => e.game_type))]);
    }).catch(() => {});
    getPlayerTimeline(selectedId).then(t => setTimeline(t || [])).catch(() => {});
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const type = gameTypeFilter === 'all' ? undefined : gameTypeFilter;
    setStats(null);
    getPlayerStats(selectedId, type).then(setStats).catch(() => {});
    getPlayerHeatmap(selectedId, type).then(r => setHeatmap(r.heatmap || {})).catch(() => {});
    getPlayerLifetimeMPR(selectedId, type).then(r => setLifetimeMPR(r.mpr)).catch(() => {});
    getPlayerWinsMatrix(selectedId, type).then(m => setWinMatrix(m || [])).catch(() => {});
    getPlayerTimeline(selectedId, type).then(t => setTimeline(t || [])).catch(() => {});
  }, [selectedId, gameTypeFilter]);

  const maxHits = Math.max(1, ...Object.values(heatmap));

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    await deletePlayer(selectedId);
    setPlayers(prev => prev.filter(p => p.id !== selectedId));
    setSelectedId('');
    setStats(null);
    setConfirmDelete(false);
  };

  const handleReset = async () => {
    if (!confirmReset) { setConfirmReset(true); return; }
    await resetPlayerStats(selectedId);
    setConfirmReset(false);
    const type = gameTypeFilter === 'all' ? undefined : gameTypeFilter;
    getPlayerStats(selectedId, type).then(setStats).catch(() => {});
    getPlayerHeatmap(selectedId, type).then(r => setHeatmap(r.heatmap || {})).catch(() => {});
    getPlayerLifetimeMPR(selectedId, type).then(r => setLifetimeMPR(r.mpr)).catch(() => {});
    getPlayerWinsMatrix(selectedId, type).then(m => setWinMatrix(m || [])).catch(() => {});
  };

  const aggregatedMatrix = winMatrix.reduce((acc, entry) => {
    const existing = acc.find(a => a.opponent === entry.opponent);
    if (existing) {
      existing.wins += entry.wins;
      existing.losses += entry.losses;
      existing.total_games += entry.total_games;
      existing.total_throws += entry.total_throws;
      existing.total_rounds += entry.total_rounds;
    } else {
      acc.push({ ...entry });
    }
    return acc;
  }, [] as WinMatrixEntry[]);

  const gameTypes = ['all', ...allGameTypes];

  return (
    <div className="min-h-screen p-4 max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-emerald-400">Statistics</h1>

      <div className="flex gap-2 flex-wrap">
        {players.map(p => (
          <button
            key={p.id}
            onClick={() => setSelectedId(p.id)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              selectedId === p.id
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-sm text-slate-400 uppercase tracking-wide">Game Type</span>
        {gameTypes.map(gt => (
          <button
            key={gt}
            onClick={() => setGameTypeFilter(gt)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
              gameTypeFilter === gt
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {gt === 'all' ? 'All' : gt.toUpperCase()}
          </button>
        ))}
      </div>

      {selectedId && stats && (
        <>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={handleReset}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                confirmReset
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {confirmReset ? 'Click again to confirm reset' : 'Reset Stats'}
            </button>
            <button
              onClick={handleDelete}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                confirmDelete
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {confirmDelete ? 'Click again to confirm delete' : 'Delete Player'}
            </button>
            {(confirmDelete || confirmReset) && (
              <button
                onClick={() => { setConfirmDelete(false); setConfirmReset(false); }}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-800 rounded-xl p-6 space-y-4">
              <h2 className="text-xl font-bold">Summary</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-700 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-400">{stats.games_played}</div>
                  <div className="text-xs text-slate-400">Games Played</div>
                </div>
                <div className="bg-slate-700 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-400">{stats.games_won}</div>
                  <div className="text-xs text-slate-400">Wins</div>
                </div>
                <div className="bg-slate-700 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-400">{stats.total_throws}</div>
                  <div className="text-xs text-slate-400">Total Throws</div>
                </div>
                <div className="bg-slate-700 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-400">
                    {stats.games_played > 0 ? ((stats.games_won / stats.games_played) * 100).toFixed(0) : 0}%
                  </div>
                  <div className="text-xs text-slate-400">Win Rate</div>
                </div>
                <div className="bg-slate-700 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-400">{stats.avg_rounds_per_game.toFixed(1)}</div>
                  <div className="text-xs text-slate-400">Avg Rounds/Game</div>
                </div>
                <div className="bg-slate-700 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-400">{stats.avg_darts_per_game.toFixed(1)}</div>
                  <div className="text-xs text-slate-400">Avg Darts/Game</div>
                </div>
                {lifetimeMPR !== null && lifetimeMPR > 0 && (
                  <div className="bg-slate-700 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-emerald-400">{lifetimeMPR.toFixed(2)}</div>
                    <div className="text-xs text-slate-400">Lifetime MPR</div>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-300 mb-2">Most Hit Segments</h3>
                <div className="space-y-1">
                  {Object.entries(stats.segment_hits)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 8)
                    .map(([label, count]) => (
                      <div key={label} className="flex items-center gap-2 text-sm">
                        <span className="font-mono w-8 text-right">{label}</span>
                        <div className="flex-1 bg-slate-700 rounded-full h-2">
                          <div
                            className="bg-emerald-500 h-2 rounded-full"
                            style={{ width: `${(count / maxHits) * 100}%` }}
                          />
                        </div>
                        <span className="text-slate-400 w-8 text-right">{count}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="bg-slate-800 rounded-xl p-6 md:col-span-2">
              <h2 className="text-xl font-bold mb-4">Wins by Opponent</h2>
              {aggregatedMatrix.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-700">
                        <th className="text-left py-2 px-3">Opponent</th>
                        <th className="text-right py-2 px-3">Games</th>
                        <th className="text-right py-2 px-3">Wins</th>
                        <th className="text-right py-2 px-3">Losses</th>
                        <th className="text-right py-2 px-3">Win Rate</th>
                        <th className="text-right py-2 px-3">Avg Rounds</th>
                        <th className="text-right py-2 px-3">Avg Darts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aggregatedMatrix.map(e => (
                        <tr key={e.opponent} className="border-b border-slate-700/50">
                          <td className="py-2 px-3 font-medium text-slate-200">{e.opponent}</td>
                          <td className="py-2 px-3 text-right text-slate-300">{e.total_games}</td>
                          <td className="py-2 px-3 text-right text-emerald-400 font-mono">{e.wins}</td>
                          <td className="py-2 px-3 text-right text-red-400 font-mono">{e.losses}</td>
                          <td className="py-2 px-3 text-right">
                            <span className={`font-mono font-bold ${
                              e.total_games > 0 && (e.wins / e.total_games) >= 0.6 ? 'text-emerald-400' :
                              e.total_games > 0 && (e.wins / e.total_games) >= 0.4 ? 'text-yellow-400' :
                              'text-red-400'
                            }`}>
                              {e.total_games > 0 ? ((e.wins / e.total_games) * 100).toFixed(0) : 0}%
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-slate-300 font-mono">
                            {e.total_games > 0 ? (e.total_rounds / e.total_games).toFixed(1) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-300 font-mono">
                            {e.total_games > 0 ? (e.total_throws / e.total_games).toFixed(1) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-slate-500 text-center py-4">
                  {gameTypeFilter !== 'all' ? `No ${gameTypeFilter.toUpperCase()} games against human opponents.` : 'No games against human opponents yet.'}
                </div>
              )}
            </div>

            <div className="bg-slate-800 rounded-xl p-6 md:col-span-2">
              <h2 className="text-xl font-bold mb-4">Performance Over Time</h2>
              <TimelineGraph entries={timeline} />
            </div>

            <div className="bg-slate-800 rounded-xl p-6 md:col-span-2">
              <h2 className="text-xl font-bold mb-4">Hit Heatmap</h2>
              <div className="flex justify-center">
                <Dartboard
                  heatmap={heatmap}
                  showLabels={true}
                  size={Math.min(360, typeof window !== 'undefined' ? window.innerWidth - 80 : 360)}
                  wireframe
                />
              </div>
              <div className="mt-4 flex justify-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-green-700/50"></span> Low
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-yellow-500/50"></span> Medium
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-orange-500/50"></span> High
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-red-600/60"></span> Most
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {selectedId && !stats && (
        <div className="text-center text-slate-400 py-8">
          No stats yet. Play some games first!
        </div>
      )}
    </div>
  );
}
