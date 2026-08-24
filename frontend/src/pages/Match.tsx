import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import type { MatchState } from '../lib/types';
import { getMatch } from '../lib/api';
import MatchBoard from '../components/MatchBoard';

export default function Match() {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<MatchState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getMatch(id)
      .then(res => setMatch(res.match))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (!id || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400">Loading match...</p>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-slate-400">Match not found.</p>
          <a href="/" className="text-emerald-400 hover:underline">Go Home</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 max-w-5xl mx-auto">
      <MatchBoard
        matchId={id}
        initialMatch={match}
        onMatchChange={setMatch}
      />
    </div>
  );
}
