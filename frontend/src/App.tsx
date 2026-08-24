import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Maximize, Minimize } from 'lucide-react';
import Home from './pages/Home';
import Game from './pages/Game';
import Match from './pages/Match';
import Stats from './pages/Stats';
import Practice from './pages/Practice';

export default function App() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {}
  };

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-900 text-white">
        {/* Nav */}
        <nav className="bg-slate-800 border-b border-slate-700 px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <Link to="/" className="text-xl font-bold text-emerald-400">
              Darts
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link to="/" className="text-slate-300 hover:text-white transition">
                Play
              </Link>
              <Link to="/stats" className="text-slate-300 hover:text-white transition">
                Stats
              </Link>
              <Link to="/practice" className="text-slate-300 hover:text-white transition">
                Practice
              </Link>
              <button
                onClick={toggleFullscreen}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition"
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              </button>
            </div>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/game/:id" element={<Game />} />
          <Route path="/match/:id" element={<Match />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/practice" element={<Practice />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
