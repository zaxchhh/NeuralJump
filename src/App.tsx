import React, { useState } from 'react';
import { BrainCircuit } from 'lucide-react';
import GameBoard from './components/GameBoard';
import TeachableController from './components/TeachableController';
import { ControlMode, ModelConfig, GameSettings } from './types';

export default function App() {
  const [controlMode, setControlMode] = useState<ControlMode>('KEYBOARD');
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  
  // Custom triggers to bridge inference output directly with physical actions in game loop
  const [jumpTriggered, setJumpTriggered] = useState<boolean>(false);
  const [duckTriggered, setDuckTriggered] = useState<boolean>(false);
  const [fireTriggered, setFireTriggered] = useState<boolean>(false);

  // default Teachable Machine configurations
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    url: '/model/',
    type: 'image',
    jumpClass: 'hand',
    duckClass: 'peace',
    fireClass: 'index',
    jumpThreshold: 0.80,
    duckThreshold: 0.80,
    fireThreshold: 0.80,
    inferenceIntervalMs: 80,
  });

  // Sandbox Physics config values
  const [settings, setSettings] = useState<GameSettings>({
    gravity: 0.75,
    baseSpeed: 5.5,
    speedMultiplier: 1.2,
    jumpForce: 13.5,
    jumpSensitivity: 1.0, // multiplier
    audioEnabled: true,
  });

  // Callback triggers for child controllers
  const handleJumpIntent = (percentConfidence: number) => {
    setJumpTriggered(true);
  };

  const handleDuckIntent = (percentConfidence: number) => {
    setDuckTriggered(true);
  };

  const handleFireIntent = (percentConfidence: number) => {
    setFireTriggered(true);
  };

  return (
    <div id="app-root-container" className="min-h-screen bg-[#FAF7F2] text-[#1E293B] flex flex-col items-center py-8 px-5">
      {/* Premium Minimalist Header in Navy & Cream Bento Style */}
      <header className="w-full max-w-[1100px] mb-8 bg-[#0B2545] border border-[#E6DFD3] p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden rounded-lg shadow-sm">
        {/* Fine gold corner decor */}
        <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-[#D4AF37]"></div>
        
        <div>
          <div className="flex items-center gap-3 mb-1.5 animate-fade-in">
            <span className="text-[#FAF7F2] text-[9px] tracking-widest font-extrabold uppercase bg-white/10 px-2.5 py-0.5 border border-white/20 rounded">
              Cognitive Motion V3.6
            </span>
          </div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-7 h-7 text-[#FAF7F2] shrink-0" />
            <h1 className="text-2xl md:text-3xl font-extrabold text-white select-none tracking-tight leading-none font-display">
              Neural<span className="text-[#D4AF37]">Jump</span>
            </h1>
          </div>
        </div>

        <div className="text-left md:text-right font-mono">
          <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-black">Interactive Intelligence Showcase</p>
          <p className="text-[11px] text-[#D4AF37] font-semibold tracking-wide mt-0.5">CUSTOM CLASSIFIER MODELS • WAVE-SYNTH COMPOSER • MULTI-GAIT MOTION</p>
        </div>
      </header>

      {/* Main Grid Content Panels (Bento Structure: Left 8 cols, Right 4 cols) */}
      <main className="w-full max-w-[1100px] grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Game Board (canvas + HUD + leaderboard + sandbox tuning inside) */}
        <section aria-label="Game Stage Module" className="lg:col-span-8 space-y-6">
          <GameBoard
            controlMode={controlMode}
            jumpTriggered={jumpTriggered}
            clearJumpTrigger={() => setJumpTriggered(false)}
            duckTriggered={duckTriggered}
            clearDuckTrigger={() => setDuckTriggered(false)}
            fireTriggered={fireTriggered}
            clearFireTrigger={() => setFireTriggered(false)}
            settings={settings}
            setSettings={setSettings}
            webcamStream={webcamStream}
          />
        </section>

        {/* Right Side: Webcam Teachable Machine Controller and Live video stream */}
        <section aria-label="Intel Classifier Settings" className="lg:col-span-4 self-stretch">
          <TeachableController
            controlMode={controlMode}
            setControlMode={setControlMode}
            modelConfig={modelConfig}
            setModelConfig={setModelConfig}
            onJumpIntent={handleJumpIntent}
            onDuckIntent={handleDuckIntent}
            onFireIntent={handleFireIntent}
            audioEnabled={settings.audioEnabled}
            onStreamChange={setWebcamStream}
          />
        </section>
      </main>

      {/* Modern Minimalist Footer */}
      <footer className="mt-12 text-center text-[10px] font-mono text-zinc-500 space-y-1.5 select-none">
        <p>© 2026 COGNITIVE CHROME EXPERIMENTS • SECURED LOCAL SANDBOX INFERENCE</p>
        <p>POWERED BY GOOGLE TENSORFLOW JS ENGINE & WEB AUDIO CHIP-SYNTH REGISTRY</p>
      </footer>
    </div>
  );
}
