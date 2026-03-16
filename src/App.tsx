/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, RotateCcw, Play, Zap, Users, Moon, Sun, ChevronRight } from 'lucide-react';

// --- Types ---
type Difficulty = 'Easy' | 'Medium' | 'Hard';

interface GameState {
  runs: number;
  wickets: number;
  balls: number;
  highScore: number;
  isGameOver: boolean;
  isPlaying: boolean;
  difficulty: Difficulty;
  nightMode: boolean;
  message: string;
  lastScore: number | null;
}

interface BallPosition {
  x: number;
  y: number;
  scale: number;
  visible: boolean;
}

// --- Constants ---
const OVER_BALLS = 6;
const MAX_WICKETS = 3;

const DIFFICULTY_SETTINGS = {
  Easy: { speed: 2000, window: 300, deviation: 20 },
  Medium: { speed: 1500, window: 200, deviation: 40 },
  Hard: { speed: 1000, window: 120, deviation: 60 },
};

export default function App() {
  // --- State ---
  const [game, setGame] = useState<GameState>({
    runs: 0,
    wickets: 0,
    balls: 0,
    highScore: Number(localStorage.getItem('cricketHighScore')) || 0,
    isGameOver: false,
    isPlaying: false,
    difficulty: 'Medium',
    nightMode: false,
    message: 'Welcome to Street Cricket!',
    lastScore: null,
  });

  const [ballPos, setBallPos] = useState<BallPosition>({ x: 50, y: 20, scale: 0.5, visible: false });
  const [isSwinging, setIsSwinging] = useState(false);
  const [leaderboard, setLeaderboard] = useState<number[]>(
    JSON.parse(localStorage.getItem('cricketLeaderboard') || '[]')
  );

  // --- Refs for Game Logic ---
  const ballTimerRef = useRef<NodeJS.Timeout | null>(null);
  const gameActiveRef = useRef(false);
  const lastBallTimeRef = useRef(0);
  const ballInHitZoneRef = useRef(false);

  // --- Audio ---
  const playSound = (type: 'hit' | 'out' | 'cheer') => {
    // Simple synthesized sounds using Web Audio API
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'hit') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'out') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(50, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'cheer') {
      // Noise-like cheer
      const bufferSize = ctx.sampleRate * 0.5;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1000;
      noise.connect(filter);
      filter.connect(gain);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      noise.start();
    }
  };

  // --- Core Mechanics ---
  const bowl = useCallback(() => {
    if (!gameActiveRef.current || game.isGameOver) return;

    const settings = DIFFICULTY_SETTINGS[game.difficulty];
    const randomDeviation = (Math.random() - 0.5) * settings.deviation;
    
    setBallPos({ x: 50, y: 20, scale: 0.5, visible: true });
    ballInHitZoneRef.current = false;

    // Animation start
    const startTime = Date.now();
    lastBallTimeRef.current = startTime;

    const animateBall = () => {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / settings.speed;

      if (progress < 1) {
        setBallPos({
          x: 50 + randomDeviation * progress,
          y: 20 + 60 * progress,
          scale: 0.5 + 1.5 * progress,
          visible: true,
        });

        // Hit zone is roughly between 85% and 95% of the progress
        if (progress > 0.85 && progress < 0.95) {
          ballInHitZoneRef.current = true;
        } else {
          ballInHitZoneRef.current = false;
        }

        requestAnimationFrame(animateBall);
      } else {
        // Ball missed or finished its path
        if (ballInHitZoneRef.current || progress >= 1) {
          handleMiss();
        }
      }
    };

    requestAnimationFrame(animateBall);
  }, [game.difficulty, game.isGameOver]);

  const handleMiss = () => {
    if (!gameActiveRef.current) return;
    
    playSound('out');
    setBallPos(prev => ({ ...prev, visible: false }));
    
    setGame(prev => {
      const newWickets = prev.wickets + 1;
      const isOver = newWickets >= MAX_WICKETS;
      
      if (isOver) {
        gameActiveRef.current = false;
        const newLeaderboard = [...leaderboard, prev.runs].sort((a, b) => b - a).slice(0, 5);
        localStorage.setItem('cricketLeaderboard', JSON.stringify(newLeaderboard));
        setLeaderboard(newLeaderboard);
        if (prev.runs > prev.highScore) {
          localStorage.setItem('cricketHighScore', String(prev.runs));
        }
      }

      return {
        ...prev,
        wickets: newWickets,
        balls: prev.balls + 1,
        isGameOver: isOver,
        isPlaying: !isOver,
        message: isOver ? 'GAME OVER!' : 'OUT! Bowled him!',
        lastScore: null,
        highScore: Math.max(prev.highScore, prev.runs),
      };
    });

    if (!game.isGameOver) {
      setTimeout(() => {
        if (gameActiveRef.current) bowl();
      }, 2000);
    }
  };

  const hitShot = () => {
    if (!game.isPlaying || isSwinging) return;

    setIsSwinging(true);
    setTimeout(() => setIsSwinging(false), 200);

    if (ballInHitZoneRef.current && ballPos.visible) {
      // Calculate timing quality
      const settings = DIFFICULTY_SETTINGS[game.difficulty];
      const elapsed = Date.now() - lastBallTimeRef.current;
      const progress = elapsed / settings.speed;
      
      // Perfect hit is at 0.9 progress
      const diff = Math.abs(progress - 0.9);
      
      let runs = 0;
      let msg = '';

      if (diff < 0.01) { runs = 6; msg = 'SIXER! Perfect timing!'; }
      else if (diff < 0.03) { runs = 4; msg = 'FOUR! Great shot!'; }
      else if (diff < 0.05) { runs = 2; msg = 'Two runs. Good placement.'; }
      else { runs = 1; msg = 'Single. Late hit.'; }

      playSound('hit');
      if (runs >= 4) playSound('cheer');

      setBallPos(prev => ({ ...prev, visible: false }));
      
      setGame(prev => ({
        ...prev,
        runs: prev.runs + runs,
        balls: prev.balls + 1,
        message: msg,
        lastScore: runs,
      }));

      // Trigger next ball
      setTimeout(() => {
        if (gameActiveRef.current) bowl();
      }, 1500);
    }
  };

  const startGame = () => {
    setGame(prev => ({
      ...prev,
      runs: 0,
      wickets: 0,
      balls: 0,
      isGameOver: false,
      isPlaying: true,
      message: 'Get ready...',
      lastScore: null,
    }));
    gameActiveRef.current = true;
    setTimeout(bowl, 1000);
  };

  const resetGame = () => {
    gameActiveRef.current = false;
    setGame(prev => ({
      ...prev,
      runs: 0,
      wickets: 0,
      balls: 0,
      isGameOver: false,
      isPlaying: false,
      message: 'Select difficulty and start!',
      lastScore: null,
    }));
    setBallPos({ x: 50, y: 20, scale: 0.5, visible: false });
  };

  // --- Helpers ---
  const getOvers = (balls: number) => {
    const overs = Math.floor(balls / OVER_BALLS);
    const remaining = balls % OVER_BALLS;
    return `${overs}.${remaining}`;
  };

  const getStrikeRate = (runs: number, balls: number) => {
    if (balls === 0) return '0.00';
    return ((runs / balls) * 100).toFixed(2);
  };

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-500 ${game.nightMode ? 'bg-zinc-950' : 'bg-zinc-900'}`}>
      
      {/* Header Stats */}
      <div className="w-full max-w-4xl flex flex-wrap justify-between items-center mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-widest text-emerald-500 font-bold mb-1">Total Score</p>
            <h2 className="text-4xl font-black font-display tracking-tighter">
              {game.runs}<span className="text-emerald-500">/</span>{game.wickets}
            </h2>
          </div>
          <div className="bg-zinc-800/50 border border-white/5 rounded-2xl p-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-1">Overs</p>
            <h2 className="text-2xl font-bold font-display">{getOvers(game.balls)}</h2>
          </div>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => setGame(prev => ({ ...prev, nightMode: !prev.nightMode }))}
            className="p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors border border-white/5"
          >
            {game.nightMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <div className="bg-zinc-800/50 border border-white/5 rounded-2xl p-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-1">Best</p>
            <h2 className="text-2xl font-bold font-display text-amber-500">{game.highScore}</h2>
          </div>
        </div>
      </div>

      {/* Main Game Area */}
      <div className={`relative w-full max-w-2xl aspect-[4/5] rounded-3xl stadium-bg border-4 border-zinc-800 shadow-2xl overflow-hidden ${game.nightMode ? 'night-mode' : ''}`}>
        
        {/* Floodlights */}
        <div className="absolute top-4 left-4 w-12 h-12 bg-white/20 rounded-full blur-xl floodlight" />
        <div className="absolute top-4 right-4 w-12 h-12 bg-white/20 rounded-full blur-xl floodlight" />

        {/* Pitch */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-[80%] pitch rounded-t-full opacity-80" />
        
        {/* Wickets */}
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex gap-2 z-30">
          {[1, 2, 3].map(i => (
            <div key={i} className="w-1.5 h-16 bg-zinc-200 rounded-full shadow-lg" />
          ))}
        </div>

        {/* Ball */}
        <AnimatePresence>
          {ballPos.visible && (
            <motion.div 
              className="ball"
              initial={{ opacity: 0 }}
              animate={{ 
                left: `${ballPos.x}%`, 
                top: `${ballPos.y}%`, 
                scale: ballPos.scale,
                opacity: 1 
              }}
              exit={{ opacity: 0 }}
              transition={{ type: 'tween', ease: 'linear', duration: 0.05 }}
            />
          )}
        </AnimatePresence>

        {/* Batsman */}
        <div className={`batsman ${isSwinging ? 'swinging' : ''}`}>
          {/* Simple CSS Avatar */}
          <div className="w-8 h-8 bg-amber-200 rounded-full mx-auto mb-1" />
          <div className="w-12 h-16 bg-white rounded-t-xl mx-auto relative">
            <div className="bat" />
          </div>
          <div className="flex justify-center gap-1">
            <div className="w-4 h-12 bg-zinc-300 rounded-b-lg" />
            <div className="w-4 h-12 bg-zinc-300 rounded-b-lg" />
          </div>
        </div>

        {/* Game Message Overlay */}
        <div className="absolute top-1/4 left-0 w-full text-center pointer-events-none z-50">
          <AnimatePresence mode="wait">
            <motion.div
              key={game.message}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className="px-6 py-2 bg-black/40 backdrop-blur-md inline-block rounded-full border border-white/10"
            >
              <p className="text-lg font-bold tracking-tight">{game.message}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Start/Game Over Screen */}
        {(!game.isPlaying || game.isGameOver) && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-[100] flex flex-col items-center justify-center p-8 text-center">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="max-w-sm"
            >
              {game.isGameOver ? (
                <>
                  <Trophy className="w-16 h-16 text-amber-500 mx-auto mb-4" />
                  <h1 className="text-5xl font-black font-display mb-2 tracking-tighter">FINISH!</h1>
                  <p className="text-zinc-400 mb-6">You scored {game.runs} runs in {game.balls} balls.</p>
                  
                  <div className="bg-zinc-900 rounded-2xl p-4 mb-6 border border-white/5">
                    <p className="text-xs uppercase font-bold text-zinc-500 mb-3">Leaderboard</p>
                    <div className="space-y-2">
                      {leaderboard.map((score, i) => (
                        <div key={i} className="flex justify-between items-center">
                          <span className="text-zinc-500 font-mono">#{i+1}</span>
                          <span className="font-bold">{score} runs</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 bg-emerald-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/20 rotate-12">
                    <Zap className="text-white fill-white" size={40} />
                  </div>
                  <h1 className="text-4xl font-black font-display mb-2 tracking-tighter uppercase">Street Cricket</h1>
                  <p className="text-zinc-400 mb-8">Master the timing, hit the boundaries, and become the champion.</p>
                </>
              )}

              {!game.isPlaying && (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-center gap-2 mb-2">
                    {(['Easy', 'Medium', 'Hard'] as Difficulty[]).map(d => (
                      <button
                        key={d}
                        onClick={() => setGame(prev => ({ ...prev, difficulty: d }))}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                          game.difficulty === d 
                            ? 'bg-white text-black scale-105' 
                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={startGame}
                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black rounded-2xl transition-all flex items-center justify-center gap-2 text-lg shadow-xl shadow-emerald-500/20"
                  >
                    <Play size={20} fill="currentColor" />
                    {game.isGameOver ? 'PLAY AGAIN' : 'START GAME'}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </div>

      {/* Controls & Secondary Stats */}
      <div className="w-full max-w-2xl mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 flex flex-col gap-4">
          <button 
            onMouseDown={hitShot}
            onTouchStart={hitShot}
            disabled={!game.isPlaying || game.isGameOver}
            className={`w-full py-8 rounded-3xl font-black text-2xl tracking-widest transition-all active:scale-95 flex items-center justify-center gap-4 ${
              !game.isPlaying || game.isGameOver
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'bg-white text-black hover:bg-zinc-100 shadow-2xl'
            }`}
          >
            HIT SHOT
            <ChevronRight size={32} />
          </button>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-800/30 border border-white/5 rounded-2xl p-4">
              <p className="text-xs uppercase font-bold text-zinc-500 mb-1">Strike Rate</p>
              <p className="text-xl font-bold font-display">{getStrikeRate(game.runs, game.balls)}</p>
            </div>
            <div className="bg-zinc-800/30 border border-white/5 rounded-2xl p-4">
              <p className="text-xs uppercase font-bold text-zinc-500 mb-1">Difficulty</p>
              <p className="text-xl font-bold font-display text-emerald-500">{game.difficulty}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <button 
            onClick={resetGame}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-3xl p-6 flex flex-col items-center justify-center gap-2 transition-colors border border-white/5"
          >
            <RotateCcw size={24} />
            <span className="text-xs font-bold uppercase tracking-widest">Reset</span>
          </button>
          <div className="bg-zinc-800/30 border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-2">
            <Users size={24} className="text-zinc-500" />
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Crowd</span>
            <span className="text-sm font-bold">Active</span>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <p className="mt-8 text-zinc-500 text-xs text-center max-w-md">
        Wait for the ball to reach the hitting zone (near the batsman) and click the HIT button. 
        Timing is everything! Perfect timing scores 6, while missing results in a wicket.
      </p>
    </div>
  );
}
