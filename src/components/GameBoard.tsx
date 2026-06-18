import React, { useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, Volume2, VolumeX, Trophy, Shield, Pause, Sparkles } from 'lucide-react';
import { GameState, Player, Obstacle, Coin, Particle, GameSettings, ControlMode, ObstacleType } from '../types';
import { playSound, bgm } from '../game/AudioSynth';

interface GameBoardProps {
  controlMode: ControlMode;
  jumpTriggered: boolean;
  clearJumpTrigger: () => void;
  duckTriggered: boolean;
  clearDuckTrigger: () => void;
  fireTriggered: boolean;
  clearFireTrigger: () => void;
  settings: GameSettings;
  setSettings: React.Dispatch<React.SetStateAction<GameSettings>>;
  webcamStream?: MediaStream | null;
}

interface HighScore {
  name: string;
  score: number;
  date: string;
}

export default function GameBoard({
  controlMode,
  jumpTriggered,
  clearJumpTrigger,
  duckTriggered,
  clearDuckTrigger,
  fireTriggered,
  clearFireTrigger,
  settings,
  setSettings,
  webcamStream,
}: GameBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameVideoRef = useRef<HTMLVideoElement | null>(null);

  // Sync webcam stream to game video element
  useEffect(() => {
    if (gameVideoRef.current) {
      gameVideoRef.current.srcObject = webcamStream || null;
      if (webcamStream) {
        gameVideoRef.current.play().catch((err) => {
          console.warn('Game PIP webcam play failed:', err);
        });
      }
    }
  }, [webcamStream]);

  // Score states
  const [currentScore, setCurrentScore] = useState<number>(0);
  const [currentCoins, setCurrentCoins] = useState<number>(0);
  const [gameState, setGameState] = useState<GameState>('START');
  const [highScores, setHighScores] = useState<HighScore[]>([]);
  const [newHighScoreName, setNewHighScoreName] = useState<string>('');
  const [hasNewHighScore, setHasNewHighScore] = useState<boolean>(false);

  // References for live game state variables to avoid React recreation triggers
  const stateRef = useRef<{
    player: Player;
    obstacles: Obstacle[];
    coins: Coin[];
    particles: Particle[];
    groundOffset: number;
    speed: number;
    spawnTimer: number;
    coinSpawnTimer: number;
    lastScoreMilestone: number;
    stars: { x: number; y: number; size: number; speed: number }[];
    clouds: { x: number; y: number; width: number; speed: number }[];
    duckActive: boolean;
    projectiles: { x: number; y: number; vx: number; vy: number; radius: number }[];
    fireCooldown: number;
  }>({
    player: {
      y: 0,
      vy: 0,
      width: 44,
      height: 48,
      state: 'RUNNING',
      score: 0,
      coins: 0,
      distance: 0,
      lastJumpTime: 0,
    },
    obstacles: [],
    coins: [],
    particles: [],
    groundOffset: 0,
    speed: settings.baseSpeed,
    spawnTimer: 0,
    coinSpawnTimer: 0,
    lastScoreMilestone: 0,
    stars: [],
    clouds: [],
    duckActive: false,
    projectiles: [],
    fireCooldown: 0,
  });

  const lastTimeRef = useRef<number>(0);
  const requestRef = useRef<number | null>(null);

  // Initializing Parallax background objects
  useEffect(() => {
    // Generate stars/planets
    const stars = Array.from({ length: 40 }).map(() => ({
      x: Math.random() * 800,
      y: Math.random() * 125,
      size: Math.random() * 2 + 1,
      speed: Math.random() * 0.15 + 0.05,
    }));

    // Generate clouds
    const clouds = Array.from({ length: 5 }).map((_, i) => ({
      x: i * 200 + Math.random() * 100,
      y: 30 + Math.random() * 50,
      width: 50 + Math.random() * 40,
      speed: Math.random() * 0.4 + 0.1,
    }));

    stateRef.current.stars = stars;
    stateRef.current.clouds = clouds;

    // Load Highscores from local storage
    const savedScores = localStorage.getItem('tm_platformer_highscores');
    if (savedScores) {
      setHighScores(JSON.parse(savedScores));
    } else {
      const defaultScores: HighScore[] = [
        { name: 'AAA', score: 350, date: '2026-06-15' },
        { name: 'ROB', score: 200, date: '2026-06-15' },
        { name: 'NES', score: 100, date: '2026-06-15' },
      ];
      setHighScores(defaultScores);
      localStorage.setItem('tm_platformer_highscores', JSON.stringify(defaultScores));
    }
  }, []);

  // Sync retro background music with game state and player preferences
  useEffect(() => {
    if (gameState === 'RUNNING' && settings.audioEnabled) {
      bgm.start();
      bgm.setMuted(false);
    } else {
      bgm.stop();
    }

    return () => {
      bgm.stop();
    };
  }, [gameState, settings.audioEnabled]);

  // Keyboard controls listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== 'RUNNING') {
        if (e.code === 'KeyP' && gameState === 'PAUSED') {
          setGameState('RUNNING');
        } else if (e.code === 'Space' && gameState === 'START') {
          startGame();
        }
        return;
      }

      if (e.code === 'ArrowUp' || e.code === 'Space') {
        e.preventDefault();
        triggerPlayerJump();
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        triggerPlayerDuck(true);
      } else if (e.code === 'KeyF' || e.code === 'KeyX' || e.code === 'ShiftLeft') {
        e.preventDefault();
        triggerPlayerShootFire();
      } else if (e.code === 'KeyP') {
        setGameState('PAUSED');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowDown') {
        e.preventDefault();
        triggerPlayerDuck(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState]);

  // Hook up camera action signals
  useEffect(() => {
    if (jumpTriggered) {
      triggerPlayerJump();
      clearJumpTrigger();
    }
  }, [jumpTriggered]);

  useEffect(() => {
    if (duckTriggered) {
      triggerPlayerDuck(true);
      // Automatically lift back up after a short duration if running webcam model without clear release signals
      const timer = setTimeout(() => {
        triggerPlayerDuck(false);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [duckTriggered]);

  useEffect(() => {
    if (fireTriggered) {
      triggerPlayerShootFire();
      clearFireTrigger();
    }
  }, [fireTriggered]);

  // Player action triggers
  const triggerPlayerJump = () => {
    const game = stateRef.current;
    
    // Check ground proximity
    if (game.player.y === 0 && game.player.state !== 'CRASHED') {
      game.player.vy = settings.jumpForce * settings.jumpSensitivity;
      game.player.state = 'JUMPING';
      game.player.lastJumpTime = Date.now();
      if (settings.audioEnabled) {
        playSound.jump();
      }

      // Add puff particles on takeoff
      for (let i = 0; i < 8; i++) {
        game.particles.push({
          x: 100 + game.player.width / 2,
          y: 200,
          vx: (Math.random() - 0.5) * 4 - 2,
          vy: -Math.random() * 2,
          size: Math.random() * 4 + 3,
          color: '#e4e4e7',
          life: 0,
          maxLife: 20 + Math.random() * 15,
        });
      }
    }
  };

  const triggerPlayerDuck = (active: boolean) => {
    const game = stateRef.current;
    if (game.player.state === 'CRASHED') return;

    game.duckActive = active;

    if (active) {
      if (game.player.y > 0) {
        // Fast drop if in the air
        game.player.vy = -12;
      } else {
        game.player.state = 'DUCKING';
      }
      game.player.height = 24; // Squeeze collision height size
      if (settings.audioEnabled && Math.random() < 0.15) {
        playSound.duck();
      }
    } else {
      game.player.height = 48; // Restore height size
      if (game.player.y === 0) {
        game.player.state = 'RUNNING';
      }
    }
  };

  const triggerPlayerShootFire = () => {
    const game = stateRef.current;
    if (game.player.state === 'CRASHED' || gameState !== 'RUNNING') return;

    // Enforce cooldown (300ms) to avoid overlapping firing spams
    if (game.fireCooldown > 0) return;
    game.fireCooldown = 0.3; // 300ms cooldown

    if (settings.audioEnabled && (playSound as any).fire) {
      (playSound as any).fire();
    }

    const playerX = 100;
    const playerY = 200 - game.player.y - game.player.height / 2; // fired from mid-dino block

    game.projectiles.push({
      x: playerX + game.player.width,
      y: playerY,
      vx: game.speed + 9.0, // moving fast relative to game scroll speed
      vy: 0,
      radius: 8,
    });

    // Muzzle flash fire sparks
    for (let i = 0; i < 8; i++) {
      game.particles.push({
        x: playerX + game.player.width,
        y: playerY + (Math.random() - 0.5) * 6,
        vx: game.speed + (Math.random() * 4 + 2),
        vy: (Math.random() - 0.5) * 4,
        size: Math.random() * 4 + 4,
        color: i % 2 === 0 ? '#ff1d58' : '#f77737', // Neon pixel fire
        life: 0,
        maxLife: 12 + Math.random() * 8,
      });
    }
  };

  // Start complete game values
  const startGame = () => {
    const game = stateRef.current;
    game.player = {
      y: 0,
      vy: 0,
      width: 44,
      height: 48,
      state: 'RUNNING',
      score: 0,
      coins: 0,
      distance: 0,
      lastJumpTime: 0,
    };
    game.obstacles = [];
    game.coins = [];
    game.particles = [];
    game.projectiles = [];
    game.fireCooldown = 0;
    game.speed = settings.baseSpeed;
    game.spawnTimer = 40; // Initial delay buffer before first obstacle
    game.coinSpawnTimer = 60;
    game.lastScoreMilestone = 0;

    setCurrentScore(0);
    setCurrentCoins(0);
    setHasNewHighScore(false);
    setNewHighScoreName('');
    setGameState('RUNNING');
    lastTimeRef.current = performance.now();
  };

  // End game handler
  const triggerGameOver = () => {
    setGameState('GAME_OVER');
    if (settings.audioEnabled) {
      playSound.crash();
    }
    
    // Spawn gorgeous high-intensity retro debris!
    const game = stateRef.current;
    game.player.state = 'CRASHED';

    const bloodColor = '#f59e0b'; // Cyber gold/yellow pixel particles
    for (let i = 0; i < 30; i++) {
      game.particles.push({
        x: 100 + game.player.width / 2,
        y: 200 - game.player.y - game.player.height / 2,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12 - 4,
        size: Math.random() * 5 + 3,
        color: i % 3 === 0 ? '#ef4444' : i % 3 === 1 ? bloodColor : '#d97706',
        life: 0,
        maxLife: 40 + Math.random() * 30,
      });
    }

    // Check if score makes leaderboard
    const currentFinalScore = Math.floor(game.player.score);
    const isNewHighScore =
      highScores.length < 5 || currentFinalScore > (highScores[4]?.score || 0);
    
    if (isNewHighScore && currentFinalScore > 10) {
      setHasNewHighScore(true);
    }
  };

  // Submit high score helper
  const handleScoreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newHighScoreName.trim().toUpperCase().substring(0, 3) || 'YOU';
    const newRecord: HighScore = {
      name: cleanName,
      score: Math.floor(stateRef.current.player.score),
      date: new Date().toISOString().split('T')[0],
    };

    const updated = [...highScores, newRecord]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // top 5 entries

    setHighScores(updated);
    setHasNewHighScore(false);
    localStorage.setItem('tm_platformer_highscores', JSON.stringify(updated));
  };

  // The Physics and Animation loop
  useEffect(() => {
    if (gameState !== 'RUNNING') {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      return;
    }

    const loop = (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      
      // Fixed step speed sizing to prevent physics instability on lag
      const dt = Math.min(33, timestamp - lastTimeRef.current) / 16.666; 
      lastTimeRef.current = timestamp;

      updatePhysics(dt);
      drawGame(ctx, canvas);

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);
    
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, settings]);

  const updatePhysics = (dt: number) => {
    const game = stateRef.current;

    // 1. Progress Score & Distance speed scaling
    game.player.score += 0.15 * dt;
    game.player.distance += game.speed * 0.01 * dt;
    setCurrentScore(Math.floor(game.player.score));

    // Increase game speed difficulty level gradually
    game.speed = settings.baseSpeed + (game.player.score * 0.007) * settings.speedMultiplier;

    // Play retro beep every 100 milestone points!
    const scoreMilestone = Math.floor(game.player.score / 100) * 100;
    if (scoreMilestone > 0 && scoreMilestone > game.lastScoreMilestone) {
      game.lastScoreMilestone = scoreMilestone;
      if (settings.audioEnabled) {
        playSound.milestone();
      }
    }

    // 2. Playable Character Mechanics with Gravity Physics
    const gravity = settings.gravity;
    const prevY = game.player.y;
    game.player.y += game.player.vy * dt;
    
    if (game.player.y > 0) {
      game.player.vy -= gravity * dt; // Gravity pull
      game.player.state = 'JUMPING';
    } else {
      game.player.y = 0;
      game.player.vy = 0;
      if (prevY > 0) {
        // Just touched down from a jump - play 8-bit landing sound!
        if (settings.audioEnabled) {
          playSound.landing();
        }
      }
      if (game.duckActive) {
        game.player.state = 'DUCKING';
      } else {
        game.player.state = 'RUNNING';
      }
    }

    // Generate foot dust particles when running
    if (game.player.y === 0 && game.player.state === 'RUNNING' && Math.random() < 0.25 * dt) {
      game.particles.push({
        x: 100,
        y: 200,
        vx: -game.speed * 0.4 + (Math.random() - 0.5) * 1.5,
        vy: -Math.random() * 1.5,
        size: Math.random() * 3 + 2,
        color: '#71717a',
        life: 0,
        maxLife: 15 + Math.random() * 10,
      });
    }

    // 3. Spawners: Randomized Obstacle Logic with Safe Gap Limits
    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0) {
      spawnObstacle();
    }

    // Spawners: Coin Spawn logic
    game.coinSpawnTimer -= dt;
    if (game.coinSpawnTimer <= 0) {
      spawnCoins();
    }

    // 4. Update Obstacles Positions & Collision Checks
    for (let i = game.obstacles.length - 1; i >= 0; i--) {
      const obstacle = game.obstacles[i];
      obstacle.x -= game.speed * dt;
      obstacle.frameIndex += 0.1 * dt; // wing-flap cycle counters

      // Check collision coordinates
      const characterX = 100;
      const characterY = 200 - game.player.y; // invert coordinate systems for math
      
      const colBox = {
        left: characterX + 6,
        right: characterX + game.player.width - 6,
        top: characterY - game.player.height,
        bottom: characterY,
      };

      const obsBox = {
        left: obstacle.x + 4,
        right: obstacle.x + obstacle.width - 4,
        top: obstacle.y,
        bottom: obstacle.y + obstacle.height,
      };

      // Perfect bounding box intersection
      const collides =
        colBox.right >= obsBox.left &&
        colBox.left <= obsBox.right &&
        colBox.bottom >= obsBox.top &&
        colBox.top <= obsBox.bottom;

      if (collides) {
        triggerGameOver();
        return;
      }

      // Check off-screen passes
      if (obstacle.x + obstacle.width < 0) {
        game.obstacles.splice(i, 1);
      } else if (!obstacle.passed && obstacle.x + obstacle.width < 100) {
        obstacle.passed = true;
      }
    }

    // 4.5. Update Fire Cooldown & Fly Projectiles
    if (game.fireCooldown > 0) {
      game.fireCooldown -= dt * 0.016; // approximate decrement
      if (game.fireCooldown < 0) {
        game.fireCooldown = 0;
      }
    }

    for (let pIdx = game.projectiles.length - 1; pIdx >= 0; pIdx--) {
      const proj = game.projectiles[pIdx];
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;

      // Offscreen bounds check
      if (proj.x > 800) {
        game.projectiles.splice(pIdx, 1);
        continue;
      }

      let hitObstacle = false;

      // Obstacle collision hits check
      for (let oIdx = game.obstacles.length - 1; oIdx >= 0; oIdx--) {
        const obs = game.obstacles[oIdx];

        const obsBox = {
          left: obs.x + 4,
          right: obs.x + obs.width - 4,
          top: obs.y,
          bottom: obs.y + obs.height,
        };

        const projBox = {
          left: proj.x - proj.radius,
          right: proj.x + proj.radius,
          top: proj.y - proj.radius,
          bottom: proj.y + proj.radius,
        };

        const hit =
          projBox.right >= obsBox.left &&
          projBox.left <= obsBox.right &&
          projBox.bottom >= obsBox.top &&
          projBox.top <= obsBox.bottom;

        if (hit) {
          hitObstacle = true;

          // Sound effect!
          if (settings.audioEnabled) {
            if ((playSound as any).explosion) {
              (playSound as any).explosion();
            } else {
              playSound.crash(0.06);
            }
          }

          // Sparks explosion particles!
          for (let p = 0; p < 16; p++) {
            game.particles.push({
              x: obs.x + obs.width / 2,
              y: obs.y + obs.height / 2,
              vx: (Math.random() - 0.5) * 8,
              vy: (Math.random() - 0.5) * 8 - 1.5,
              size: Math.random() * 4 + 3,
              color: p % 3 === 0 ? '#ff1d58' : p % 3 === 1 ? '#f77737' : '#fbbf24',
              life: 0,
              maxLife: 20 + Math.random() * 12,
            });
          }

          // Vaporize obstacle
          game.obstacles.splice(oIdx, 1);
          
          // Boost score for a brilliant shot!
          game.player.score += 50;
          break;
        }
      }

      if (hitObstacle) {
        game.projectiles.splice(pIdx, 1);
      }
    }

    // 5. Update Coins Positions & Collection Checks
    for (let i = game.coins.length - 1; i >= 0; i--) {
      const coin = game.coins[i];
      coin.x -= game.speed * dt;
      coin.bobOffset += 0.08 * dt; // vertical hover bob effect

      // Check character overlaps with coins
      const characterX = 100;
      const characterY = 200 - game.player.y;

      const colBox = {
        left: characterX,
        right: characterX + game.player.width,
        top: characterY - game.player.height,
        bottom: characterY,
      };

      const coinBox = {
        left: coin.x,
        right: coin.x + coin.size,
        top: coin.y + Math.sin(coin.bobOffset) * 4,
        bottom: coin.y + coin.size + Math.sin(coin.bobOffset) * 4,
      };

      const colOverlap =
        colBox.right >= coinBox.left &&
        colBox.left <= coinBox.right &&
        colBox.bottom >= coinBox.top &&
        colBox.top <= coinBox.bottom;

      if (colOverlap) {
        // Collect Coin!
        game.player.coins += coin.value;
        game.player.score += 15; // bonus points!
        setCurrentCoins(game.player.coins);
        game.coins.splice(i, 1);

        if (settings.audioEnabled) {
          playSound.coin();
        }

        // Spawn gold glitter sparkles
        for (let s = 0; s < 6; s++) {
          game.particles.push({
            x: coin.x + coin.size / 2,
            y: coin.y + coin.size / 2,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            size: Math.random() * 3 + 1,
            color: '#fbbf24', // golden yellow sparkle
            life: 0,
            maxLife: 20,
          });
        }
        continue;
      }

      if (coin.x + coin.size < 0) {
        game.coins.splice(i, 1);
      }
    }

    // 6. Update Particle systems
    for (let i = game.particles.length - 1; i >= 0; i--) {
      const p = game.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life += dt;
      if (p.life >= p.maxLife) {
        game.particles.splice(i, 1);
      }
    }

    // 7. Ground Parallax offset
    game.groundOffset = (game.groundOffset + game.speed * dt) % 24;

    // 8. Parallax Background update
    game.stars.forEach((s) => {
      s.x = (s.x - s.speed * dt + 800) % 800;
    });

    game.clouds.forEach((c) => {
      c.x -= c.speed * dt;
      if (c.x + c.width < 0) {
        c.x = 800 + Math.random() * 100;
        c.y = 20 + Math.random() * 50;
      }
    });
  };

  // Spawn dynamic obstacle logic
  const spawnObstacle = () => {
    const game = stateRef.current;
    
    // Choose dynamic random obstacle types based on current difficulty score
    const options: ObstacleType[] = ['CACTUS_SINGLE', 'SPIKES'];
    if (game.player.score > 80) {
      options.push('CACTUS_DOUBLE');
    }
    if (game.player.score > 200) {
      options.push('PTERODACTYL_LOW');
      options.push('PTERODACTYL_HIGH');
    }

    const type = options[Math.floor(Math.random() * options.length)];
    let width = 24;
    let height = 36;
    let y = 200 - height; // ground height is 200 inside our 250 grid
    
    switch (type) {
      case 'CACTUS_SINGLE':
        width = 18;
        height = 36;
        y = 200 - height;
        break;
      case 'CACTUS_DOUBLE':
        width = 34;
        height = 40;
        y = 200 - height;
        break;
      case 'PTERODACTYL_HIGH':
        // High bird: requires crouching/ducking to dodge!
        width = 32;
        height = 24;
        y = 100; // floating high in flight lines
        break;
      case 'PTERODACTYL_LOW':
        // Low bird: requires jump to bypass
        width = 32;
        height = 24;
        y = 155; 
        break;
      case 'SPIKES':
        width = 28;
        height = 14;
        y = 200 - height;
        break;
    }

    game.obstacles.push({
      id: Math.random().toString(36),
      x: 820,
      y,
      width,
      height,
      type,
      speed: game.speed,
      passed: false,
      frameIndex: 0,
    });

    // Reset spawn timer with a random safe spacing buffer
    const minDelay = Math.max(35, 100 - game.speed * 4);
    const maxDelay = Math.max(70, 160 - game.speed * 4);
    game.spawnTimer = minDelay + Math.random() * (maxDelay - minDelay);
  };

  // Spawn collectable golden coins
  const spawnCoins = () => {
    const game = stateRef.current;
    if (Math.random() > 0.65) {
      game.coinSpawnTimer = 35 + Math.random() * 45;
      return; // Skip spawn
    }

    // Determine coin clusters
    const coinY = 110 + Math.random() * 50; // heights floating in jump corridors
    const length = Math.floor(Math.random() * 3) + 1; // 1-3 clusters of coins

    for (let idx = 0; idx < length; idx++) {
      // Ensure we don't spawn directly inside an obstacle
      const coinX = 820 + idx * 30;
      game.coins.push({
        id: Math.random().toString(36),
        x: coinX,
        y: coinY,
        size: 14,
        value: 1,
        collected: false,
        bobOffset: idx * 0.4,
      });
    }

    game.coinSpawnTimer = 55 + Math.random() * 50;
  };

  // Pure Canvas drawings
  const drawGame = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const game = stateRef.current;

    // Clear with soft premium warm cream background
    ctx.fillStyle = '#FAF7F2'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 1. Stars / Space background (Ambient)
    game.stars.forEach((s) => {
      ctx.fillStyle = s.size > 2.2 ? '#D4AF37' : '#8E9AA6';
      ctx.fillRect(s.x, s.y, s.size, s.size);
    });

    // 2. Parallax Mountains/Hills silhouette drawing
    ctx.fillStyle = '#EBE4D5'; // Subtle warm taupe grey layers
    ctx.beginPath();
    ctx.moveTo(0, 200);
    ctx.lineTo(80, 130);
    ctx.lineTo(190, 185);
    ctx.lineTo(280, 120);
    ctx.lineTo(390, 180);
    ctx.lineTo(480, 140);
    ctx.lineTo(580, 175);
    ctx.lineTo(690, 110);
    ctx.lineTo(800, 200);
    ctx.fill();

    // 3. Clouds drawing (8-bit style chunky coordinates)
    ctx.fillStyle = '#FFFFFF'; // Clean white clouds
    game.clouds.forEach((c) => {
      ctx.fillRect(c.x, c.y, c.width, 10);
      ctx.fillRect(c.x + 8, c.y - 6, c.width - 16, 6);
      ctx.fillRect(c.x + 16, c.y - 12, c.width - 32, 6);
    });

    // 4. Ground rendering with scrolling ground line dashes
    ctx.fillStyle = '#0B2545'; // Elegant Navy Blue Ground Boundary Bar
    ctx.fillRect(0, 200, canvas.width, 10); // Main ground boundary bar
    ctx.fillStyle = '#F3EDE0'; // Soft warm cream base bar for ground sub-layer
    ctx.fillRect(0, 210, canvas.width, 40);

    // Scrolling ground detail lines
    ctx.fillStyle = 'rgba(11, 37, 69, 0.15)';
    for (let posX = -game.groundOffset; posX < canvas.width; posX += 24) {
      if (posX > 0) {
        ctx.fillRect(posX, 204, 6, 2);
        ctx.fillRect(posX + 10, 214, 4, 1);
        ctx.fillRect(posX - 4, 225, 8, 2);
      }
    }

    // 5. Drawing Spawning Coins (Muted gold tokens)
    game.coins.forEach((coin) => {
      const activeY = coin.y + Math.sin(coin.bobOffset) * 4;

      // Draw Retro coin square outline
      ctx.fillStyle = '#D4AF37'; // gold
      ctx.fillRect(coin.x, activeY, coin.size, coin.size);

      // Inner details
      ctx.fillStyle = '#C5A028'; // darker gold center
      ctx.fillRect(coin.x + 3, activeY + 3, coin.size - 6, coin.size - 6);
      ctx.fillStyle = '#FFFFFF'; // sparkle
      ctx.fillRect(coin.x + 3, activeY + 3, 2, 2);
    });

    // 6. Drawing Spawning Obstacles (Elegant Navy & Muted details)
    game.obstacles.forEach((obs) => {
      ctx.fillStyle = '#0B2545'; // Navy main body

      if (obs.type === 'CACTUS_SINGLE') {
        // Draw single main trunk
        ctx.fillRect(obs.x + 6, obs.y, 6, obs.height);
        // Left arm
        ctx.fillRect(obs.x, obs.y + 10, 8, 4);
        ctx.fillRect(obs.x, obs.y + 4, 4, 6);
        // Right arm
        ctx.fillRect(obs.x + 10, obs.y + 16, 8, 4);
        ctx.fillRect(obs.x + 14, obs.y + 8, 4, 8);
        
        ctx.fillStyle = '#4F6D7A'; // secondary highlight tone
        ctx.fillRect(obs.x + 8, obs.y + 2, 2, obs.height - 2);
      } else if (obs.type === 'CACTUS_DOUBLE') {
        // Left cactus (Tall)
        ctx.fillStyle = '#134074';
        ctx.fillRect(obs.x + 4, obs.y, 6, obs.height);
        ctx.fillRect(obs.x, obs.y + 12, 6, 4);
        ctx.fillRect(obs.x, obs.y + 6, 4, 6);
        // Right cactus (Short)
        ctx.fillStyle = '#0B2545';
        ctx.fillRect(obs.x + 18, obs.y + 8, 6, obs.height - 8);
        ctx.fillRect(obs.x + 14, obs.y + 18, 6, 4);
        ctx.fillRect(obs.x + 14, obs.y + 12, 4, 6);
      } else if (obs.type === 'PTERODACTYL_LOW' || obs.type === 'PTERODACTYL_HIGH') {
        // Flapping pterodactyl retro bird details!
        ctx.fillStyle = '#B23B3B'; // elegant velvet crimson pterodactyl
        ctx.fillRect(obs.x + 6, obs.y + 8, 20, 8); // body torso
        ctx.fillRect(obs.x + 22, obs.y + 4, 8, 6); // head

        // Wing beak details
        ctx.fillStyle = '#D4AF37'; // gold beak
        ctx.fillRect(obs.x + 28, obs.y + 6, 4, 3);

        ctx.fillStyle = '#C85A5A'; // lighter wing details
        const flapCycle = Math.floor(obs.frameIndex) % 2 === 0;
        if (flapCycle) {
          // Wing up
          ctx.fillRect(obs.x + 10, obs.y - 6, 5, 14);
          ctx.fillRect(obs.x + 6, obs.y - 12, 5, 8);
        } else {
          // Wing down
          ctx.fillRect(obs.x + 10, obs.y + 12, 5, 14);
          ctx.fillRect(obs.x + 6, obs.y + 18, 5, 8);
        }
      } else if (obs.type === 'SPIKES') {
        // Elegant Slate Slate spikes
        ctx.fillStyle = '#8FA6B2';
        const spikesCount = 4;
        const spikeWidth = obs.width / spikesCount;
        for (let s = 0; s < spikesCount; s++) {
          ctx.beginPath();
          ctx.moveTo(obs.x + s * spikeWidth, obs.y + obs.height);
          ctx.lineTo(obs.x + s * spikeWidth + spikeWidth / 2, obs.y);
          ctx.lineTo(obs.x + (s + 1) * spikeWidth, obs.y + obs.height);
          ctx.fill();
        }
      }
    });

    // 7. Render Particles
    game.particles.forEach((p) => {
      ctx.fillStyle = p.color;
      // Interpolate fading particle alphas manually
      const lifePct = p.life / p.maxLife;
      if (lifePct < 0.8) {
        ctx.fillRect(p.x, p.y, p.size, p.size);
      } else {
        // Fading grid block dither effect
        if (Math.random() > 0.5) {
          ctx.fillRect(p.x, p.y, p.size - 1, p.size - 1);
        }
      }
    });

    // 7.5. Render Fireball Projectiles
    game.projectiles.forEach((p) => {
      // Outer brick red glow edge
      ctx.fillStyle = '#B23B3B';
      ctx.fillRect(p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);

      // Inner warm gold center core
      ctx.fillStyle = '#D4AF37';
      ctx.fillRect(p.x - p.radius + 2, p.y - p.radius + 2, (p.radius - 2) * 2, (p.radius - 2) * 2);

      // Sparkling warm cream center glow
      ctx.fillStyle = '#FAF7F2';
      ctx.fillRect(p.x - p.radius + 4, p.y - p.radius + 4, (p.radius - 4) * 2, (p.radius - 4) * 2);
    });

    // 8. Drawing Player Character (8-bit style canvas pixels - Navy Blue & highlights)
    const playerY = 200 - game.player.y;
    const isDucking = game.player.state === 'DUCKING';
    
    ctx.shadowBlur = 0; // Prevent canvas blurring

    if (game.player.state === 'CRASHED') {
      // Draw crashed/dead runner in brick crimson
      ctx.fillStyle = '#B23B3B'; 
      // Torso
      ctx.fillRect(100, playerY - 32, 40, 24);
      // Head tilted crash position
      ctx.fillRect(128, playerY - 42, 20, 16);
      // Legs crumpled
      ctx.fillRect(104, playerY - 8, 8, 8);
      ctx.fillRect(116, playerY - 8, 8, 8);

      // Dead eye details
      ctx.fillStyle = '#FAF7F2';
      ctx.fillRect(138, playerY - 36, 4, 4);
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(139, playerY - 35, 2, 2);
    } else if (isDucking) {
      // Ducking / Sliding character model sprite!
      ctx.fillStyle = '#0B2545'; // Navy Blue primary
      // Slashed flattened torso
      ctx.fillRect(94, playerY - 24, 44, 18);
      // Low head thrust forward
      ctx.fillRect(132, playerY - 24, 14, 12);
      ctx.fillStyle = '#FAF7F2'; // eye slit highlight
      ctx.fillRect(140, playerY - 20, 3, 3);

      // Moving low slider legs
      ctx.fillStyle = '#134074'; // Slate Navy highlight
      const rCycle = Math.floor(Date.now() / 80) % 2 === 0;
      if (rCycle) {
        ctx.fillRect(102, playerY - 6, 8, 6);
        ctx.fillRect(120, playerY - 6, 6, 3);
      } else {
        ctx.fillRect(102, playerY - 6, 6, 3);
        ctx.fillRect(120, playerY - 6, 8, 6);
      }
    } else {
      // Classic Standard standing dino/robot explorer!
      const explorerColor = '#0B2545'; // Elegant Deep Navy
      const shadowColor = '#134074'; // Muted Slate Blue highlights

      // Tail/Back plate
      ctx.fillStyle = shadowColor;
      ctx.fillRect(96, playerY - 36, 8, 20);

      // Core Torso
      ctx.fillStyle = explorerColor;
      ctx.fillRect(102, playerY - 42, 24, 30);

      // Head
      ctx.fillRect(114, playerY - 55, 22, 16);
      // Cheek highlight
      ctx.fillStyle = '#FAF7F2';
      ctx.fillRect(130, playerY - 51, 6, 6);
      ctx.fillStyle = '#1E293B'; // Navy blue eye
      ctx.fillRect(126, playerY - 51, 3, 3);

      // Running legs (Navy highlight)
      ctx.fillStyle = shadowColor;
      if (game.player.state === 'JUMPING') {
        // Legs tucked in mid-air
        ctx.fillRect(106, playerY - 12, 4, 8);
        ctx.fillRect(118, playerY - 12, 4, 8);
      } else {
        // Active Running strides
        const moveCycle = Math.floor(Date.now() / 110) % 2 === 0;
        if (moveCycle) {
          // Left step extended forward
          ctx.fillRect(104, playerY - 12, 4, 12);
          ctx.fillRect(104, playerY, 6, 3); // shoe foot
          
          ctx.fillRect(116, playerY - 12, 4, 6); // right leg bent upward
        } else {
          // Right step extended forward
          ctx.fillRect(104, playerY - 12, 4, 6);
          ctx.fillRect(104, playerY, 6, 3);
          
          ctx.fillRect(116, playerY - 12, 4, 12);
          ctx.fillRect(116, playerY, 6, 3);
        }
      }
    }
  };

  return (
    <div id="retro-gameplay-container" className="flex flex-col w-full select-none">
      {/* HUD Score Stats Dashboard bar */}
      <div className="w-full flex justify-between items-center bg-[#FAF8F5] border-x border-t border-[#E6DFD3] px-5 py-3.5 font-sans text-[11px] font-bold text-[#1E293B] uppercase tracking-wider leading-none shadow-2xs rounded-t-lg">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-[#0B2545]" />
            <span>SCORE: <b id="score-val" className="text-[#0B2545] font-extrabold text-base tracking-tight">{currentScore.toString().padStart(6, '0')}</b></span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#D4AF37]" />
            <span>COINS: <b id="coin-val" className="text-[#D4AF37] font-extrabold text-base tracking-tight">{currentCoins.toString().padStart(2, '0')}</b></span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Volume toggles */}
          <button
            id="audio-toggle-btn"
            onClick={() => setSettings((s) => ({ ...s, audioEnabled: !s.audioEnabled }))}
            className="p-1 px-2.5 bg-white hover:bg-[#FAF8F5] text-zinc-600 hover:text-[#0B2545] border border-[#E6DFD3] transition rounded-md font-sans text-[10px] shadow-3xs cursor-pointer"
          >
            {settings.audioEnabled ? (
              <span className="text-[#0B2545] flex items-center gap-1.5 text-[9px] font-extrabold uppercase"><Volume2 className="w-3.5 h-3.5" /> Static: ON</span>
            ) : (
              <span className="text-zinc-400 flex items-center gap-1.5 text-[9px] font-extrabold uppercase"><VolumeX className="w-3.5 h-3.5" /> Static: OFF</span>
            )}
          </button>
          
          <div className="px-3 py-1 bg-white text-zinc-500 border border-[#E6DFD3] text-[9px] uppercase tracking-wider rounded-md font-sans">
            CTRL: <span className="text-[#0B2545] font-bold">{controlMode}</span>
          </div>
        </div>
      </div>

      <div className="relative w-full bg-[#FAF7F2] border border-[#E6DFD3] overflow-hidden shadow-xs rounded-b-lg">
        {/* Canvas stage */}
        <canvas
          ref={canvasRef}
          width={800}
          height={250}
          className="w-full h-auto block"
          style={{ imageRendering: 'pixelated' }}
        />

        {/* Live Picture-in-Picture webcam stream positioned beside the runner (right side of character) */}
        {controlMode === 'TEACHABLE' && webcamStream && (
          <div
            id="gameplay-webcam-pip"
            className="absolute z-10 top-3 rounded-md overflow-hidden border border-[#E6DFD3] shadow-md bg-white/90 p-1 flex flex-col items-center animate-fade-in"
            style={{
              left: '21%', // Positioned elegantly just to the right of the runner (character is around 12.5% to 17.5%)
              width: '110px',
            }}
          >
            <div className="relative w-full aspect-video rounded bg-zinc-100 overflow-hidden">
              <video
                ref={gameVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <div className="mt-1 text-[8px] font-bold text-[#0B2545] tracking-widest uppercase font-display scale-95 selection:bg-transparent">
              LIVE POSITION
            </div>
          </div>
        )}

        {/* Start Game overlay */}
        {gameState === 'START' && (
          <div id="start-overlay" className="absolute inset-0 bg-[#FAF7F2]/95 backdrop-blur-[2px] flex flex-col items-center justify-center font-sans text-center p-6 z-20">
            <div className="text-[#0B2545] text-[10px] tracking-widest border border-[#0B2545]/20 px-3 py-1 font-bold mb-4 uppercase inline-block bg-[#0B2545]/5 rounded-full font-display">
              👾 Interactive Neural Runner
            </div>
            
            <h1 className="text-4xl font-extrabold text-[#0B2545] tracking-tight mb-2 leading-none font-display">
              Neural<span className="text-[#D4AF37]">Jump</span>
            </h1>
            <p className="text-[11px] text-zinc-500 max-w-[480px] mb-5 leading-relaxed font-sans">
              An interactive micro-arcade game controlled by artificial intelligence! Train your custom Teachable Machine model gestures to translate directly to game jumps, ducks, and fireballs, or play instantly with your keyboard.
            </p>

            {/* Retro styled keyboard/gesture mappings list */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-[500px] mb-6 text-left font-sans">
              <div className="bg-white border border-[#E6DFD3] p-3 rounded-lg shadow-2xs">
                <span className="text-[#0B2545] text-[10px] uppercase font-bold tracking-wider block mb-1 font-display">🦘 JUMP ACTION</span>
                <span className="text-[10px] text-zinc-500 leading-normal">Press <b className="text-zinc-800">SPACE / ↑</b><br/>or mimic <b className="text-[#0B2545]">"hand"</b> pose</span>
              </div>
              <div className="bg-white border border-[#E6DFD3] p-3 rounded-lg shadow-2xs">
                <span className="text-[#D4AF37] text-[10px] uppercase font-bold tracking-wider block mb-1 font-display">💤 DUCK DOWN</span>
                <span className="text-[10px] text-zinc-500 leading-normal">Press <b className="text-zinc-800">↓ / DOWN</b><br/>or mimic <b className="text-[#D4AF37]">"peace"</b> pose</span>
              </div>
              <div className="bg-white border border-[#E6DFD3] p-3 rounded-lg shadow-2xs">
                <span className="text-red-700 text-[10px] uppercase font-bold tracking-wider block mb-1 font-display">🔥 SHOOT PLASMA</span>
                <span className="text-[10px] text-zinc-500 leading-normal">Press <b className="text-zinc-800">F / SHIFT / X</b><br/>or mimic <b className="text-red-700">"index"</b> pose</span>
              </div>
            </div>

            <button
              id="start-arcade-btn"
              onClick={startGame}
              className="bg-[#0B2545] hover:bg-[#134074] text-white font-bold tracking-widest text-xs px-10 py-3.5 shadow-sm rounded-md uppercase hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer font-display"
            >
              <Play className="w-4 h-4 fill-current" /> PLAY ARCADE
            </button>
          </div>
        )}

        {/* Paused game overlay */}
        {gameState === 'PAUSED' && (
          <div id="paused-overlay" className="absolute inset-0 bg-[#FAF7F2]/95 backdrop-blur-[1px] flex flex-col items-center justify-center font-sans text-center z-15">
            <Pause className="w-12 h-12 text-[#0B2545] mb-3 animate-pulse" />
            <span className="text-sm font-semibold text-[#0B2545] uppercase tracking-widest font-display">Arcade Paused</span>
            <button
              id="resume-btn"
              onClick={() => {
                setGameState('RUNNING');
                lastTimeRef.current = performance.now();
              }}
              className="mt-4 px-6 py-2.5 bg-[#0B2545] hover:bg-[#134074] text-white font-bold text-xs uppercase rounded-md shadow-sm transition-all cursor-pointer font-display"
            >
              RESUME GAME
            </button>
          </div>
        )}

        {/* Game Over and High Score overlays */}
        {gameState === 'GAME_OVER' && (
          <div id="game-over-overlay" className="absolute inset-0 bg-[#FAF7F2]/95 flex flex-col items-center justify-center font-sans z-20 p-6 text-center">
            {hasNewHighScore ? (
              <form onSubmit={handleScoreSubmit} className="max-w-[340px] space-y-4 font-sans">
                <Trophy className="w-10 h-10 text-[#D4AF37] mx-auto animate-bounce" />
                <h2 className="text-xl font-extrabold uppercase text-[#0B2545] font-display tracking-tight">NEW RECORD UNLOCKED!</h2>
                <p className="text-[11px] text-[#4F6D7A] leading-normal font-sans">
                  You scored <b className="text-[#0B2545] font-bold text-sm">{Math.floor(stateRef.current.player.score)} pts</b>. Save your pilot tag:
                </p>
                <div className="flex gap-2 justify-center">
                  <input
                    id="highscore-tag-input"
                    type="text"
                    required
                    maxLength={3}
                    value={newHighScoreName}
                    onChange={(e) => setNewHighScoreName(e.target.value)}
                    placeholder="AAA"
                    className="bg-white border border-[#E6DFD3] text-center uppercase text-[#0B2545] font-bold px-4 py-1.5 text-base w-24 outline-none focus:border-[#0B2545] rounded-md transition"
                  />
                  <button
                    id="submit-record-btn"
                    type="submit"
                    className="bg-[#0B2545] hover:bg-[#134074] text-white uppercase font-bold px-5 py-2 text-xs rounded-md shadow-sm cursor-pointer transition-all font-display"
                  >
                    SUBMIT
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 font-sans">
                <h2 className="text-2xl font-extrabold text-red-700 tracking-tight font-display">PILOT CRASHED</h2>
                <div className="text-[11px] text-zinc-500 font-sans">
                  SCORE: <span className="text-[#0B2545] font-extrabold text-xs">{Math.floor(stateRef.current.player.score)}</span> | COINS: <span className="text-[#D4AF37] font-extrabold text-xs">{stateRef.current.player.coins}</span>
                </div>

                <div className="flex gap-3 justify-center pt-2">
                  <button
                    id="retry-arcade-btn"
                    onClick={startGame}
                    className="bg-[#0B2545] hover:bg-[#134074] text-white font-bold text-xs px-8 py-3 flex items-center gap-1.5 transition-all rounded-md shadow-sm cursor-pointer font-display"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> RETRY RUN
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Leaderboards Score table banner and Settings */}
      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-5 mt-5 font-sans">
        {/* High Scores Leaderboard Card */}
        <div id="leaderboard-card" className="bg-white border border-[#E6DFD3] p-5 rounded-lg shadow-2xs text-[#1E293B]">
          <h3 className="text-xs font-bold text-[#0B2545] flex items-center gap-1.5 uppercase border-b border-[#E6DFD3] pb-2.5 mb-4 font-display tracking-wider">
            <Trophy className="w-4 h-4 text-[#0B2545]" /> Arcade Leaderboard
          </h3>
          <div className="space-y-2 text-xs">
            {highScores.map((row, index) => (
              <div
                key={`${row.name}-${index}`}
                className={`flex justify-between items-center py-2 px-3 border border-transparent hover:border-[#E6DFD3] hover:bg-[#FAF8F5] transition-all rounded-md ${
                  index % 2 === 0 ? 'bg-[#FAF8F5]' : 'bg-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-zinc-400">#0{index + 1}</span>
                  <span className="font-bold text-[#0B2545] px-2 py-0.5 bg-white border border-[#E6DFD3] tracking-widest text-[10px] rounded">
                    {row.name}
                  </span>
                </div>
                <span className="font-bold text-[#0B2545]">{row.score} pts</span>
              </div>
            ))}
            {highScores.length === 0 && (
              <p className="text-[11px] text-zinc-400 text-center py-4">No highscores yet. Play to register one!</p>
            )}
          </div>
        </div>

        {/* Sandbox Physics Parameters Card */}
        <div id="physics-settings-card" className="bg-white border border-[#E6DFD3] p-5 rounded-lg shadow-2xs text-[#1E293B]">
          <h3 className="text-xs font-bold text-[#0B2545] flex items-center gap-1.5 uppercase border-b border-[#E6DFD3] pb-2.5 mb-4 font-display tracking-wider">
            <Shield className="w-4 h-4 text-[#0B2545]" /> Quantum Physics Tuning
          </h3>

          <div className="space-y-4 text-xs">
            {/* Gravity Slider */}
            <div>
              <div className="flex justify-between mb-1 text-[11px]">
                <span className="text-zinc-500 uppercase tracking-wide">Dino Gravity (Drop Speeds)</span>
                <span className="text-[#0B2545] font-bold">{settings.gravity.toFixed(2)}</span>
              </div>
              <input
                id="gravity-slider"
                type="range"
                min="0.3"
                max="1.5"
                step="0.05"
                value={settings.gravity}
                onChange={(e) => setSettings((s) => ({ ...s, gravity: parseFloat(e.target.value) }))}
                className="w-full h-1 bg-zinc-200 rounded-none appearance-none cursor-pointer accent-[#0B2545]"
              />
            </div>

            {/* Jump Height / Jump sensitivity multipliers */}
            <div>
              <div className="flex justify-between mb-1 text-[11px]">
                <span className="text-zinc-500 uppercase tracking-wide">Jump Force (Gravity Sensitivity)</span>
                <span className="text-[#0B2545] font-bold">{settings.jumpSensitivity.toFixed(2)}x</span>
              </div>
              <input
                id="jump-sensitivity-slider"
                type="range"
                min="0.5"
                max="2.0"
                step="0.05"
                value={settings.jumpSensitivity}
                onChange={(e) => setSettings((s) => ({ ...s, jumpSensitivity: parseFloat(e.target.value) }))}
                className="w-full h-1 bg-zinc-200 rounded-none appearance-none cursor-pointer accent-[#0B2545]"
              />
            </div>

            {/* Game Speed progressions slider multiplier */}
            <div>
              <div className="flex justify-between mb-1 text-[11px]">
                <span className="text-zinc-500 uppercase tracking-wide">Rate of Speed Acceleration</span>
                <span className="text-[#0B2545] font-bold">{settings.speedMultiplier.toFixed(1)}x</span>
              </div>
              <input
                id="speed-mult-slider"
                type="range"
                min="0.0"
                max="3.0"
                step="0.2"
                value={settings.speedMultiplier}
                onChange={(e) => setSettings((s) => ({ ...s, speedMultiplier: parseFloat(e.target.value) }))}
                className="w-full h-1 bg-zinc-200 rounded-none appearance-none cursor-pointer accent-[#0B2545]"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
