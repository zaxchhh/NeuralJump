/**
 * Global TypeScript definitions for the Teachable Machine 8-Bit Platformer.
 */

export type GameState = 'START' | 'RUNNING' | 'PAUSED' | 'GAME_OVER';

export type PlayerState = 'RUNNING' | 'JUMPING' | 'DUCKING' | 'CRASHED';

export interface Player {
  y: number;
  vy: number;
  width: number;
  height: number;
  state: PlayerState;
  score: number;
  coins: number;
  distance: number;
  lastJumpTime: number;
}

export type ObstacleType = 'CACTUS_SINGLE' | 'CACTUS_DOUBLE' | 'PTERODACTYL_HIGH' | 'PTERODACTYL_LOW' | 'SPIKES';

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: ObstacleType;
  speed: number;
  passed: boolean;
  frameIndex: number;
}

export interface Coin {
  id: string;
  x: number;
  y: number;
  size: number;
  value: number;
  collected: boolean;
  bobOffset: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface ModelConfig {
  url: string;
  type: 'image' | 'pose';
  jumpClass: string;
  duckClass: string;
  fireClass: string;
  jumpThreshold: number;
  duckThreshold: number;
  fireThreshold: number;
  inferenceIntervalMs: number;
}

export interface Prediction {
  className: string;
  probability: number;
}

export type ControlMode = 'KEYBOARD' | 'TEACHABLE';

export interface GameSettings {
  gravity: number;
  baseSpeed: number;
  speedMultiplier: number;
  jumpForce: number;
  jumpSensitivity: number; // multiplier for sensitivity
  audioEnabled: boolean;
}
