import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Trophy, Swords, ChevronRight, Loader2, Users } from 'lucide-react';
import { getTournament } from '../lib/api';
import type { Tournament as TournamentType, BracketSlot, TournamentStanding } from '../lib/types';

export default function Tournament() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<TournamentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      try {
        const t = await getTournament(id);
        if (!cancelled) setTournament(t);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load tournament');
      }
    };
    load();
    const interval = setInterval(load, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [id]);

  if (error) {
    return <div className="max-w-4xl mx-auto p-4"><div className="p-4 bg-red-900/50 text-red-100 rounded border border-red-700">{error}</div></div>;
  }
  if (!tournament) {
    return <div className="max-w-4xl mx-auto p-4 flex items-center gap-2 text-slate-400"><Loader2 className="animate-spin" size={20} /> Loading tournament...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Trophy className="text-emerald-400" size={28} />
          <div>
            <h1 className="text-2xl font-bold">{tournament.name}</h1>
            <p className="text-sm text-slate-400">
              {tournament.type.replace(/_/g, ' ')} · {tournament.game_type.toUpperCase()}
              {tournament.starting_score ? ` · ${tournament.starting_score}` : ''} · best of {tournament.match_length}
            </p>
          </div>
        </div>
        <div className="text-sm">
          {tournament.status === 'completed' ? (
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">Completed</span>
          ) : (
            <span className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30">Active</span>
          )}
        </div>
      </div>

      {tournament.winner && (
        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-center">
          <Trophy className="mx-auto text-emerald-400 mb-2" size={32} />
          <div className="text-emerald-300 font-bold text-lg">{tournament.winner.name} wins the tournament!</div>
        </div>
      )}

      {tournament.type === 'round_robin' && tournament.standings && (
        <RoundRobinStandings standings={tournament.standings} />
      )}

      {tournament.type === 'round_robin' ? (
        <RoundRobinFixtures slots={tournament.bracket} />
      ) : tournament.type === 'double_elimination' ? (
        <DoubleEliminationBracket slots={tournament.bracket} />
      ) : (
        <SingleEliminationBracket slots={tournament.bracket} />
      )}
    </div>
  );
}

// -------------------------------------------------------
// Single Elimination
// -------------------------------------------------------

function SingleEliminationBracket({ slots }: { slots: BracketSlot[] }) {
  const rounds = groupByRound(slots);
  const maxRound = Math.max(...slots.map((s) => s.round), 0);

  return (
    <div className="space-y-8">
      {rounds.map(([round, roundSlots]) => (
        <div key={round}>
          <h2 className="text-lg font-semibold mb-3 text-slate-300">{roundName(Number(round), maxRound)}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {roundSlots.map((slot) => (
              <SlotCard key={slot.id} slot={slot} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// -------------------------------------------------------
// Round Robin
// -------------------------------------------------------

function RoundRobinStandings({ standings }: { standings: TournamentStanding[] }) {
  return (
    <div className="mb-6 bg-slate-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold mb-3 text-slate-300 flex items-center gap-2">
        <Users size={20} /> Standings
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-400 border-b border-slate-700">
            <th className="text-left py-2">#</th>
            <th className="text-left py-2">Player</th>
            <th className="text-center py-2">W</th>
            <th className="text-center py-2">L</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr key={s.player.id} className={`border-b border-slate-700/50 ${i === 0 && s.wins > 0 ? 'text-emerald-400' : ''}`}>
              <td className="py-2 text-slate-500">{i + 1}</td>
              <td className="py-2 font-medium">
                {s.player.name}
                {s.player.is_bot && <span className="ml-1 text-xs text-slate-500">bot</span>}
              </td>
              <td className="py-2 text-center">{s.wins}</td>
              <td className="py-2 text-center">{s.losses}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoundRobinFixtures({ slots }: { slots: BracketSlot[] }) {
  const rounds = groupByRound(slots);
  return (
    <div className="space-y-6">
      {rounds.map(([round, roundSlots]) => (
        <div key={round}>
          <h3 className="text-sm font-semibold text-slate-400 mb-2">Matchday {Number(round) + 1}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {roundSlots.map((slot) => (
              <SlotCard key={slot.id} slot={slot} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// -------------------------------------------------------
// Double Elimination
// -------------------------------------------------------

function DoubleEliminationBracket({ slots }: { slots: BracketSlot[] }) {
  const wb = slots.filter((s) => s.phase === 'wb');
  const lb = slots.filter((s) => s.phase === 'lb');
  const gf = slots.filter((s) => s.phase === 'gf');

  const lbRounds = groupByRound(lb);

  return (
    <div className="space-y-8">
      {/* Winners Bracket */}
      <Section title="Winners Bracket" color="emerald">
        {groupByRound(wb).map(([round, roundSlots]) => (
          <div key={round}>
            <h3 className="text-sm font-semibold text-emerald-400 mb-2">WB Round {Number(round) + 1}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {roundSlots.map((slot) => <SlotCard key={slot.id} slot={slot} />)}
            </div>
          </div>
        ))}
      </Section>

      {/* Losers Bracket */}
      <Section title="Losers Bracket" color="amber">
        {lbRounds.map(([round, roundSlots]) => (
          <div key={round}>
            <h3 className="text-sm font-semibold text-amber-400 mb-2">LB Round {Number(round) + 1}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {roundSlots.map((slot) => <SlotCard key={slot.id} slot={slot} />)}
            </div>
          </div>
        ))}
      </Section>

      {/* Grand Final */}
      <Section title="Grand Final" color="purple">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {gf.map((slot) => <SlotCard key={slot.id} slot={slot} label={slot.round === 0 ? 'Grand Final' : 'Bracket Reset'} />)}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  const border: Record<string, string> = {
    emerald: 'border-emerald-500/30',
    amber: 'border-amber-500/30',
    purple: 'border-purple-500/30',
  };
  const text: Record<string, string> = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    purple: 'text-purple-400',
  };
  return (
    <div className={`bg-slate-800 rounded-xl p-6 border ${border[color] || 'border-slate-700'}`}>
      <h2 className={`text-lg font-bold mb-4 ${text[color] || 'text-slate-300'}`}>{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// -------------------------------------------------------
// Shared components
// -------------------------------------------------------

function SlotCard({ slot, label }: { slot: BracketSlot; label?: string }) {
  const p1 = slot.player1;
  const p2 = slot.player2;
  const winner = slot.winner;

  return (
    <div className="bg-slate-800 rounded border border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-slate-800/50">
        <span className="text-xs uppercase tracking-wider text-slate-500">
          {label || (slot.phase === 'gf' ? 'Grand Final' : slot.phase === 'lb' ? `LB R${slot.round + 1}` : `R${slot.round + 1} M${slot.position + 1}`)}
        </span>
        <StatusBadge status={slot.status} />
      </div>
      <div className="p-3 space-y-2">
        <PlayerRow player={p1} isWinner={!!winner && winner.id === p1?.id} />
        <PlayerRow player={p2} isWinner={!!winner && winner.id === p2?.id} />
      </div>
      {slot.match_id && slot.status !== 'completed' && (
        <Link
          to={`/match/${slot.match_id}`}
          className="flex items-center justify-center gap-1 w-full py-2 text-sm bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-t border-slate-700 transition"
        >
          <Swords size={14} /> Play match <ChevronRight size={14} />
        </Link>
      )}
    </div>
  );
}

function PlayerRow({ player, isWinner }: { player?: { name: string; is_bot: boolean }; isWinner: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded ${isWinner ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-slate-900/50'}`}>
      <span className={isWinner ? 'font-semibold text-emerald-100' : 'text-slate-300'}>
        {player ? player.name : <span className="text-slate-600 italic">TBD</span>}
      </span>
      {player && player.is_bot && <span className="text-xs text-slate-500">bot</span>}
      {isWinner && <Trophy size={14} className="text-emerald-400" />}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-slate-700 text-slate-300',
    active: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    completed: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded capitalize ${styles[status] || styles.pending}`}>
      {status}
    </span>
  );
}

function groupByRound(bracket: BracketSlot[]): [string, BracketSlot[]][] {
  const map = new Map<number, BracketSlot[]>();
  for (const slot of bracket) {
    if (!map.has(slot.round)) map.set(slot.round, []);
    map.get(slot.round)!.push(slot);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([round, slots]) => [String(round), slots.sort((a, b) => a.position - b.position)]);
}

function roundName(round: number, maxRound: number): string {
  if (round === maxRound) return 'Final';
  if (round === maxRound - 1) return 'Semi-final';
  if (round === maxRound - 2) return 'Quarter-final';
  return `Round ${round + 1}`;
}
