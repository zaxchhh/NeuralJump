import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, Cpu, Link, Key, Sliders, CheckCircle, AlertTriangle } from 'lucide-react';
import { ControlMode, ModelConfig, Prediction } from '../types';

interface TeachableControllerProps {
  controlMode: ControlMode;
  setControlMode: (mode: ControlMode) => void;
  modelConfig: ModelConfig;
  setModelConfig: React.Dispatch<React.SetStateAction<ModelConfig>>;
  onJumpIntent: (sourcePercent: number) => void;
  onDuckIntent: (sourcePercent: number) => void;
  onFireIntent: (sourcePercent: number) => void;
  audioEnabled: boolean;
  onStreamChange?: (stream: MediaStream | null) => void;
}

export default function TeachableController({
  controlMode,
  setControlMode,
  modelConfig,
  setModelConfig,
  onJumpIntent,
  onDuckIntent,
  onFireIntent,
  audioEnabled,
  onStreamChange,
}: TeachableControllerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // States
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [modelError, setModelError] = useState<string | null>(null);
  const [classLabels, setClassLabels] = useState<string[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isWebcamActive, setIsWebcamActive] = useState<boolean>(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);

  // References to loaded TM models (stored in refs to prevent triggering cycle re-renders)
  const loadedImageModel = useRef<any>(null);
  const loadedPoseModel = useRef<any>(null);
  const inferenceLoopRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastInferenceTimeRef = useRef<number>(0);
  const lastAttemptedUrlRef = useRef<string>('');

  // Stop camera tracks helper
  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsWebcamActive(false);
    onStreamChange?.(null);
  };

  // Start webcam streams
  const startWebcam = async () => {
    stopWebcam();
    try {
      setWebcamError(null);
      const constraints = {
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: 'user',
        },
        audio: false,
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsWebcamActive(true);
      }
      onStreamChange?.(stream);
    } catch (err: any) {
      console.error('Webcam access error:', err);
      setWebcamError('Could not start camera. Please verify permission settings.');
      onStreamChange?.(null);
    }
  };

  // Handle mode transitions
  useEffect(() => {
    if (controlMode === 'KEYBOARD') {
      stopWebcam();
    } else {
      startWebcam();
    }
    return () => stopWebcam();
  }, [controlMode]);

  // Load custom teachable machine model
  const loadTeachableModel = async () => {
    const baseUrl = modelConfig.url.trim();
    if (!baseUrl) {
      setModelError('Please input a valid URL first.');
      return;
    }

    // Format URL correctly
    let formattedUrl = baseUrl;
    
    // Normalize public folder prefix if mistakenly included on local relative routes
    if (formattedUrl.startsWith('public/')) {
      formattedUrl = formattedUrl.substring(7);
    } else if (formattedUrl.startsWith('./public/')) {
      formattedUrl = formattedUrl.substring(9);
    } else if (formattedUrl.startsWith('../public/')) {
      formattedUrl = formattedUrl.substring(10);
    }

    if (!formattedUrl.endsWith('/')) {
      formattedUrl += '/';
    }

    // Ensure local paths resolve correctly relative to host root
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://') && !formattedUrl.startsWith('/')) {
      formattedUrl = '/' + formattedUrl;
    }

    try {
      setModelError(null);
      setModelStatus('loading');
      loadedImageModel.current = null;
      loadedPoseModel.current = null;

      const modelJsonURL = `${formattedUrl}model.json`;
      const metadataURL = `${formattedUrl}metadata.json`;

      if (modelConfig.type === 'image') {
        const tmImage = (window as any).tmImage;
        if (!tmImage) {
          throw new Error('Teachable Machine Image library is not loaded from CDN yet.');
        }
        const model = await tmImage.load(modelJsonURL, metadataURL);
        loadedImageModel.current = model;
        const labels = model.getClassLabels();
        setClassLabels(labels);
        setPredictions(labels.map((l: string) => ({ className: l, probability: 0 })));
        
        // Auto-assign default mappings with high preference for requested gestures: hand, peace, index
        const guessJump = labels.find((l: string) => /hand/i.test(l)) || labels.find((l: string) => /jump|up|fly/i.test(l)) || labels[0] || '';
        let guessDuck = labels.find((l: string) => /peace/i.test(l)) || labels.find((l: string) => /duck|down|crouch/i.test(l)) || labels[1] || '';
        if (guessDuck === guessJump && labels.length > 1) {
          guessDuck = labels[1];
        }
        let guessFire = labels.find((l: string) => /index/i.test(l)) || labels.find((l: string) => /fire|shoot/i.test(l)) || labels[2] || '';
        if ((guessFire === guessJump || guessFire === guessDuck) && labels.length > 2) {
          guessFire = labels.find((l: string) => l !== guessJump && l !== guessDuck) || labels[2];
        }
        setModelConfig((prev) => ({
          ...prev,
          jumpClass: guessJump,
          duckClass: guessDuck,
          fireClass: guessFire,
        }));
      } else {
        const tmPose = (window as any).tmPose;
        if (!tmPose) {
          throw new Error('Teachable Machine Pose library is not loaded from CDN yet.');
        }
        const model = await tmPose.load(modelJsonURL, metadataURL);
        loadedPoseModel.current = model;
        const labels = model.getClassLabels();
        setClassLabels(labels);
        setPredictions(labels.map((l: string) => ({ className: l, probability: 0 })));

        // Auto-assign defaults for poses
        const guessJump = labels.find((l: string) => /hand/i.test(l)) || labels.find((l: string) => /jump|up/i.test(l)) || labels[0] || '';
        let guessDuck = labels.find((l: string) => /peace/i.test(l)) || labels.find((l: string) => /duck|down/i.test(l)) || labels[1] || '';
        if (guessDuck === guessJump && labels.length > 1) {
          guessDuck = labels[1];
        }
        let guessFire = labels.find((l: string) => /index/i.test(l)) || labels.find((l: string) => /fire|shoot/i.test(l)) || labels[2] || '';
        if ((guessFire === guessJump || guessFire === guessDuck) && labels.length > 2) {
          guessFire = labels.find((l: string) => l !== guessJump && l !== guessDuck) || labels[2];
        }
        setModelConfig((prev) => ({
          ...prev,
          jumpClass: guessJump,
          duckClass: guessDuck,
          fireClass: guessFire,
        }));
      }

      setModelStatus('loaded');
    } catch (err: any) {
      console.error('Model load error:', err);
      setModelStatus('error');
      setModelError(err?.message || 'Failed to load assets. Verify model type and connection.');
    }
  };

  // Auto-initiate model loading if a URL is provided in the source code or changes
  useEffect(() => {
    const trimmedUrl = modelConfig.url.trim();
    if (controlMode === 'TEACHABLE' && trimmedUrl !== '' && (modelStatus === 'idle' || trimmedUrl !== lastAttemptedUrlRef.current)) {
      lastAttemptedUrlRef.current = trimmedUrl;
      loadTeachableModel();
    }
  }, [controlMode, modelConfig.url, modelStatus]);

  // Inference background / Animation loops
  useEffect(() => {
    const processFrame = async () => {
      if (!videoRef.current || videoRef.current.readyState < 3) {
        inferenceLoopRef.current = requestAnimationFrame(processFrame);
        return;
      }

      const now = performance.now();

      // Ensure we don't overwork the browser by checking inference intervals
      const timeElapsed = now - lastInferenceTimeRef.current;
      const expectedInterval = modelConfig.inferenceIntervalMs;

      if (timeElapsed >= expectedInterval) {
        lastInferenceTimeRef.current = now;

        if (controlMode === 'TEACHABLE' && modelStatus === 'loaded') {
          // Run custom Teachable Machine network prediction
          await runTeachableInference();
        }
      }

      inferenceLoopRef.current = requestAnimationFrame(processFrame);
    };

    inferenceLoopRef.current = requestAnimationFrame(processFrame);

    return () => {
      if (inferenceLoopRef.current) {
        cancelAnimationFrame(inferenceLoopRef.current);
      }
    };
  }, [controlMode, modelStatus, modelConfig, classLabels]);

  // Run TM classification
  const runTeachableInference = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      let runPredictions: any[] = [];

      if (modelConfig.type === 'image' && loadedImageModel.current) {
        runPredictions = await loadedImageModel.current.predict(video);
      } else if (modelConfig.type === 'pose' && loadedPoseModel.current) {
        const { posenetOutput } = await loadedPoseModel.current.estimatePose(video);
        runPredictions = await loadedPoseModel.current.predict(posenetOutput);
      }

      if (runPredictions && runPredictions.length > 0) {
        const mappedPredictions: Prediction[] = runPredictions.map((pred: any) => ({
          className: pred.className,
          probability: parseFloat(pred.probability),
        }));

        setPredictions(mappedPredictions);

        // Find matches against configured labels
        const jumpPred = mappedPredictions.find((p) => p.className === modelConfig.jumpClass);
        const duckPred = mappedPredictions.find((p) => p.className === modelConfig.duckClass);
        const firePred = mappedPredictions.find((p) => p.className === modelConfig.fireClass);

        if (jumpPred && jumpPred.probability >= modelConfig.jumpThreshold) {
          onJumpIntent(Math.round(jumpPred.probability * 100));
        }

        if (duckPred && duckPred.probability >= modelConfig.duckThreshold) {
          onDuckIntent(Math.round(duckPred.probability * 100));
        }

        if (firePred && firePred.probability >= modelConfig.fireThreshold) {
          onFireIntent(Math.round(firePred.probability * 100));
        }
      }
    } catch (err) {
      console.error('Inference run error:', err);
    }
  };

  return (
    <div id="teachable-controller" className="bg-white border border-[#E6DFD3] p-6 bento-grid-item font-sans text-[#1E293B]">
      <h3 className="text-sm font-semibold text-[#0B2545] mb-5 flex items-center gap-2 border-b border-[#E6DFD3] pb-3.5 font-display uppercase tracking-wider">
        <Cpu id="cpu-icon" className="w-4.5 h-4.5 text-[#0B2545]" /> Interface Configuration
      </h3>

      <div className="flex flex-col gap-6">
        {/* Controls Column */}
        <div className="space-y-4 w-full">
          {/* Mode Selector */}
          <div>
            <span className="text-[10px] text-zinc-400 block mb-2 font-bold uppercase tracking-widest font-display">Control Input Mode</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                id="mode-keyboard-btn"
                onClick={() => setControlMode('KEYBOARD')}
                className={`flex flex-col items-center justify-center py-3 px-1 border text-[10px] uppercase font-bold tracking-wider transition-all rounded-md leading-tight cursor-pointer ${
                  controlMode === 'KEYBOARD'
                    ? 'bg-[#0B2545] text-white border-[#0B2545] shadow-xs'
                    : 'bg-[#FAF8F5] text-zinc-500 border-[#E6DFD3] hover:border-[#0B2545] hover:text-[#0B2545]'
                }`}
              >
                <Key className="w-3.5 h-3.5 mb-1 shrink-0" />
                KEYBOARD
              </button>
              <button
                id="mode-teachable-btn"
                onClick={() => setControlMode('TEACHABLE')}
                className={`flex flex-col items-center justify-center py-3 px-1 border text-[10px] uppercase font-bold tracking-wider transition-all rounded-md leading-tight cursor-pointer ${
                  controlMode === 'TEACHABLE'
                    ? 'bg-[#0B2545] text-white border-[#0B2545] shadow-xs'
                    : 'bg-[#FAF8F5] text-zinc-500 border-[#E6DFD3] hover:border-[#0B2545] hover:text-[#0B2545]'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 mb-1 shrink-0" />
                NEURAL MODEL
              </button>
            </div>
          </div>

          {/* Description panels dependent on Mode */}
          {controlMode === 'KEYBOARD' && (
            <div className="p-4 bg-[#FAF8F5] border border-[#E6DFD3] text-xs leading-relaxed text-zinc-600 rounded-lg">
              <p className="font-bold text-[#0B2545] mb-2.5 uppercase tracking-wider text-[10px] font-display">🎮 Assigned Keyboard Commands:</p>
              <ul className="list-none space-y-1 text-zinc-600">
                <li className="flex justify-between items-center py-1.5 border-b border-zinc-100 last:border-0">
                  <span className="text-[10px] font-semibold">JUMP</span>
                  <kbd className="px-2 py-0.5 bg-white border border-zinc-200 text-[#0B2545] font-bold text-[9px] font-mono rounded">SPACE / UP</kbd>
                </li>
                <li className="flex justify-between items-center py-1.5 border-b border-zinc-100 last:border-0">
                  <span className="text-[10px] font-semibold">DUCK & CRASH</span>
                  <kbd className="px-2 py-0.5 bg-white border border-zinc-200 text-[#D4AF37] font-bold text-[9px] font-mono rounded">DOWN ARROW</kbd>
                </li>
                <li className="flex justify-between items-center py-1.5 border-b border-zinc-100 last:border-0">
                  <span className="text-[10px] font-semibold text-red-700">FIRE DISCHARGE</span>
                  <kbd className="px-2 py-0.5 bg-white border border-zinc-200 text-red-700 font-bold text-[9px] font-mono rounded">F / SHIFT / X</kbd>
                </li>
                <li className="flex justify-between items-center py-1.5 border-b border-zinc-100 last:border-0">
                  <span className="text-[10px] font-semibold">PAUSE SESSION</span>
                  <kbd className="px-2 py-0.5 bg-white border border-zinc-200 text-zinc-600 font-bold text-[9px] font-mono rounded">P</kbd>
                </li>
              </ul>
            </div>
          )}

          {controlMode === 'TEACHABLE' && (
            <div className="space-y-4">
              {/* Teachable URL Form */}
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-400 flex items-center gap-1.5 uppercase font-bold tracking-wider font-display">
                  <Link className="w-3.5 h-3.5 text-[#0B2545]" /> Model Source Asset Path
                </label>
                <div className="flex flex-col gap-2 p-3 bg-[#FAF8F5] border border-[#E6DFD3] rounded-lg">
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[9px] font-bold text-zinc-500 uppercase tracking-wider">
                      <span>Model URL or Local Path:</span>
                    </div>
                    <input
                      id="model-url-input"
                      type="text"
                      className="w-full text-xs font-mono px-2.5 py-1.5 bg-white border border-[#E6DFD3] rounded-md text-zinc-700 focus:border-[#0B2545] outline-none"
                      placeholder="e.g. /model/ or https://teachablemachine..."
                      value={modelConfig.url}
                      onChange={(e) => setModelConfig((prev) => ({ ...prev, url: e.target.value }))}
                    />
                  </div>
                  <button
                    id="load-tm-model-btn"
                    onClick={loadTeachableModel}
                    disabled={modelStatus === 'loading'}
                    className="w-full bg-[#0B2545] hover:bg-[#134074] text-white font-bold text-xs py-2 border border-transparent transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer rounded-md shadow-xs"
                  >
                    {modelStatus === 'loading' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      'INITIALIZE NEURAL INTERFACE'
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-5 text-xs pt-1">
                  <span className="text-zinc-500 font-bold uppercase text-[9px] tracking-wider font-display">Structure:</span>
                  <label className="flex items-center gap-1.5 cursor-pointer text-zinc-600 text-[11px]">
                    <input
                      id="type-image-radio"
                      type="radio"
                      name="modelType"
                      checked={modelConfig.type === 'image'}
                      onChange={() => setModelConfig((prev) => ({ ...prev, type: 'image' }))}
                      className="accent-[#0B2545]"
                    />
                    Image Classification
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-zinc-600 text-[11px]">
                    <input
                      id="type-pose-radio"
                      type="radio"
                      name="modelType"
                      checked={modelConfig.type === 'pose'}
                      onChange={() => setModelConfig((prev) => ({ ...prev, type: 'pose' }))}
                      className="accent-[#0B2545]"
                    />
                    Pose Tracking
                  </label>
                </div>
              </div>

              {/* Load Status Banner */}
              {modelStatus === 'loading' && (
                <div className="p-3 bg-[#0B2545]/5 border border-[#0B2545]/20 text-xs text-[#0B2545] rounded-lg flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#0B2545]" />
                  Importing Neural Network parameters...
                </div>
              )}

              {modelStatus === 'error' && (
                <div className="p-3 bg-red-50 border border-red-200 text-xs text-red-800 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4.5 h-4.5 text-red-600 shrink-0" />
                    <div>
                      <span className="font-bold block text-[10px] uppercase">Model Load Failed</span>
                      <span className="text-[10px] opacity-90">{modelError}</span>
                    </div>
                  </div>
                  {/* Troubleshooting Guide */}
                  <div className="pt-2 border-t border-red-100 text-[9px] text-red-700 space-y-1.5 leading-normal">
                    <span className="font-extrabold uppercase tracking-wide block mb-0.5 text-red-800">Local VS Code Troubleshooting:</span>
                    <p>• <b>Put in Public Folder:</b> Place your downloaded Teachable Machine model files (<code>model.json</code>, <code>metadata.json</code>, and <code>weights.bin</code>) in the project&apos;s <code>public/model/</code> directory.</p>
                    <p>• <b>Avoid file:// protocol:</b> Opening the <code>index.html</code> directly via double-clicking blocks relative asset fetches (CORS restrictions). Always serve the directory with a web server by running <code>npm run dev</code>.</p>
                    <p>• <b>Verify URL Direct Fetch:</b> Visit <code>http://localhost:3000/model/model.json</code> directly in your browser. If it throws a 404 error or displays the contents of <code>index.html</code>, the files are not in the correct folder.</p>
                  </div>
                </div>
              )}

              {modelStatus === 'loaded' && (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 rounded-lg flex items-center gap-2 font-sans font-medium">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    Model assets mapped successfully!
                  </div>

                  {/* Mapping Configs */}
                  <div className="p-4 bg-[#FAF8F5] border border-[#E6DFD3] rounded-lg space-y-4">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 border-b border-[#E6DFD3] pb-2 uppercase tracking-widest font-display">
                      <Sliders className="w-3.5 h-3.5 text-[#0B2545]" /> Parameter Map Config
                    </div>

                    {/* Stacked Control rows preventing horizontal squeezing */}
                    <div className="space-y-4">
                      {/* Jump Map */}
                      <div className="p-3 bg-white border border-[#E6DFD3] rounded-md">
                        <div className="flex justify-between items-center mb-1.5">
                          <label className="text-[10px] text-[#0B2545] font-bold uppercase tracking-wider font-display">
                            🦘 Action JUMP Class
                          </label>
                          <select
                            id="jump-class-select"
                            value={modelConfig.jumpClass}
                            onChange={(e) => setModelConfig((prev) => ({ ...prev, jumpClass: e.target.value }))}
                            className="bg-white text-zinc-700 text-[11px] p-1 border border-[#E6DFD3] rounded outline-none max-w-[140px] focus:border-[#0B2545]"
                          >
                            <option value="">-- No Action --</option>
                            {classLabels.map((lbl) => (
                              <option key={`jump-${lbl}`} value={lbl}>
                                {lbl}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="mt-1 flex items-center gap-3">
                          <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider shrink-0 min-w-[70px]">
                            THRESHOLD: {Math.round(modelConfig.jumpThreshold * 100)}%
                          </span>
                          <input
                            id="jump-threshold-slider"
                            type="range"
                            min="0.10"
                            max="0.99"
                            step="0.05"
                            value={modelConfig.jumpThreshold}
                            onChange={(e) => setModelConfig((prev) => ({ ...prev, jumpThreshold: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-zinc-200 rounded-none appearance-none cursor-pointer accent-[#0B2545]"
                          />
                        </div>
                      </div>

                      {/* Duck Map */}
                      <div className="p-3 bg-white border border-[#E6DFD3] rounded-md">
                        <div className="flex justify-between items-center mb-1.5">
                          <label className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-wider font-display">
                            💤 Action DUCK Class
                          </label>
                          <select
                            id="duck-class-select"
                            value={modelConfig.duckClass}
                            onChange={(e) => setModelConfig((prev) => ({ ...prev, duckClass: e.target.value }))}
                            className="bg-white text-zinc-700 text-[11px] p-1 border border-[#E6DFD3] rounded outline-none max-w-[140px] focus:border-[#D4AF37]"
                          >
                            <option value="">-- No Action --</option>
                            {classLabels.map((lbl) => (
                              <option key={`duck-${lbl}`} value={lbl}>
                                {lbl}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="mt-1 flex items-center gap-3">
                          <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider shrink-0 min-w-[70px]">
                            THRESHOLD: {Math.round(modelConfig.duckThreshold * 100)}%
                          </span>
                          <input
                            id="duck-threshold-slider"
                            type="range"
                            min="0.10"
                            max="0.99"
                            step="0.05"
                            value={modelConfig.duckThreshold}
                            onChange={(e) => setModelConfig((prev) => ({ ...prev, duckThreshold: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-zinc-200 rounded-none appearance-none cursor-pointer accent-[#D4AF37]"
                          />
                        </div>
                      </div>

                      {/* Shoot Fire Map */}
                      <div className="p-3 bg-white border border-[#E6DFD3] rounded-md">
                        <div className="flex justify-between items-center mb-1.5">
                          <label className="text-[10px] text-red-700 font-bold uppercase tracking-wider font-display">
                            🔥 Action FIRE Class
                          </label>
                          <select
                            id="fire-class-select"
                            value={modelConfig.fireClass}
                            onChange={(e) => setModelConfig((prev) => ({ ...prev, fireClass: e.target.value }))}
                            className="bg-white text-zinc-700 text-[11px] p-1 border border-[#E6DFD3] rounded outline-none max-w-[140px] focus:border-red-700"
                          >
                            <option value="">-- No Action --</option>
                            {classLabels.map((lbl) => (
                              <option key={`fire-${lbl}`} value={lbl}>
                                {lbl}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="mt-1 flex items-center gap-3">
                          <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider shrink-0 min-w-[70px]">
                            THRESHOLD: {Math.round(modelConfig.fireThreshold * 100)}%
                          </span>
                          <input
                            id="fire-threshold-slider"
                            type="range"
                            min="0.10"
                            max="0.99"
                            step="0.05"
                            value={modelConfig.fireThreshold}
                            onChange={(e) => setModelConfig((prev) => ({ ...prev, fireThreshold: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-zinc-200 rounded-none appearance-none cursor-pointer accent-red-700"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Inference Speed Interval */}
                    <div className="border-t border-[#E6DFD3] pt-3.5">
                      <div className="flex justify-between text-[10px] mb-1.5 font-bold">
                        <span className="text-zinc-500 uppercase tracking-widest font-display">Capture Sample Period</span>
                        <span className="text-[#0B2545] font-bold">{modelConfig.inferenceIntervalMs}ms</span>
                      </div>
                      <input
                        id="inference-interval-slider"
                        type="range"
                        min="20"
                        max="250"
                        step="10"
                        value={modelConfig.inferenceIntervalMs}
                        onChange={(e) => setModelConfig((prev) => ({ ...prev, inferenceIntervalMs: parseInt(e.target.value) }))}
                        className="w-full h-1 bg-zinc-200 rounded-none appearance-none cursor-pointer accent-[#0B2545]"
                      />
                    </div>
                  </div>

                  {/* Prediction real-time horizontal bar meters */}
                  <div className="bg-[#FAF8F5] border border-[#E6DFD3] p-4 rounded-lg space-y-3">
                    <span className="text-[10px] text-zinc-400 font-bold block uppercase tracking-widest font-display">Dynamic Probability Matrix</span>
                    {predictions.map((p) => {
                      const isJumpMapping = p.className === modelConfig.jumpClass;
                      const isDuckMapping = p.className === modelConfig.duckClass;
                      const isFireMapping = p.className === modelConfig.fireClass;
                      
                      const thsh = isJumpMapping
                        ? modelConfig.jumpThreshold
                        : isDuckMapping
                        ? modelConfig.duckThreshold
                        : isFireMapping
                        ? modelConfig.fireThreshold
                        : 0;

                      const fire = thsh > 0 && p.probability >= thsh;

                      return (
                        <div key={p.className} className="text-xs">
                          <div className="flex justify-between mb-1.5 text-[11px] font-bold">
                            <span className="flex items-center gap-1.5 truncate">
                              <span className="text-zinc-700 font-medium">{p.className}</span>
                              {isJumpMapping && <span className="text-[8px] bg-[#0B2545] text-white px-1.5 py-0.5 font-bold uppercase rounded">JUMP</span>}
                              {isDuckMapping && <span className="text-[8px] bg-[#D4AF37] text-white px-1.5 py-0.5 font-bold uppercase rounded">DUCK</span>}
                              {isFireMapping && <span className="text-[8px] bg-red-700 text-white px-1.5 py-0.5 font-bold uppercase rounded">FIRE</span>}
                            </span>
                            <span className={fire ? 'text-[#0B2545] font-black' : 'text-zinc-400 font-medium'}>
                              {Math.round(p.probability * 100)}% {fire ? '(ACTIVE)' : ''}
                            </span>
                          </div>
                          <div className="w-full bg-zinc-100 h-2 border border-zinc-200/60 overflow-hidden relative rounded-full">
                            {/* Threshold Mark */}
                            {thsh > 0 && (
                              <div
                                className="absolute top-0 bottom-0 border-l border-[#0B2545]/40 z-10"
                                style={{ left: `${thsh * 100}%` }}
                                title="Activation trigger"
                              />
                            )}
                            <div
                              className={`h-full transition-all duration-75 ${
                                fire
                                  ? isFireMapping
                                    ? 'bg-red-700'
                                    : isDuckMapping
                                    ? 'bg-[#D4AF37]'
                                    : 'bg-[#0B2545]'
                                  : isJumpMapping
                                  ? 'bg-[#0B2545]/30'
                                  : isDuckMapping
                                  ? 'bg-[#D4AF37]/30'
                                  : isFireMapping
                                  ? 'bg-red-700/30'
                                  : 'bg-zinc-300'
                              }`}
                              style={{ width: `${p.probability * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Video Camera Column */}
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="relative w-full aspect-video md:max-w-[280px] bg-zinc-100 border border-[#E6DFD3] overflow-hidden group rounded-lg shadow-xs">
            {/* Webcam Video Object */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover scale-x-[-1] ${
                controlMode === 'KEYBOARD' ? 'opacity-10 pointer-events-none' : ''
              }`}
              style={{ imageRendering: 'pixelated' }}
            />

            {/* Loading / Prompt Overlays */}
            {controlMode === 'KEYBOARD' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#FAF8F5]/95 text-center p-4">
                <Key className="w-8 h-8 text-zinc-300 mb-2" />
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest font-display">Inference Depleted</span>
                <span className="text-[9px] text-zinc-500 mt-1 max-w-[180px] leading-relaxed">Keyboard captures are active. Discharging models suspended.</span>
              </div>
            )}

            {controlMode !== 'KEYBOARD' && !isWebcamActive && !webcamError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#FAF8F5]/95 text-center p-4">
                <RefreshCw className="w-6 h-6 text-[#0B2545] animate-spin mb-2" />
                <span className="text-[10px] font-bold text-[#0B2545] uppercase tracking-wider font-display">Connecting Video Capture...</span>
              </div>
            )}

            {webcamError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50 text-center p-4">
                <AlertTriangle className="w-8 h-8 text-red-500 mb-1" />
                <span className="text-xs font-bold text-red-800 uppercase tracking-wider font-display">System Blocked</span>
                <span className="text-[10px] text-red-600 mt-1 pb-1 scale-90 leading-tight">{webcamError}</span>
                <button
                  id="retry-webcam-btn"
                  onClick={startWebcam}
                  className="mt-2 px-4 py-1.5 bg-red-700 hover:bg-red-800 text-[10px] font-bold text-white uppercase rounded transition"
                >
                  RETRY ACCESS
                </button>
              </div>
            )}
          </div>

          {/* Quick Preset helper button */}
          {controlMode === 'TEACHABLE' && modelStatus !== 'loaded' && (
            <div className="w-full text-center">
              <span className="text-[10px] text-zinc-400 block mb-2 uppercase font-bold tracking-widest font-display">Demonstration Stream Blueprint</span>
              <button
                id="preset-model-btn"
                onClick={() => {
                  setModelConfig((prev) => ({
                    ...prev,
                    url: 'https://teachablemachine.withgoogle.com/models/vO3q0l9E4/',
                    type: 'image',
                  }));
                  // Schedule load slightly after react commits state
                  setTimeout(() => {
                    const btn = document.getElementById('load-tm-model-btn');
                    if (btn) btn.click();
                  }, 120);
                }}
                className="text-[10px] uppercase font-bold tracking-widest px-4 py-2.5 text-[#0B2545] bg-[#0B2545]/5 hover:bg-[#0B2545] hover:text-white border border-[#0B2545]/20 rounded-md transition-all cursor-pointer shadow-xs font-display"
              >
                Inject Neural Demonstration
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
