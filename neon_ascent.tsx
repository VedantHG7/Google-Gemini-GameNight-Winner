import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, Zap, Target, BatteryCharging, AlertTriangle, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Shuffle } from 'lucide-react';

// --- CONSTANTS & CONFIG ---
const BOARD_SIZE = 10;
const TOTAL_SQUARES = 100;
const FPS = 60;
const TILE_SIZE = 60; // Base size for drawing math

// Swap this with your actual Google Veo generated video URL (.mp4)
const VEO_VIDEO_URL = "https://assets.mixkit.co/videos/preview/mixkit-abstract-technology-lines-with-blue-and-pink-light-34444-large.mp4";

const COLORS = {
  bg: '#050510',
  grid: '#1a1a2e',
  text: '#ffffff',
  p1: '#00ffff', // Neon Cyan
  p2: '#ff00ff', // Neon Pink
  safe: '#4facfe',
  danger: '#ff0844',
  ladder: '#ffd700',
  snake: '#8a2be2',
  mystery: '#00ff88',
  hyper: '#ffaa00', // Added color for multiplier squares
  wormhole: '#ff00ff' // Added color for position swap
};

const CARD_TYPES = [
  { id: 'SHIELD', name: 'Shield', icon: Shield, color: '#4facfe', desc: 'Blocks the next snake fall.' },
  { id: 'DOUBLE_DASH', name: 'Double Dash', icon: Zap, color: '#ffd700', desc: 'Roll two dice this turn.' },
  { id: 'SABOTAGE', name: 'Sabotage', icon: Target, color: '#ff0844', desc: 'Push an opponent back 3 spaces.' },
  { id: 'ENERGY', name: 'Energy Drink', icon: BatteryCharging, color: '#00ff88', desc: 'Restores 40% Stamina.' }
];

const INITIAL_LINKS = [
  // ALL PATH (1-49)
  { id: 1, type: 'ladder', start: 4, end: 14, path: 'ALL' },
  { id: 2, type: 'ladder', start: 9, end: 31, path: 'ALL' },
  { id: 3, type: 'ladder', start: 21, end: 42, path: 'ALL' },
  { id: 4, type: 'ladder', start: 28, end: 48, path: 'ALL' },
  { id: 5, type: 'snake', start: 17, end: 7, path: 'ALL' },
  { id: 6, type: 'snake', start: 34, end: 12, path: 'ALL' },
  { id: 7, type: 'snake', start: 47, end: 26, path: 'ALL' },
  // SAFE PATH (51-99) - Small boosts, small drops
  { id: 8, type: 'ladder', start: 53, end: 57, path: 'SAFE' },
  { id: 9, type: 'ladder', start: 62, end: 68, path: 'SAFE' },
  { id: 10, type: 'ladder', start: 74, end: 81, path: 'SAFE' },
  { id: 11, type: 'ladder', start: 85, end: 89, path: 'SAFE' },
  { id: 12, type: 'snake', start: 59, end: 54, path: 'SAFE' },
  { id: 13, type: 'snake', start: 71, end: 67, path: 'SAFE' },
  { id: 14, type: 'snake', start: 84, end: 78, path: 'SAFE' },
  { id: 15, type: 'snake', start: 93, end: 88, path: 'SAFE' },
  { id: 16, type: 'snake', start: 98, end: 95, path: 'SAFE' },
  // DANGER PATH (51-99) - Huge boosts, huge drops
  { id: 17, type: 'ladder', start: 55, end: 86, path: 'DANGER' },
  { id: 18, type: 'ladder', start: 65, end: 97, path: 'DANGER' },
  { id: 19, type: 'snake', start: 78, end: 52, path: 'DANGER' },
  { id: 20, type: 'snake', start: 94, end: 56, path: 'DANGER' },
  { id: 21, type: 'snake', start: 99, end: 63, path: 'DANGER' },
];

// --- HELPER MATH & LOGIC ---
const delay = (ms) => new Promise(res => setTimeout(res, ms));

const getCoordsForSquare = (square, canvasWidth, canvasHeight) => {
  if (square === 0) return { x: 30, y: canvasHeight - 30 }; // Off board
  const sq = square - 1;
  const row = Math.floor(sq / BOARD_SIZE);
  const col = row % 2 === 0 ? sq % BOARD_SIZE : (BOARD_SIZE - 1) - (sq % BOARD_SIZE);
  const w = canvasWidth / BOARD_SIZE;
  const h = canvasHeight / BOARD_SIZE;
  return {
    x: col * w + w / 2,
    y: canvasHeight - (row * h + h / 2)
  };
};

const lerp = (start, end, amt) => (1 - amt) * start + amt * end;

// --- SOUND ENGINE ---
let audioCtx = null;
const playSFX = (type) => {
  try {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'ladder') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    } else if (type === 'snake') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    } else if (type === 'wormhole') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.1);
      osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'dice') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      osc.start(); osc.stop(ctx.currentTime + 0.05);
    } else if (type === 'move') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'intro') {
      // Cinematic Cyberpunk Boot Up Riser
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(50, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 2.5);
      gain.gain.setValueAtTime(0.01, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 1);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 3);
      osc.start(); osc.stop(ctx.currentTime + 3);

      // High pitch chime overlay
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(800, ctx.currentTime + 1.5);
      osc2.frequency.exponentialRampToValueAtTime(1500, ctx.currentTime + 3);
      gain2.gain.setValueAtTime(0, ctx.currentTime);
      gain2.gain.setValueAtTime(0.1, ctx.currentTime + 1.5);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 3);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 1.5); osc2.stop(ctx.currentTime + 3);
    }
  } catch (e) {
    console.error("Audio failed", e);
  }
};

// --- MAIN COMPONENT ---
export default function App() {
  const canvasRef = useRef(null);
  
  // -- REACT UI STATE --
  const [gameState, setGameState] = useState('START'); // START, INTRO, MENU, RULES, PLAYING, GAMEOVER
  const [players, setPlayers] = useState([]);
  const [activePlayerIndex, setActivePlayerIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [logs, setLogs] = useState([]);
  const [diceRolls, setDiceRolls] = useState([null, null]); // Up to 2 dice
  const [showPathModal, setShowPathModal] = useState(false);
  const [roundCounter, setRoundCounter] = useState(1);
  const [p1Name, setP1Name] = useState('CYBER_P1');
  const [p2Name, setP2Name] = useState('NEON_P2');

  // -- MUTABLE GAME ENGINE STATE (For Canvas & Anim loop) --
  const engine = useRef({
    players: [],
    links: [],
    particles: [],
    trails: [[], []], // Player trails
    width: 700,
    height: 700
  });

  const addLog = (msg, color = COLORS.text) => {
    setLogs(prev => [{ msg, color, id: Date.now() + Math.random() }, ...prev].slice(0, 8));
  };

  // --- INITIALIZATION ---
  const startGame = () => {
    // Play a silent sound immediately to unlock AudioContext in browsers
    try { playSFX('silent'); } catch(e){}
    
    const initialPlayers = [
      { id: 0, name: p1Name || 'Player 1', pos: 0, visual: { x: 30, y: 670 }, color: COLORS.p1, stamina: 100, cards: [], exhausted: false, path: null, hasShield: false, doubleDash: false, multiplier: 1 },
      { id: 1, name: p2Name || 'Player 2', pos: 0, visual: { x: 30, y: 670 }, color: COLORS.p2, stamina: 100, cards: [], exhausted: false, path: null, hasShield: false, doubleDash: false, multiplier: 1 }
    ];
    setPlayers(initialPlayers);
    engine.current.players = JSON.parse(JSON.stringify(initialPlayers));
    engine.current.links = JSON.parse(JSON.stringify(INITIAL_LINKS));
    engine.current.particles = [];
    engine.current.trails = [[], []];
    setRoundCounter(1);
    setActivePlayerIndex(0);
    setLogs([]);
    setDiceRolls([null, null]);
    addLog("Game Started! Reach 100 to win.", COLORS.mystery);
    setGameState('PLAYING');
  };

  // --- VISUAL EFFECTS ---
  const spawnParticles = (x, y, color, type) => {
    const count = type === 'EXPLOSION' ? 40 : type === 'MOVE' ? 3 : 15;
    for (let i = 0; i < count; i++) {
      engine.current.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * (type === 'EXPLOSION' ? 10 : type === 'MOVE' ? 2 : 5),
        vy: (Math.random() - 0.5) * (type === 'EXPLOSION' ? 10 : type === 'MOVE' ? 2 : 5) - (type === 'LADDER' ? 3 : 0),
        life: 1.0,
        decay: Math.random() * (type === 'MOVE' ? 0.05 : 0.02) + 0.02,
        color,
        size: Math.random() * (type === 'MOVE' ? 2 : 4) + (type === 'MOVE' ? 1 : 2)
      });
    }
  };

  // --- RENDER LOOP ---
  useEffect(() => {
    if (gameState !== 'PLAYING' && gameState !== 'GAMEOVER') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const render = () => {
      const { width, height, players: engPlayers, links, particles, trails } = engine.current;
      
      // Clear background
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, width, height);

      // Draw Grid & Numbers
      ctx.lineWidth = 1;
      for (let i = 1; i <= TOTAL_SQUARES; i++) {
        const { x, y } = getCoordsForSquare(i, width, height);
        const w = width / BOARD_SIZE;
        const h = height / BOARD_SIZE;
        
        // Checkerboard background for better visibility
        const sq = i - 1;
        const row = Math.floor(sq / BOARD_SIZE);
        const col = sq % BOARD_SIZE;
        if ((row + col) % 2 === 0) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        } else {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        }
        ctx.fillRect(x - w/2, y - h/2, w, h);

        // Base Square (Brighter Grid Lines)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; 
        ctx.strokeRect(x - w/2, y - h/2, w, h);

        // Styling based on special squares
        if (i === 50) {
           ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
           ctx.fillRect(x - w/2, y - h/2, w, h);
           ctx.fillStyle = '#fff';
           ctx.font = 'bold 12px sans-serif';
           ctx.textAlign = 'center';
           ctx.fillText('CROSSROAD', x, y + 18);
        } else if (i === 25 || i === 75) {
           ctx.fillStyle = 'rgba(255, 170, 0, 0.15)';
           ctx.fillRect(x - w/2, y - h/2, w, h);
           ctx.fillStyle = COLORS.hyper;
           ctx.font = 'bold 14px sans-serif';
           ctx.textAlign = 'center';
           ctx.fillText('HYPER', x, y + 18);
        } else if (i === 15 || i === 85) {
           ctx.fillStyle = 'rgba(255, 0, 255, 0.15)';
           ctx.fillRect(x - w/2, y - h/2, w, h);
           ctx.fillStyle = COLORS.wormhole;
           ctx.font = 'bold 12px sans-serif';
           ctx.textAlign = 'center';
           ctx.fillText('WORMHOLE', x, y + 18);
        } else if (i % 10 === 0) {
           ctx.fillStyle = 'rgba(0, 255, 136, 0.05)';
           ctx.fillRect(x - w/2, y - h/2, w, h);
        }

        // Bold, Clear Numbers
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(0, 255, 255, 0.8)';
        ctx.font = '900 24px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(i, x, y - 5);
        ctx.shadowBlur = 0; // reset
      }

      // Draw Links (Snakes & Ladders)
      ctx.globalCompositeOperation = 'screen';
      links.forEach(link => {
        const start = getCoordsForSquare(link.start, width, height);
        const end = getCoordsForSquare(link.end, width, height);
        
        if (link.type === 'ladder') {
          // --- LIVE NEON LADDER ---
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const angle = Math.atan2(dy, dx);
          const length = Math.sqrt(dx * dx + dy * dy);
          const ladderWidth = 14;

          const ox = Math.cos(angle + Math.PI / 2) * ladderWidth;
          const oy = Math.sin(angle + Math.PI / 2) * ladderWidth;

          const baseColor = link.path === 'DANGER' ? 'rgba(255, 8, 68, 0.8)' : link.path === 'SAFE' ? 'rgba(79, 172, 254, 0.8)' : 'rgba(255, 215, 0, 0.8)';
          
          ctx.strokeStyle = baseColor;
          ctx.lineWidth = 3;
          ctx.shadowBlur = 15;
          ctx.shadowColor = baseColor;

          // Draw Rails
          ctx.beginPath();
          ctx.moveTo(start.x + ox, start.y + oy);
          ctx.lineTo(end.x + ox, end.y + oy);
          ctx.moveTo(start.x - ox, start.y - oy);
          ctx.lineTo(end.x - ox, end.y - oy);
          ctx.stroke();

          // Draw Animated Rungs (Flowing Upwards)
          const rungCount = Math.floor(length / 25);
          const timeOffset = (Date.now() / 1000) % 1; // 0 to 1 loop
          
          ctx.beginPath();
          for (let j = 0; j <= rungCount + 1; j++) {
            const fraction = j / (rungCount + 1);
            // Animate fraction so rungs move from start to end continuously
            const animatedFraction = (fraction - timeOffset + 1) % 1;
            
            // Only draw rung if it's within the bounds of the rails
            if (animatedFraction > 0.05 && animatedFraction < 0.95) {
              const rx = start.x + dx * animatedFraction;
              const ry = start.y + dy * animatedFraction;
              ctx.moveTo(rx + ox, ry + oy);
              ctx.lineTo(rx - ox, ry - oy);
            }
          }
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.stroke();

        } else {
          // --- WRITHING VOID WORM (SNAKE) ---
          const time = Date.now() / 400;
          const timeOffset = link.id * 15; // Desync movements
          
          // Dynamic control point for writhing motion
          const midX = (start.x + end.x) / 2 + Math.sin(time + timeOffset) * 45;
          const midY = (start.y + end.y) / 2 + Math.cos(time + timeOffset) * 45;

          const primaryColor = link.path === 'DANGER' ? '#ff0844' : '#8a2be2';
          const secColor = link.path === 'DANGER' ? '#8a2be2' : '#ff00ff';

          ctx.shadowBlur = 15;
          ctx.shadowColor = primaryColor;

          // Draw segmented body tapering to the tail
          const steps = 30;
          for(let j = steps; j >= 0; j--) {
            const t = j / steps;
            
            // Quadratic bezier formula
            const qx = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * midX + t * t * end.x;
            const qy = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * midY + t * t * end.y;

            // Taper thickness: Head is thick (10px), tail is thin (2px)
            const radius = 10 * (1 - t) + 2; 

            ctx.beginPath();
            ctx.arc(qx, qy, radius, 0, Math.PI * 2);
            ctx.fillStyle = (j % 2 === 0) ? primaryColor : secColor;
            ctx.fill();
          }

          // Draw Head (at 'start' since players land on the head to slide down)
          const headAngle = Math.atan2(midY - start.y, midX - start.x);
          
          ctx.beginPath();
          ctx.arc(start.x, start.y, 14, 0, Math.PI * 2);
          ctx.fillStyle = primaryColor;
          ctx.fill();

          // Draw Glowing Eyes
          const eyeDist = 6;
          const ex1 = start.x + Math.cos(headAngle - 0.6) * eyeDist;
          const ey1 = start.y + Math.sin(headAngle - 0.6) * eyeDist;
          const ex2 = start.x + Math.cos(headAngle + 0.6) * eyeDist;
          const ey2 = start.y + Math.sin(headAngle + 0.6) * eyeDist;

          ctx.shadowBlur = 10;
          ctx.shadowColor = '#fff';
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(ex1, ey1, 3, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(ex2, ey2, 3, 0, Math.PI*2); ctx.fill();
        }
        
        ctx.shadowBlur = 0; // reset
      });
      ctx.globalCompositeOperation = 'source-over';

      // Draw Trails & Players
      engPlayers.forEach((p, idx) => {
        // Update Trails
        if (trails[idx]) {
           trails[idx].push({x: p.visual.x, y: p.visual.y});
           if (trails[idx].length > 20) trails[idx].shift();

           // Draw Trail
           if (trails[idx].length > 1) {
             ctx.beginPath();
             ctx.moveTo(trails[idx][0].x, trails[idx][0].y);
             for(let i=1; i<trails[idx].length; i++) {
                ctx.lineTo(trails[idx][i].x, trails[idx][i].y);
             }
             ctx.strokeStyle = p.color;
             ctx.lineWidth = 4;
             ctx.globalAlpha = 0.5;
             ctx.stroke();
             ctx.globalAlpha = 1.0;
           }
        }

        // Draw Player Token
        ctx.beginPath();
        ctx.arc(p.visual.x, p.visual.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 20;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Draw Shield
        if (p.hasShield) {
          ctx.beginPath();
          ctx.arc(p.visual.x, p.visual.y, 18, 0, Math.PI * 2);
          ctx.strokeStyle = COLORS.safe;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        
        // Exhausted indicator
        if (p.exhausted) {
          ctx.fillStyle = '#ff0000';
          ctx.font = '16px sans-serif';
          ctx.fillText('!Zz', p.visual.x + 15, p.visual.y - 15);
        }
      });

      // Update & Draw Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        
        if (p.life <= 0) {
          particles.splice(i, 1);
        } else {
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1.0;

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState]);


  // --- GAMEPLAY LOGIC ---

  const syncStateToReact = () => {
    setPlayers(JSON.parse(JSON.stringify(engine.current.players)));
  };

  const endTurn = async () => {
    // Check Shifting Board
    const engPlayers = engine.current.players;
    let nextIndex = (activePlayerIndex + 1) % engPlayers.length;
    
    // Check Round end
    if (nextIndex === 0) {
      const newRound = roundCounter + 1;
      setRoundCounter(newRound);
      
      if (newRound % 5 === 0) {
        addLog(`🌪️ BOARD SHUFFLE! Reality bends!`, COLORS.ladder);
        setIsAnimating(true);
        // Visual shake effect
        const canvas = canvasRef.current;
        if(canvas) canvas.style.transform = 'translate(10px, 10px)';
        await delay(100);
        if(canvas) canvas.style.transform = 'translate(-10px, -10px)';
        await delay(100);
        if(canvas) canvas.style.transform = 'translate(0px, 0px)';
        
        // Flip logic: Find 2 ladders and 2 snakes
        let ladders = engine.current.links.filter(l => l.type === 'ladder');
        let snakes = engine.current.links.filter(l => l.type === 'snake');
        
        // Shuffle arrays
        ladders.sort(() => 0.5 - Math.random());
        snakes.sort(() => 0.5 - Math.random());
        
        const toFlip = [...ladders.slice(0, 2), ...snakes.slice(0, 2)];
        
        toFlip.forEach(link => {
           // Swap start/end
           let temp = link.start;
           link.start = link.end;
           link.end = temp;
           link.type = link.type === 'ladder' ? 'snake' : 'ladder';
           
           const coords = getCoordsForSquare(link.start, engine.current.width, engine.current.height);
           spawnParticles(coords.x, coords.y, link.type === 'ladder' ? COLORS.ladder : COLORS.snake, 'EXPLOSION');
        });
        
        await delay(1000);
        setIsAnimating(false);
      }
    }
    
    // Handle Exhaustion for next player
    let nextPlayer = engPlayers[nextIndex];
    if (nextPlayer.exhausted) {
      addLog(`${nextPlayer.name} is resting and skips this turn. Stamina restoring...`, '#888');
      nextPlayer.exhausted = false;
      nextPlayer.stamina = 50;
      setActivePlayerIndex(nextIndex); // UI updates
      syncStateToReact();
      
      // Recursively end turn to pass to next
      setTimeout(() => {
        setActivePlayerIndex((nextIndex + 1) % engPlayers.length);
      }, 2000);
      return;
    }

    // Normal pass
    setDiceRolls([null, null]);
    setActivePlayerIndex(nextIndex);
    syncStateToReact();
  };

  const handleCardUse = (cardId, pIndex) => {
    if (isAnimating || pIndex !== activePlayerIndex) return;
    const player = engine.current.players[pIndex];
    
    // Remove card
    const cardIdx = player.cards.findIndex(c => c === cardId);
    if (cardIdx > -1) player.cards.splice(cardIdx, 1);

    const cardDef = CARD_TYPES.find(c => c.id === cardId);
    addLog(`${player.name} used ${cardDef.name}!`, cardDef.color);

    if (cardId === 'SHIELD') {
      player.hasShield = true;
    } else if (cardId === 'DOUBLE_DASH') {
      player.doubleDash = true;
    } else if (cardId === 'ENERGY') {
      player.stamina = Math.min(100, player.stamina + 40);
      player.exhausted = false;
    } else if (cardId === 'SABOTAGE') {
      // Find opponent (assumes 2 players)
      const targetIdx = pIndex === 0 ? 1 : 0;
      executeSabotage(targetIdx);
      syncStateToReact();
      return; // Sabotage handles its own animations
    }
    
    syncStateToReact();
  };

  const executeSabotage = async (targetIdx) => {
    setIsAnimating(true);
    const target = engine.current.players[targetIdx];
    let steps = [];
    for(let i=0; i<3; i++) {
      if (target.pos > 1) {
        target.pos--;
        steps.push(target.pos);
      }
    }
    await animatePath(target, steps);
    await checkBoardInteractions(target);
    setIsAnimating(false);
  };

  // --- CORE MOVEMENT ENGINE ---
  const rollDice = async () => {
    if (isAnimating) return;
    setIsAnimating(true);
    
    const p = engine.current.players[activePlayerIndex];
    
    // Visual dice rolling
    for(let i=0; i<15; i++) {
      playSFX('dice');
      setDiceRolls([Math.floor(Math.random()*6)+1, p.doubleDash ? Math.floor(Math.random()*6)+1 : null]);
      await delay(40);
    }
    
    const roll1 = Math.floor(Math.random() * 6) + 1;
    const roll2 = p.doubleDash ? Math.floor(Math.random() * 6) + 1 : null;
    setDiceRolls([roll1, roll2]);
    p.doubleDash = false;
    
    const baseRoll = roll1 + (roll2 || 0);
    const isHyper = p.multiplier > 1;
    const totalRoll = baseRoll * p.multiplier;
    
    if (isHyper) {
      addLog(`🚀 HYPER JUMP! ${baseRoll} x ${p.multiplier} = ${totalRoll} spaces!`, COLORS.hyper);
      p.multiplier = 1; // Consume multiplier
    } else {
      addLog(`${p.name} rolled a ${totalRoll}`, COLORS.text);
    }
    
    await delay(500);

    // Calculate Path
    let path = [];
    let currentSq = p.pos;
    
    for (let i = 0; i < totalRoll; i++) {
      if (currentSq < 50 && p.pos < 50) {
        currentSq++;
        path.push(currentSq);
        if (currentSq === 50) {
          addLog(`${p.name} reached The Crossroads and must stop!`, COLORS.mystery);
          break; // MUST STOP AT 50
        }
      } else if (currentSq < 100) {
        currentSq++;
        path.push(currentSq);
      } else {
        currentSq--; // Bounce back
        path.push(currentSq);
      }
    }

    p.pos = currentSq;
    await animatePath(p, path);

    // After physical movement, check squares
    if (p.pos === 50 && !p.path) {
      // Must choose path
      setShowPathModal(true);
      // Wait for modal via a state trick or just exit here and let modal trigger continuation
      return; 
    }

    await checkBoardInteractions(p);
  };

  const handlePathSelection = async (choice) => {
    const p = engine.current.players[activePlayerIndex];
    p.path = choice;
    setShowPathModal(false);
    addLog(`${p.name} chose the ${choice} route!`, choice === 'SAFE' ? COLORS.safe : COLORS.danger);
    syncStateToReact();
    await checkBoardInteractions(p); // In case 50 has something (it doesn't usually, but safe to call)
  };

  const animatePath = async (player, pathArray) => {
    for (let sq of pathArray) {
      const target = getCoordsForSquare(sq, engine.current.width, engine.current.height);
      
      playSFX('move');
      
      // Lerp Loop for a single step
      let steps = 10;
      for (let i = 0; i < steps; i++) {
        player.visual.x = lerp(player.visual.x, target.x, 0.3);
        player.visual.y = lerp(player.visual.y, target.y, 0.3);
        
        // Add movement trail sparks
        if (Math.random() > 0.4) {
          spawnParticles(player.visual.x, player.visual.y, player.color, 'MOVE');
        }
        
        await delay(16); // ~60fps
      }
      // Snap exactly
      player.visual.x = target.x;
      player.visual.y = target.y;
    }
  };

  const checkBoardInteractions = async (player) => {
    // Win Condition
    if (player.pos === 100) {
      addLog(`🏆 ${player.name} WINS THE GAME!`, COLORS.ladder);
      setGameState('GAMEOVER');
      setIsAnimating(false);
      return;
    }

    // Check Links (Snakes / Ladders)
    // Filter by path logic: ALL links are valid. If past 50, only links matching player.path are valid.
    const activeLink = engine.current.links.find(l => 
      l.start === player.pos && 
      (l.path === 'ALL' || l.path === player.path)
    );

    if (activeLink) {
      await delay(500);
      if (activeLink.type === 'snake') {
        if (player.hasShield) {
          addLog(`🛡️ ${player.name}'s Shield popped! Safe from the trap.`, COLORS.safe);
          player.hasShield = false;
          spawnParticles(player.visual.x, player.visual.y, COLORS.safe, 'EXPLOSION');
        } else {
          playSFX('snake');
          addLog(`🐍 ${player.name} fell down a Void Trap! -20% Stamina`, COLORS.snake);
          player.stamina -= 20;
          spawnParticles(player.visual.x, player.visual.y, COLORS.snake, 'EXPLOSION');
          if (player.stamina <= 0) {
            player.stamina = 0;
            player.exhausted = true;
            addLog(`💀 ${player.name} is EXHAUSTED!`, '#ff0000');
          }
          player.pos = activeLink.end;
          await animatePath(player, [activeLink.end]);
        }
      } else if (activeLink.type === 'ladder') {
        playSFX('ladder');
        addLog(`🚀 ${player.name} rode an Energy Beam!`, COLORS.ladder);
        spawnParticles(player.visual.x, player.visual.y, COLORS.ladder, 'LADDER');
        player.pos = activeLink.end;
        await animatePath(player, [activeLink.end]);
      }
      
      // Recursively check if the new square has something (like a mystery square)
      // Usually snakes/ladders don't chain, but we check mystery
      await checkSpecialSquares(player);
    } else {
      await checkSpecialSquares(player);
    }
  };

  const checkSpecialSquares = async (player) => {
    if (player.pos === 25 || player.pos === 75) {
      await delay(300);
      spawnParticles(player.visual.x, player.visual.y, COLORS.hyper, 'EXPLOSION');
      player.multiplier = 2; // 2x multiplier
      addLog(`⚡ ${player.name} charged at a HYPER NODE! Next roll is 2X!`, COLORS.hyper);
    } else if (player.pos === 15 || player.pos === 85) {
      await delay(300);
      playSFX('wormhole');
      spawnParticles(player.visual.x, player.visual.y, COLORS.wormhole, 'EXPLOSION');
      addLog(`🌀 WORMHOLE! Reality distorts! Positions swapped!`, COLORS.wormhole);
      
      // Swap positions with opponent
      const opponentIdx = activePlayerIndex === 0 ? 1 : 0;
      const opponent = engine.current.players[opponentIdx];
      
      const tempPos = player.pos;
      player.pos = opponent.pos;
      opponent.pos = tempPos;
      
      // Animate both moving to their new spots
      setIsAnimating(true);
      await Promise.all([
         animatePath(player, [player.pos]),
         animatePath(opponent, [opponent.pos])
      ]);
    } else if (player.pos > 0 && player.pos % 10 === 0 && player.pos !== 50 && player.pos !== 100) {
      await delay(300);
      spawnParticles(player.visual.x, player.visual.y, COLORS.mystery, 'EXPLOSION');
      const randomCard = CARD_TYPES[Math.floor(Math.random() * CARD_TYPES.length)];
      
      if (player.cards.length < 3) {
        player.cards.push(randomCard.id);
        addLog(`🎁 ${player.name} found a Mystery Square: ${randomCard.name}!`, COLORS.mystery);
      } else {
        addLog(`🎒 ${player.name} found a ${randomCard.name}, but inventory is full!`, '#888');
      }
    }
    
    // Turn concludes
    syncStateToReact();
    setIsAnimating(false);
    endTurn();
  };

  // --- RENDERERS ---
  const renderDiceIcon = (val, isRolling) => {
    if (!val && !isRolling) return null;
    const v = val || Math.floor(Math.random()*6)+1;
    const props = { 
      size: 56, 
      className: `text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] ${isRolling ? 'animate-spin scale-110' : 'animate-bounce'}` 
    };
    switch(v) {
      case 1: return <Dice1 {...props} />;
      case 2: return <Dice2 {...props} />;
      case 3: return <Dice3 {...props} />;
      case 4: return <Dice4 {...props} />;
      case 5: return <Dice5 {...props} />;
      case 6: return <Dice6 {...props} />;
      default: return <Dice1 {...props} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#050510] text-white flex items-center justify-center font-sans p-4">
      
      {gameState === 'START' && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
          <h1 className="text-4xl md:text-6xl font-black text-white tracking-[0.5em] uppercase mb-12 animate-pulse drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] text-center pl-4">
            System Ready
          </h1>
          <button 
            onClick={() => {
              playSFX('intro');
              setGameState('INTRO');
            }} 
            className="px-10 py-5 bg-transparent border-2 border-cyan-500 text-cyan-400 font-bold tracking-widest text-xl uppercase transition-all hover:bg-cyan-500/20 hover:shadow-[0_0_30px_rgba(0,255,255,0.4)] rounded-lg"
          >
            Boot Sequence
          </button>
        </div>
      )}

      {gameState === 'INTRO' && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center overflow-hidden">
          <video
            autoPlay
            muted
            playsInline
            onEnded={() => setGameState('MENU')}
            className="absolute inset-0 w-full h-full object-cover opacity-60"
          >
            <source src={VEO_VIDEO_URL} type="video/mp4" />
          </video>
          
          {/* Animated Neon Snake Overlay */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 opacity-70" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <filter id="neonSnake1" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="neonSnake2" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {/* Snake 1 (Purple) */}
            <path d="M -10,20 C 20,50 40,-10 60,30 S 80,10 110,40" fill="none" stroke="#8a2be2" strokeWidth="1.5" filter="url(#neonSnake1)" strokeLinecap="round" strokeDasharray="30 150">
              <animate attributeName="stroke-dashoffset" from="180" to="0" dur="4s" repeatCount="indefinite" />
            </path>
            {/* Snake 2 (Red/Pink) */}
            <path d="M 110,70 C 80,40 60,110 40,60 S 20,90 -10,50" fill="none" stroke="#ff0844" strokeWidth="2.5" filter="url(#neonSnake2)" strokeLinecap="round" strokeDasharray="40 120">
              <animate attributeName="stroke-dashoffset" from="-160" to="0" dur="5s" repeatCount="indefinite" />
            </path>
            {/* Snake 3 (Magenta) */}
            <path d="M 30,-10 C 60,20 -10,50 40,80 S 10,100 50,110" fill="none" stroke="#ff00ff" strokeWidth="1" filter="url(#neonSnake1)" strokeLinecap="round" strokeDasharray="25 100">
              <animate attributeName="stroke-dashoffset" from="125" to="0" dur="3.5s" repeatCount="indefinite" />
            </path>
            {/* Snake 4 (Fast Giant Worm) */}
            <path d="M -10,80 Q 50,50 110,20" fill="none" stroke="#8a2be2" strokeWidth="3.5" filter="url(#neonSnake2)" strokeLinecap="round" strokeDasharray="50 200">
              <animate attributeName="stroke-dashoffset" from="250" to="0" dur="2.5s" repeatCount="indefinite" />
            </path>
          </svg>

          <div className="absolute z-10 flex flex-col items-center pointer-events-none text-center">
            <h1 className="text-5xl md:text-8xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-500 drop-shadow-[0_0_25px_rgba(0,255,255,0.6)] uppercase mb-4 animate-pulse">
              NEON ASCENT
            </h1>
            <h2 className="text-lg md:text-2xl font-bold tracking-[0.3em] text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] uppercase">
              Climb the Grid. Survive the Void.
            </h2>
          </div>

          <div className="absolute z-20 bottom-10 right-10">
            <button 
              onClick={() => setGameState('MENU')} 
              className="px-6 py-3 bg-white/5 hover:bg-white/20 backdrop-blur-md border border-white/30 rounded-full text-white font-bold tracking-widest transition-all hover:scale-105 shadow-[0_0_15px_rgba(255,255,255,0.2)]"
            >
              SKIP INTRO
            </button>
          </div>
        </div>
      )}

      {gameState === 'MENU' && (
        <div className="text-center z-10 relative">
          <h1 className="text-6xl font-black mb-4 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-500 shadow-neon">
            NEON ASCENT
          </h1>
          <p className="text-xl mb-8 max-w-md mx-auto text-gray-300">
            A high-stakes, cyberpunk reimagining of the classic game. Manage stamina, use action cards, and choose your path.
          </p>
          <button 
            onClick={() => setGameState('RULES')}
            className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full font-bold text-xl hover:scale-105 transition-transform shadow-[0_0_20px_rgba(0,255,255,0.4)]"
          >
            INITIALIZE SEQUENCE
          </button>
        </div>
      )}

      {gameState === 'RULES' && (
        <div className="bg-black/80 p-8 rounded-2xl border border-cyan-500/50 max-w-4xl w-full shadow-[0_0_40px_rgba(0,255,255,0.2)] backdrop-blur-md z-10 flex flex-col items-center">
          <h2 className="text-4xl font-black mb-6 text-cyan-400 text-center tracking-widest uppercase">Directives</h2>
          
          {/* Player Name Setup */}
          <div className="flex flex-col md:flex-row gap-6 mb-8 w-full justify-center">
            <div className="flex flex-col gap-2">
              <label className="text-cyan-400 font-bold uppercase tracking-wider text-sm text-center">Player 1 Name</label>
              <input 
                type="text" 
                value={p1Name} 
                onChange={e => setP1Name(e.target.value)} 
                maxLength={10}
                className="bg-black/50 border border-cyan-500 text-white px-4 py-3 rounded-lg outline-none focus:shadow-[0_0_15px_rgba(0,255,255,0.4)] transition-shadow text-center font-bold tracking-widest uppercase"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-pink-400 font-bold uppercase tracking-wider text-sm text-center">Player 2 Name</label>
              <input 
                type="text" 
                value={p2Name} 
                onChange={e => setP2Name(e.target.value)} 
                maxLength={10}
                className="bg-black/50 border border-pink-500 text-white px-4 py-3 rounded-lg outline-none focus:shadow-[0_0_15px_rgba(255,0,255,0.4)] transition-shadow text-center font-bold tracking-widest uppercase"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 text-sm text-gray-300 mb-8 w-full">
            <div>
              <h3 className="text-xl font-bold text-white mb-2">⚡ The Basics</h3>
              <p>Reach square 100 exactly to win. If you over-roll, you'll bounce back. Climb golden energy beams, but avoid purple void traps.</p>
              <br/>
              <h3 className="text-xl font-bold text-white mb-2">🌪️ Shifting Reality</h3>
              <p>Every 5 rounds, the board violently shuffles. 2 ladders become snakes, and 2 snakes become ladders!</p>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">🌀 The Wormhole</h3>
              <p>Squares <span className="text-pink-400 font-bold">15 and 85</span> tear space-time! Land on them to instantly swap positions with your opponent.</p>
              <br/>
              <h3 className="text-xl font-bold text-white mb-2">🚀 Hyper Nodes</h3>
              <p>Land on squares 25 or 75 to supercharge your next roll with a <span className="text-orange-400 font-bold">2X Multiplier!</span></p>
            </div>
          </div>
          <div className="text-center mt-4">
            <button 
              onClick={startGame}
              className="px-10 py-4 bg-white text-black rounded-full font-black text-2xl hover:scale-105 transition-transform shadow-[0_0_25px_rgba(255,255,255,0.6)]"
            >
              ENTER THE GRID
            </button>
          </div>
        </div>
      )}

      {(gameState === 'PLAYING' || gameState === 'GAMEOVER') && (
        <div className="flex flex-col lg:flex-row gap-6 max-w-7xl w-full relative z-10 items-center lg:items-stretch">
          
          {/* LEFT SIDEBAR - PLAYERS */}
          <div className="flex flex-col gap-4 w-full lg:w-64">
             {players.map((p, idx) => (
                <div key={p.id} className={`p-5 rounded-2xl border backdrop-blur-md transition-all duration-300 ${activePlayerIndex === idx ? 'border-cyan-400 shadow-[0_0_25px_rgba(0,255,255,0.3)] bg-gradient-to-b from-white/10 to-transparent scale-[1.02]' : 'border-white/10 bg-black/50 opacity-80'}`}>
                   <div className="flex justify-between items-center mb-3">
                     <h3 className="font-black text-xl tracking-wider uppercase drop-shadow-md" style={{ color: p.color }}>{p.name} {p.exhausted && '💤'}</h3>
                     {p.multiplier > 1 && <span className="bg-orange-500 text-white text-[10px] font-black px-2 py-1 rounded animate-pulse shadow-[0_0_10px_rgba(255,165,0,0.8)]">2X ROLL!</span>}
                   </div>
                   
                   <div className="text-xs font-mono text-cyan-200 mb-3 bg-black/40 px-2 py-1 rounded inline-block border border-cyan-900/50">
                     NODE: {p.pos} {p.path ? `[${p.path}]` : ''}
                   </div>
                   
                   {/* Stamina Bar */}
                   <div className="w-full bg-black/80 h-3 rounded-full overflow-hidden mb-4 border border-white/10 relative">
                     <div 
                        className="h-full transition-all duration-500 rounded-full" 
                        style={{ 
                          width: `${p.stamina}%`, 
                          backgroundColor: p.stamina > 50 ? '#00ff88' : p.stamina > 20 ? '#ffd700' : '#ff0844',
                          boxShadow: `0 0 10px ${p.stamina > 50 ? '#00ff88' : p.stamina > 20 ? '#ffd700' : '#ff0844'}`
                        }} 
                      />
                   </div>

                   {/* Status Icons */}
                   <div className="flex gap-3 mb-4 h-6">
                     {p.hasShield && <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-blue-300 bg-blue-900/30 px-2 rounded border border-blue-500/30"><Shield size={12} color={COLORS.safe} /> Shielded</div>}
                     {p.doubleDash && <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-yellow-300 bg-yellow-900/30 px-2 rounded border border-yellow-500/30"><Zap size={12} color={COLORS.ladder} /> 2X Dice</div>}
                   </div>

                   {/* Cards */}
                   <div className="flex flex-wrap gap-2">
                     {p.cards.map((cId, cIdx) => {
                       const card = CARD_TYPES.find(c => c.id === cId);
                       const canUse = idx === activePlayerIndex && !isAnimating && !p.exhausted;
                       return (
                         <button 
                           key={cIdx} 
                           onClick={() => canUse && handleCardUse(cId, idx)}
                           disabled={!canUse}
                           className={`p-2 rounded bg-gray-900 border transition-transform ${canUse ? 'hover:bg-gray-800 hover:scale-110 cursor-pointer shadow-[0_0_10px_rgba(255,255,255,0.1)]' : 'opacity-50 cursor-not-allowed'}`}
                           style={{ borderColor: card.color }}
                           title={card.desc}
                         >
                           <card.icon size={18} color={card.color} />
                         </button>
                       )
                     })}
                     {p.cards.length === 0 && <span className="text-xs text-gray-600 italic">No items stored</span>}
                   </div>
                </div>
             ))}

             {/* GAME LOG */}
             <div className="mt-auto bg-black/60 rounded-2xl p-4 border border-white/10 h-64 overflow-y-auto flex flex-col gap-2 text-sm font-mono backdrop-blur-sm shadow-inner shadow-black/50">
                {logs.map((l) => (
                  <div key={l.id} className="transition-opacity" style={{ color: l.color }}>&gt; {l.msg}</div>
                ))}
             </div>
          </div>

          {/* CENTER - CANVAS BOARD */}
          <div className="relative rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,255,255,0.15)] border border-white/10 flex-shrink-0 z-20 bg-black">
             <canvas 
               ref={canvasRef} 
               width={700} 
               height={700}
               className="block w-full max-w-[700px] h-auto aspect-square"
             />
             
             {/* Modals over canvas */}
             {showPathModal && (
               <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-8 text-center backdrop-blur-md z-30">
                 <h2 className="text-4xl font-black mb-4 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]">THE CROSSROADS</h2>
                 <p className="mb-10 text-gray-300">Square 50 reached. Your path diverges here.</p>
                 <div className="flex gap-6">
                   <button 
                     onClick={() => handlePathSelection('SAFE')}
                     className="px-8 py-6 bg-blue-900/40 border-2 border-blue-500 rounded-2xl hover:bg-blue-800/80 transition-all hover:scale-105 shadow-[0_0_20px_rgba(0,100,255,0.4)]"
                   >
                     <h3 className="font-black text-blue-400 text-2xl mb-2">SAFE ROUTE</h3>
                     <p className="text-sm text-blue-200/80 font-mono">Small Jumps<br/>Small Traps</p>
                   </button>
                   <button 
                     onClick={() => handlePathSelection('DANGER')}
                     className="px-8 py-6 bg-red-900/40 border-2 border-red-500 rounded-2xl hover:bg-red-800/80 transition-all hover:scale-105 shadow-[0_0_20px_rgba(255,0,0,0.4)]"
                   >
                     <h3 className="font-black text-red-400 text-2xl mb-2">DANGER ZONE</h3>
                     <p className="text-sm text-red-200/80 font-mono">Massive Boosts<br/>Critical Falls</p>
                   </button>
                 </div>
               </div>
             )}

             {gameState === 'GAMEOVER' && (
               <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-8 text-center z-30 backdrop-blur-md">
                 <h2 className="text-6xl font-black text-yellow-400 mb-6 drop-shadow-[0_0_30px_rgba(255,215,0,0.8)] animate-pulse">VICTORY</h2>
                 <button 
                   onClick={startGame}
                   className="mt-6 px-10 py-4 bg-white text-black font-black rounded-full hover:scale-105 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.6)] tracking-widest text-xl"
                 >
                   REBOOT SYSTEM
                 </button>
               </div>
             )}
          </div>

          {/* RIGHT SIDEBAR - CONTROLS */}
          <div className="flex flex-col gap-4 w-full lg:w-64">
             <div className="bg-gradient-to-b from-white/10 to-black/80 rounded-2xl p-6 border border-white/10 text-center flex flex-col items-center justify-center flex-1 backdrop-blur-md shadow-[0_0_30px_rgba(0,0,0,0.5)] relative overflow-hidden">
               
               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-70"></div>

               <div className="text-cyan-400 mb-8 font-mono font-bold tracking-[0.3em] text-sm bg-black/50 px-4 py-1 rounded-full border border-cyan-500/30">
                 ROUND {roundCounter}
               </div>
               
               <div className="flex gap-4 mb-10 min-h-[80px] items-center justify-center">
                 {diceRolls[0] !== null ? renderDiceIcon(diceRolls[0], isAnimating) : <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-white/20 bg-white/5" />}
                 {players[activePlayerIndex]?.doubleDash && (
                   diceRolls[1] !== null ? renderDiceIcon(diceRolls[1], isAnimating) : <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-white/20 bg-white/5" />
                 )}
               </div>

               <button
                 onClick={rollDice}
                 disabled={isAnimating || gameState !== 'PLAYING' || showPathModal}
                 className={`w-full py-5 rounded-2xl font-black text-xl transition-all duration-300 shadow-xl flex items-center justify-center gap-3 border-2
                   ${isAnimating || showPathModal
                     ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed' 
                     : 'bg-gradient-to-r from-cyan-400 to-blue-500 border-cyan-300 text-black hover:scale-105 hover:shadow-[0_0_30px_rgba(0,255,255,0.6)]'
                   }`}
               >
                 <Shuffle size={24} className={isAnimating ? 'animate-spin' : ''} />
                 {isAnimating ? 'CALCULATING...' : 'ROLL DICE'}
               </button>
               
               <div className="mt-8 text-xs font-black tracking-widest uppercase py-2 px-4 rounded-lg bg-black/40 border border-white/10 flex items-center gap-2" style={{ color: players[activePlayerIndex]?.color }}>
                 <div className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: players[activePlayerIndex]?.color }}></div>
                 {players[activePlayerIndex]?.name}'S TURN
               </div>
             </div>
          </div>

        </div>
      )}
    </div>
  );
}