import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';
import { 
  Sparkles, 
  Trash2, 
  RotateCcw, 
  Cpu, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Sliders, 
  Eye, 
  PenTool,
  HelpCircle
} from 'lucide-react';

// Sample drawing paths for instant testing
const SAMPLE_DIGITS = {
  0: (ctx, w, h) => {
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w * 0.28, h * 0.36, 0, 0, Math.PI * 2);
    ctx.stroke();
  },
  3: (ctx, w, h) => {
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.35, w * 0.22, -Math.PI * 0.6, Math.PI * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.65, w * 0.25, -Math.PI * 0.5, Math.PI * 0.7);
    ctx.stroke();
  },
  5: (ctx, w, h) => {
    ctx.beginPath();
    ctx.moveTo(w * 0.72, h * 0.2);
    ctx.lineTo(w * 0.32, h * 0.2);
    ctx.lineTo(w * 0.3, h * 0.48);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w * 0.48, h * 0.62, w * 0.26, -Math.PI * 0.5, Math.PI * 0.7);
    ctx.stroke();
  },
  7: (ctx, w, h) => {
    ctx.beginPath();
    ctx.moveTo(w * 0.25, h * 0.2);
    ctx.lineTo(w * 0.75, h * 0.2);
    ctx.lineTo(w * 0.4, h * 0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.45, h * 0.5);
    ctx.lineTo(w * 0.62, h * 0.5);
    ctx.stroke();
  },
  8: (ctx, w, h) => {
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.36, w * 0.21, h * 0.18, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.68, w * 0.26, h * 0.22, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
};

export default function App() {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [strokeWidth, setStrokeWidth] = useState(20);
  const [smartCenter, setSmartCenter] = useState(true);
  const [isPredicting, setIsPredicting] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [serverOnline, setServerOnline] = useState(null);
  const [toast, setToast] = useState(null);
  const historyRef = useRef([]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const API_BASE = import.meta.env.VITE_API_URL || '';

  // Check backend server connection
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      if (res.ok) {
        const data = await res.json();
        setServerOnline(data.model_loaded);
      } else {
        setServerOnline(false);
      }
    } catch {
      setServerOnline(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // Setup Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Fill background with pitch black
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Configure stroke
    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = strokeWidth;

    // Save initial state to history
    saveState();
  }, []);

  // Update stroke width
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = strokeWidth;
  }, [strokeWidth]);

  const saveState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (historyRef.current.length > 20) {
      historyRef.current.shift();
    }
  };

  const undo = () => {
    if (historyRef.current.length <= 1) return;
    historyRef.current.pop(); // remove current
    const prev = historyRef.current[historyRef.current.length - 1];
    const canvas = canvasRef.current;
    if (canvas && prev) {
      const ctx = canvas.getContext('2d');
      ctx.putImageData(prev, 0, 0);
      setPrediction(null);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setPrediction(null);
    historyRef.current = [];
    saveState();
  };

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    if (e.type === 'touchstart') e.preventDefault();
    const { x, y } = getCanvasCoords(e);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    ctx.beginPath();
    ctx.arc(x, y, strokeWidth / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x, y);

    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    if (e.type === 'touchmove') e.preventDefault();
    const { x, y } = getCanvasCoords(e);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    saveState();
  };

  // Draw Sample Digit
  const loadSample = (digit) => {
    clearCanvas();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 22;

    const drawer = SAMPLE_DIGITS[digit];
    if (drawer) {
      drawer(ctx, canvas.width, canvas.height);
      setHasDrawn(true);
      saveState();
      // Auto predict sample for immediate satisfaction
      setTimeout(() => predictDigit(), 100);
    }
  };

  // Predict Digit
  const predictDigit = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsPredicting(true);
    const dataUrl = canvas.toDataURL('image/png');

    try {
      const res = await fetch(`${API_BASE}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: dataUrl,
          mode: smartCenter ? 'center' : 'direct'
        })
      });

      const data = await res.json();
      if (res.ok) {
        if (data.empty) {
          showToast('Canvas is empty. Draw a number first!');
          setPrediction(null);
        } else {
          setPrediction(data);
        }
      } else {
        showToast(data.error || 'Prediction failed');
      }
    } catch (err) {
      showToast('Could not connect to model server');
      console.error(err);
    } finally {
      setIsPredicting(false);
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        predictDigit();
      } else if (e.key === 'c' || e.key === 'C') {
        if (!e.ctrlKey && !e.metaKey) clearCanvas();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        undo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasDrawn, smartCenter]);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-badges">
          <span className="badge badge-model">
            <Cpu size={13} /> my_model.keras (CNN)
          </span>
          <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
            <Layers size={13} /> MNIST • 99.46% Test Acc
          </span>
          {serverOnline === true && (
            <span className="badge badge-online">
              <span className="pulse-dot" /> Online
            </span>
          )}
          {serverOnline === false && (
            <span className="badge badge-offline">
              <AlertCircle size={13} /> Server Offline
            </span>
          )}
        </div>

        <h1 className="title-glow">Draw a Number</h1>
        <p className="app-subtitle">
          Sketch any handwritten digit (0–9) on the canvas below. The trained Convolutional Neural Network analyzes the stroke tensor in real-time.
        </p>
      </header>

      {/* Main Grid */}
      <main className="main-grid">
        {/* Left Column: Canvas Card */}
        <section className="glass-panel canvas-card">
          <div className="card-header">
            <div className="card-title">
              <PenTool size={18} color="#818cf8" />
              <span>Drawing Canvas</span>
            </div>
            <div className="sample-pills">
              <span className="sample-label">Try:</span>
              {[0, 3, 5, 7, 8].map((num) => (
                <button
                  key={num}
                  className="sample-btn"
                  onClick={() => loadSample(num)}
                  title={`Draw sample digit ${num}`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Canvas Wrapper */}
          <div className={`canvas-wrapper ${isPredicting ? 'is-predicting' : ''}`}>
            <canvas
              ref={canvasRef}
              width={280}
              height={280}
              className="canvas-element"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
            {!hasDrawn && (
              <div className="canvas-guide">
                <PenTool size={24} style={{ opacity: 0.5 }} />
                <span>Draw a digit here</span>
              </div>
            )}
          </div>

          {/* Canvas Toolbar (Brush width) */}
          <div className="canvas-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Brush:</span>
              <div className="stroke-selector">
                <button
                  className={`stroke-btn ${strokeWidth === 14 ? 'active' : ''}`}
                  onClick={() => setStrokeWidth(14)}
                >
                  Fine
                </button>
                <button
                  className={`stroke-btn ${strokeWidth === 20 ? 'active' : ''}`}
                  onClick={() => setStrokeWidth(20)}
                >
                  Medium
                </button>
                <button
                  className={`stroke-btn ${strokeWidth === 28 ? 'active' : ''}`}
                  onClick={() => setStrokeWidth(28)}
                >
                  Bold
                </button>
              </div>
            </div>

            <div style={{ fontSize: '0.78rem', color: 'var(--text-faint)' }}>
              Shortcut: <strong>Enter</strong> to predict
            </div>
          </div>

          {/* Action Bar */}
          <div className="action-bar">
            <button
              className="btn btn-primary"
              onClick={predictDigit}
              disabled={isPredicting || !hasDrawn}
            >
              <Sparkles size={18} />
              <span>{isPredicting ? 'Analyzing...' : 'Predict Digit'}</span>
            </button>

            <button
              className="btn btn-secondary"
              onClick={undo}
              disabled={historyRef.current.length <= 1}
              title="Undo last stroke (Ctrl+Z)"
            >
              <RotateCcw size={17} />
            </button>

            <button
              className="btn btn-secondary"
              onClick={clearCanvas}
              title="Clear canvas (C)"
            >
              <Trash2 size={17} />
              <span>Clear</span>
            </button>
          </div>

          {/* Options Bar */}
          <div className="options-bar">
            <label className="toggle-label" onClick={() => setSmartCenter(!smartCenter)}>
              <div className={`toggle-switch ${smartCenter ? 'checked' : ''}`}>
                <div className="toggle-thumb" />
              </div>
              <span>Smart MNIST Centering (Center of Mass)</span>
            </label>
          </div>
        </section>

        {/* Right Column: Prediction Results Card */}
        <section className="glass-panel result-card">
          <div className="card-header">
            <div className="card-title">
              <Sparkles size={18} color="#a855f7" />
              <span>Neural Prediction</span>
            </div>
            {prediction && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Input: 28×28 Grayscale
              </span>
            )}
          </div>

          {/* Prediction Hero Display */}
          {prediction ? (
            <div className="hero-box">
              <div className="hero-digit">{prediction.digit}</div>
              <div className="hero-meta">
                <div
                  className={`confidence-pill ${
                    prediction.confidence >= 90
                      ? 'confidence-high'
                      : prediction.confidence >= 60
                      ? 'confidence-med'
                      : 'confidence-low'
                  }`}
                >
                  <CheckCircle2 size={16} />
                  <span>{prediction.confidence}% Confidence</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="hero-box empty-state">
              <HelpCircle size={44} style={{ color: 'var(--text-faint)', opacity: 0.5, marginBottom: '8px' }} />
              <div style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '1.05rem' }}>
                Awaiting Digit Input
              </div>
              <div style={{ color: 'var(--text-faint)', fontSize: '0.85rem', marginTop: '4px' }}>
                Draw any number on the canvas and click "Predict Digit".
              </div>
            </div>
          )}

          {/* 10-Class Probability Distribution */}
          <div className="distribution-section">
            <div className="distribution-title">
              <span>Softmax Probabilities</span>
              <span>Classes (0–9)</span>
            </div>

            <div className="distribution-grid">
              {Array.from({ length: 10 }).map((_, digit) => {
                const prob = prediction ? prediction.probabilities[digit] : 0;
                const isWinner = prediction && prediction.digit === digit;

                return (
                  <div key={digit} className={`prob-row ${isWinner ? 'is-winner' : ''}`}>
                    <div className="prob-digit">{digit}</div>
                    <div className="prob-bar-track">
                      <div
                        className="prob-bar-fill"
                        style={{ width: `${Math.max(prob, 0)}%` }}
                      />
                    </div>
                    <div className="prob-val">{prob.toFixed(1)}%</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CNN Vision Preview (28x28 Preprocessed Tensor) */}
          {prediction && prediction.preview && (
            <div className="vision-section">
              <img
                src={prediction.preview}
                alt="28x28 Model Input Tensor"
                className="vision-preview-img"
              />
              <div className="vision-info">
                <div className="vision-title">
                  <Eye size={14} style={{ display: 'inline', marginRight: '6px' }} />
                  CNN Vision Input (28×28 Tensor)
                </div>
                <div className="vision-desc">
                  Preprocessed with {prediction.mode_used === 'center' ? 'Center of Mass Normalization' : 'Direct Resize'} for Conv2D feature extraction.
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Floating Toast Notification */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
