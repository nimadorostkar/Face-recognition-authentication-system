'use client';

import { useRef, useEffect, useState } from 'react';
import { recognizeFace, sendLoginSms } from '@/lib/api';
import { MotionDetector, MotionResult } from '@/lib/motionDetector';
import { EnergyEfficientStateMachine, SystemState } from '@/lib/stateMachine';
import { EnergyEfficientCamera } from '@/lib/cameraManager';

export default function EnergyEfficientStartPage() {
  // Video refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const displayVideoRef = useRef<HTMLVideoElement>(null);

  // System components
  const cameraRef = useRef<EnergyEfficientCamera | null>(null);
  const motionDetectorRef = useRef<MotionDetector | null>(null);
  const stateMachineRef = useRef<EnergyEfficientStateMachine | null>(null);

  // Intervals and timers
  const mainLoopRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const qrTimerRef = useRef<NodeJS.Timeout | null>(null);
  const faceDetectionDelayRef = useRef<NodeJS.Timeout | null>(null);

  // State
  const [systemState, setSystemState] = useState<SystemState>(SystemState.IDLE);
  const [showUI, setShowUI] = useState(false); // Black screen initially
  const [status, setStatus] = useState<'checking' | 'yes' | 'no'>('checking');
  const [userName, setUserName] = useState<string>('');
  const [visitCount, setVisitCount] = useState<number>(0);
  const [fadeIn, setFadeIn] = useState(false);
  const [videoSource, setVideoSource] = useState('/media/look.mp4');
  const [showQR, setShowQR] = useState(false);
  const showQRRef = useRef<boolean>(false);

  // Transition states for smooth fade between large ai.gif and smaller ai.gif in face detection section
  const [showAiGif, setShowAiGif] = useState(true); // Start with ai.gif visible
  const [aiGifOpacity, setAiGifOpacity] = useState(1); // Full opacity initially
  const [faceidGifOpacity, setFaceidGifOpacity] = useState(0); // Hidden initially (legacy: used only for ai.gif)

  // Post-success screen state
  const [showPostSuccess, setShowPostSuccess] = useState(false);
  const [postSuccessPhase, setPostSuccessPhase] = useState<'go' | 'bg'>('go');
  const [goGifOpacity, setGoGifOpacity] = useState(1);
  const postSuccessTimerRef = useRef<NodeJS.Timeout | null>(null);
  const postSuccessPhaseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const goFadeTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Typing effect state for "Hi, I'm Avro AI" text
  const [typingText, setTypingText] = useState('');
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const typingStartedRef = useRef<boolean>(false);
  
  // Typing effect state for "I couldn't identify you" text (fail video)
  const [failTypingText, setFailTypingText] = useState('');
  const failTypingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const failTypingStartedRef = useRef<boolean>(false);

  // Avro welcome (orb) animation timers for the post-success bg phase
  const awTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  // Restart timer - reload page after completion
  const restartTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Avro welcome (orb) container ref for the post-success bg phase
  const avroRef = useRef<HTMLDivElement>(null);

  // Motion persistence tracking
  const motionCounterRef = useRef<number>(0);
  const MOTION_REQUIRED_FRAMES = 3; // Require 3 consecutive frames with motion

  // Track UI state via ref (immune to stale closures in setInterval)
  const showUIRef = useRef<boolean>(false);
  // Max recognition timeout - fires after maxRecognitionTime to show failure
  const maxRecognitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debug state
  const [debugInfo, setDebugInfo] = useState({
    fps: 0,
    motionPercent: 0,
    motionCounter: 0,
    timeInState: 0,
    isMotionDetecting: false,
    isRecognizing: false,
  });

  /**
   * Initialize system components
   */
  useEffect(() => {
    async function initialize() {
      try {
        console.log('[System] Initializing energy-efficient face recognition...');

        // Initialize camera
        if (videoRef.current) {
          cameraRef.current = new EnergyEfficientCamera(videoRef.current);
          await cameraRef.current.start({
            width: 640,
            height: 480,
            facingMode: 'user',
            idealFPS: 30,
        });

          // Start with low FPS (energy saving)
          cameraRef.current.setFPS(2);
        }

        // Initialize motion detector
        motionDetectorRef.current = new MotionDetector({
          threshold: 0.15, // 15% pixel change (more strict)
          minAreaChange: 800, // Minimum 800 pixels (doubled)
          sensitivity: 4, // Lower sensitivity (less sensitive to small changes)
        });
          
        // Initialize state machine
        stateMachineRef.current = new EnergyEfficientStateMachine({
          idleFPS: 2,
          motionThreshold: 0.15, // Match detector threshold
          motionTimeout: 8000,
          recognitionFPS: 12,
          recognitionInterval: 1500,
          cooldownDuration: 3000,
          cooldownFPS: 5,
          maxRecognitionTime: 7000,
        });

        // Start main processing loop
        startMainLoop();

        console.log('[System] Initialization complete');
      } catch (error) {
        console.error('[System] Initialization failed:', error);
      }
    }

    initialize();

    // Cleanup
    return () => {
      console.log('[System] Shutting down...');
      
      if (mainLoopRef.current) {
        clearInterval(mainLoopRef.current);
      }
      if (recognitionTimerRef.current) {
        clearTimeout(recognitionTimerRef.current);
      }
      if (qrTimerRef.current) {
        clearTimeout(qrTimerRef.current);
      }
      if (postSuccessTimerRef.current) {
        clearTimeout(postSuccessTimerRef.current);
      }
      if (postSuccessPhaseTimerRef.current) {
        clearTimeout(postSuccessPhaseTimerRef.current);
      }
      if (goFadeTimerRef.current) {
        clearTimeout(goFadeTimerRef.current);
      }
      awTimersRef.current.forEach((t) => clearTimeout(t));
      awTimersRef.current = [];
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }
      if (maxRecognitionTimeoutRef.current) {
        clearTimeout(maxRecognitionTimeoutRef.current);
      }
      if (faceDetectionDelayRef.current) {
        clearTimeout(faceDetectionDelayRef.current);
      }
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
      if (failTypingTimerRef.current) {
        clearTimeout(failTypingTimerRef.current);
      }
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
      if (motionDetectorRef.current) {
        motionDetectorRef.current.dispose();
      }
    };
  }, []);

  /**
   * Post-success phase transition: go.gif (2s with fade) → bg.jpeg (10s)
   */
  useEffect(() => {
    if (!showPostSuccess) {
      setPostSuccessPhase('go');
      setGoGifOpacity(1);
      return;
    }

    // Start fading out go.gif at 1.5s (500ms fade transition)
    goFadeTimerRef.current = setTimeout(() => {
      setGoGifOpacity(0);
    }, 1500);

    // Switch to bg.jpeg at 2s
    postSuccessPhaseTimerRef.current = setTimeout(() => {
      setPostSuccessPhase('bg');
    }, 2000);

    return () => {
      if (goFadeTimerRef.current) {
        clearTimeout(goFadeTimerRef.current);
      }
      if (postSuccessPhaseTimerRef.current) {
        clearTimeout(postSuccessPhaseTimerRef.current);
      }
    };
  }, [showPostSuccess]);

  /**
   * Avro welcome (orb) animations for the post-success bg phase:
   * count-up badge, typewriter visit/reward lines, particles, live clock.
   */
  useEffect(() => {
    if (postSuccessPhase !== 'bg' || !showPostSuccess) {
      return;
    }

    const root = avroRef.current;
    if (!root) {
      return;
    }

    // Loyalty / reward config
    const REWARD_EVERY = 5;
    const REWARD = 'coffee';
    const visits = visitCount;

    const ordinal = (n: number) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    const milestone = visits > 0 && visits % 10 === 0;
    const inCycle = visits % REWARD_EVERY;
    const filled = inCycle === 0 && visits > 0 ? REWARD_EVERY : inCycle;
    const remaining = REWARD_EVERY - filled;
    const unlocked = remaining === 0;

    const visitLine = `Your ${ordinal(visits)} visit ${milestone ? '— a milestone' : 'at Avro'}`;
    const rewardLine = unlocked
      ? `Reward unlocked — your next ${REWARD} is on us`
      : `Just ${remaining} more ${remaining === 1 ? 'visit' : 'visits'} to a free ${REWARD}`;

    const timers = awTimersRef.current;
    const track = (t: ReturnType<typeof setTimeout>) => {
      timers.push(t);
      return t;
    };

    // ---- loyalty stamps ----
    const stampsBox = root.querySelector<HTMLElement>('#aw-stamps');
    if (stampsBox) {
      stampsBox.innerHTML = '';
      for (let i = 0; i < REWARD_EVERY; i++) {
        const s = document.createElement('span');
        s.className = 'aw-stamp' + (i < filled ? ' on' : '');
        s.style.animationDelay = 1.0 + i * 0.13 + 's';
        stampsBox.appendChild(s);
      }
    }

    // ---- count-up badge ----
    const badge = root.querySelector<HTMLElement>('#aw-badge');
    if (badge) {
      const ms = 1100;
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / ms);
        const e = 1 - Math.pow(1 - p, 3);
        badge.textContent = String(Math.round(visits * e));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    // ---- typewriter ----
    const typeInto = (
      el: HTMLElement,
      text: string,
      cps: number,
      sparkle: boolean,
      done?: () => void
    ) => {
      const span = document.createElement('span');
      const caret = document.createElement('span');
      caret.className = 'aw-caret';
      el.innerHTML = '';
      el.appendChild(span);
      el.appendChild(caret);
      let i = 0;
      const step = () => {
        i = Math.min(text.length, i + 1);
        span.textContent = text.slice(0, i);
        if (i < text.length) {
          track(setTimeout(step, 1000 / cps));
        } else {
          if (caret.parentNode) caret.remove();
          if (sparkle) {
            const sp = document.createElement('span');
            sp.className = 'aw-spark';
            sp.textContent = ' ✦';
            el.appendChild(sp);
          }
          if (done) done();
        }
      };
      track(setTimeout(step, 1000 / cps));
    };

    const visitEl = root.querySelector<HTMLElement>('#aw-visit-text');
    const rewardEl = root.querySelector<HTMLElement>('#aw-loyalty-text');
    if (visitEl && rewardEl) {
      typeInto(visitEl, visitLine, 26, milestone, () => {
        typeInto(rewardEl, rewardLine, 30, true);
      });
    }

    // ---- live clock ----
    const clockEl = root.querySelector<HTMLElement>('#aw-clock');
    let clockInterval: ReturnType<typeof setInterval> | null = null;
    if (clockEl) {
      const tickClock = () => {
        const d = new Date();
        const h = d.getHours();
        const m = d.getMinutes();
        const ap = h < 12 ? 'AM' : 'PM';
        const hh = ((h + 11) % 12) + 1;
        clockEl.textContent = hh + ':' + (m < 10 ? '0' + m : m) + ' ' + ap;
      };
      tickClock();
      clockInterval = setInterval(tickClock, 10000);
    }

    // ---- drifting particles ----
    const particles = root.querySelector<HTMLElement>('.aw-particles');
    if (particles) {
      particles.innerHTML = '';
      const N = 26;
      for (let i = 0; i < N; i++) {
        const p = document.createElement('span');
        p.className = 'aw-pt';
        const size = 1.5 + Math.random() * 3.5;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.left = Math.random() * 100 + '%';
        p.style.top = 55 + Math.random() * 45 + '%';
        p.style.setProperty('--pt-op', (0.25 + Math.random() * 0.5).toFixed(2));
        const dur = 9 + Math.random() * 12;
        p.style.animationDuration = dur + 's, ' + dur + 's';
        p.style.animationDelay =
          '-' + (Math.random() * dur).toFixed(1) + 's, -' + (Math.random() * dur).toFixed(1) + 's';
        particles.appendChild(p);
      }
    }

    return () => {
      timers.forEach((t) => clearTimeout(t));
      awTimersRef.current = [];
      if (clockInterval) clearInterval(clockInterval);
    };
  }, [postSuccessPhase, showPostSuccess, userName, visitCount]);

  /**
   * Restart page after completion (success or failure)
   */
  useEffect(() => {
    // Clear any existing restart timer
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
    }
    
    // For success: restart after 10 seconds when post-success screen is shown
    if (showPostSuccess) {
      restartTimerRef.current = setTimeout(() => {
        console.log('[Restart] Success path complete - reloading page after 12 seconds...');
        window.location.reload();
      }, 12000); // 2s go.gif + 10s bg.jpeg
    }
    
    // For failure: restart after 6 seconds when QR code is shown
    if (showQR) {
      restartTimerRef.current = setTimeout(() => {
        console.log('[Restart] Failure path complete - reloading page after 6 seconds...');
        window.location.reload();
      }, 6000); // 6 seconds for failure
    }

    return () => {
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }
    };
  }, [showPostSuccess, showQR]);

  /**
   * Add blinking cursor animation CSS
   */
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes blink {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
      }
      @keyframes menuScroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(-50%); }
      }

      /* ============ Avro Welcome (post-success bg phase) ============ */
      .avro-welcome {
        --bg-0: #03060d;
        --bg-1: #081120;
        --ink: #eaf3fb;
        --ink-soft: rgba(234, 243, 251, 0.64);
        --ink-faint: rgba(234, 243, 251, 0.34);
        --c-core: #eafdff;
        --c-amber: #5fb8ff;
        --c-rose: #4fe3e0;
        --c-violet: #6f7dff;
        --c-cyan: #9af2ff;
        --speed: 1;
        --orb: clamp(190px, 34vmin, 460px);

        position: fixed;
        inset: 0;
        overflow: hidden;
        color: var(--ink);
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        background: radial-gradient(120% 100% at 50% 38%, var(--bg-1) 0%, var(--bg-0) 55%, #02040a 100%);
      }
      .avro-welcome *, .avro-welcome *::before, .avro-welcome *::after { box-sizing: border-box; }

      .avro-welcome::before {
        content: "";
        position: absolute;
        inset: -10%;
        background:
          radial-gradient(40% 40% at 30% 30%, rgba(95,184,255,0.11), transparent 70%),
          radial-gradient(45% 45% at 72% 70%, rgba(111,125,255,0.11), transparent 70%);
        filter: blur(20px);
        pointer-events: none;
      }
      .avro-welcome::after {
        content: "";
        position: absolute;
        inset: 0;
        background: radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,0.55) 100%);
        pointer-events: none;
        z-index: 40;
      }

      .aw-grain {
        position: absolute; inset: 0; z-index: 41;
        opacity: 0.05; mix-blend-mode: overlay; pointer-events: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      }

      .aw-orb-label {
        position: absolute; inset: 0; z-index: 6;
        display: flex; align-items: center; justify-content: center;
        pointer-events: none;
        animation: awLabelIn 1.3s cubic-bezier(.2,.7,.2,1) 0.55s both;
      }
      .aw-orb-label b {
        font-weight: 700; font-size: clamp(26px, 5vmin, 60px);
        letter-spacing: 0.16em; padding-left: 0.16em;
        color: rgba(7,17,30,0.88);
        text-shadow: 0 0 1px rgba(255,255,255,0.35), 0 1px 16px rgba(255,255,255,0.25);
      }
      @keyframes awLabelIn { from { transform: scale(0.82); } to { transform: scale(1); } }

      .aw-status {
        position: absolute; bottom: clamp(20px, 4vmin, 60px); left: clamp(20px, 4vw, 72px);
        z-index: 30; display: flex; align-items: center; gap: 12px;
        font-size: clamp(11px, 1.5vmin, 17px); letter-spacing: 0.16em;
        color: var(--ink-faint); text-transform: uppercase;
      }
      .aw-status .aw-tick {
        display: inline-flex; align-items: center; justify-content: center;
        width: 22px; height: 22px; border-radius: 50%;
        border: 1px solid rgba(154,242,255,0.55); color: var(--c-cyan); font-size: 12px;
      }
      .aw-wave { display: inline-flex; align-items: center; gap: 3px; height: 20px; margin-left: 6px; }
      .aw-wave i {
        display: block; width: 3px; height: 30%; border-radius: 2px;
        background: var(--c-cyan); box-shadow: 0 0 8px -1px var(--c-cyan);
        animation: awEq calc(1.1s / var(--speed)) ease-in-out infinite;
      }
      .aw-wave i:nth-child(1){ animation-delay: -.9s; }
      .aw-wave i:nth-child(2){ animation-delay: -.2s; }
      .aw-wave i:nth-child(3){ animation-delay: -.6s; }
      .aw-wave i:nth-child(4){ animation-delay: -.1s; }
      .aw-wave i:nth-child(5){ animation-delay: -.7s; }
      .aw-wave i:nth-child(6){ animation-delay: -.35s; }
      .aw-wave i:nth-child(7){ animation-delay: -.5s; }
      @keyframes awEq { 0%,100% { height: 22%; opacity: .55; } 50% { height: 100%; opacity: 1; } }

      .aw-clock {
        position: absolute; bottom: clamp(20px, 4vmin, 60px); right: clamp(20px, 4vw, 72px);
        z-index: 30; font-size: clamp(11px, 1.5vmin, 17px); letter-spacing: 0.16em;
        color: var(--ink-faint); font-variant-numeric: tabular-nums;
      }

      .aw-content {
        position: absolute; inset: 0; z-index: 20;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: clamp(14px, 3vmin, 30px);
      }
      .aw-greeting { text-align: center; }
      .aw-eyebrow {
        font-size: clamp(14px, 2.4vmin, 26px); letter-spacing: 0.18em;
        text-transform: uppercase; color: var(--ink-soft);
        animation: awRise 1s cubic-bezier(.2,.7,.2,1) 0.25s both;
      }
      .aw-name {
        font-size: clamp(48px, 11vmin, 150px); line-height: 0.98; font-weight: 300;
        letter-spacing: -0.02em; margin-top: clamp(6px, 1.4vmin, 14px);
        background: linear-gradient(110deg, #ffffff 0%, #dbeeff 32%, #ffffff 48%, #b9d6f5 62%, #dbeeff 100%);
        background-size: 220% 100%;
        -webkit-background-clip: text; background-clip: text; color: transparent;
        animation: awRise 1.1s cubic-bezier(.2,.7,.2,1) 0.42s both, awShimmer calc(7s / var(--speed)) ease-in-out 1.4s infinite;
      }
      @keyframes awShimmer { 0%,100% { background-position: 0% 0; } 50% { background-position: 100% 0; } }

      .aw-visit {
        display: inline-flex; align-items: center; gap: clamp(10px, 1.6vmin, 16px);
        padding: clamp(10px,1.6vmin,16px) clamp(18px,3vmin,30px) clamp(10px,1.6vmin,16px) clamp(14px,2.2vmin,22px);
        border-radius: 999px; font-size: clamp(15px, 2.2vmin, 25px); letter-spacing: 0.01em;
        color: var(--ink); background: rgba(255,255,255,0.045);
        border: 1px solid rgba(255,255,255,0.10); backdrop-filter: blur(8px);
        box-shadow: 0 0 0 1px rgba(95,184,255,0.08), 0 18px 60px -20px rgba(111,125,255,0.40);
        animation: awRise 1.1s cubic-bezier(.2,.7,.2,1) 0.62s both;
      }
      .aw-badge {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: clamp(34px,4.6vmin,50px); height: clamp(34px,4.6vmin,50px); padding: 0 clamp(8px,1.3vmin,14px);
        border-radius: 999px; font-size: clamp(18px,2.5vmin,27px); font-weight: 600;
        color: #04141f; background: radial-gradient(120% 120% at 30% 25%, #eafdff, var(--c-amber) 70%);
        box-shadow: 0 0 22px -2px var(--c-amber);
      }
      .aw-visit-text { min-height: 1em; }

      .aw-caret {
        display: inline-block; width: 2px; height: 1.05em; margin-left: 4px;
        vertical-align: -0.16em; border-radius: 2px; background: var(--c-cyan);
        box-shadow: 0 0 10px -1px var(--c-cyan);
        animation: awCaretBlink calc(0.9s / var(--speed)) steps(1, end) infinite;
      }
      @keyframes awCaretBlink { 0%,49%{ opacity: 1; } 50%,100%{ opacity: 0; } }

      .aw-loyalty {
        display: flex; flex-direction: column; align-items: center;
        gap: clamp(10px, 1.8vmin, 16px); margin-top: clamp(16px, 3vmin, 30px);
        animation: awRise 1.1s cubic-bezier(.2,.7,.2,1) 0.82s both;
      }
      .aw-stamps { display: flex; gap: clamp(8px, 1.4vmin, 13px); }
      .aw-stamp {
        width: clamp(10px, 1.5vmin, 15px); height: clamp(10px, 1.5vmin, 15px);
        border-radius: 50%; border: 1px solid rgba(154,242,255,0.30); background: rgba(154,242,255,0.04);
      }
      .aw-stamp.on {
        border-color: transparent;
        background: radial-gradient(circle at 40% 35%, var(--c-core), var(--c-amber) 72%);
        box-shadow: 0 0 13px -1px var(--c-amber);
        animation: awStampPop .55s cubic-bezier(.2,1.5,.4,1) both;
      }
      @keyframes awStampPop { from { transform: scale(0.2); } to { transform: scale(1); } }
      .aw-loyalty-label { font-size: clamp(14px, 2vmin, 22px); letter-spacing: 0.02em; color: var(--ink-soft); }
      .aw-loyalty-label b { color: var(--ink); font-weight: 600; }
      .aw-loyalty-label .aw-spark { color: var(--c-cyan); }
      @keyframes awRise { from { transform: translateY(26px); } to { transform: translateY(0); } }

      .aw-orbStage { display: flex; justify-content: center; margin-bottom: 6px; will-change: transform; }
      .aw-orbWrap {
        position: relative; width: var(--orb); height: var(--orb); margin-bottom: 6px;
        animation: awOrbIn 1.6s cubic-bezier(.2,.7,.2,1) 0s both; will-change: transform;
      }
      @keyframes awOrbIn { from { transform: scale(.72);} to { transform: scale(1);} }
      .aw-orbWrap::after {
        content: ""; position: absolute; inset: -22%; border-radius: 50%;
        background: radial-gradient(closest-side, rgba(95,184,255,0.30), rgba(111,125,255,0.14) 55%, transparent 72%);
        filter: blur(34px); z-index: -1; animation: awBreathe calc(6.5s / var(--speed)) ease-in-out infinite;
      }
      .aw-orb {
        position: absolute; inset: 0; border-radius: 50%; overflow: hidden;
        -webkit-mask: radial-gradient(closest-side, #000 62%, rgba(0,0,0,0.55) 84%, transparent 100%);
        mask: radial-gradient(closest-side, #000 62%, rgba(0,0,0,0.55) 84%, transparent 100%);
        box-shadow: inset 0 0 70px 10px rgba(0,0,0,0.55);
        animation: awBreathe calc(6.5s / var(--speed)) ease-in-out infinite;
      }
      @keyframes awBreathe { 0%,100%{ transform: scale(1);} 50%{ transform: scale(1.035);} }
      .aw-liquid { position: absolute; inset: -30%; filter: blur(26px) saturate(140%); }
      .aw-blob { position: absolute; border-radius: 50%; mix-blend-mode: screen; will-change: transform; }
      .aw-b1 { width: 64%; height: 64%; left: 8%; top: 6%; background: radial-gradient(circle at 40% 40%, var(--c-amber), transparent 68%); animation: awDrift1 calc(12s / var(--speed)) ease-in-out infinite; }
      .aw-b2 { width: 58%; height: 58%; right: 4%; top: 14%; background: radial-gradient(circle at 50% 50%, var(--c-rose), transparent 66%); animation: awDrift2 calc(15s / var(--speed)) ease-in-out infinite; }
      .aw-b3 { width: 66%; height: 66%; left: 12%; bottom: 2%; background: radial-gradient(circle at 50% 50%, var(--c-violet), transparent 66%); animation: awDrift3 calc(17s / var(--speed)) ease-in-out infinite; }
      .aw-b4 { width: 40%; height: 40%; right: 14%; bottom: 14%; background: radial-gradient(circle at 50% 50%, var(--c-cyan), transparent 64%); animation: awDrift4 calc(13s / var(--speed)) ease-in-out infinite; }
      .aw-core {
        position: absolute; width: 46%; height: 46%; left: 27%; top: 25%; border-radius: 50%;
        background: radial-gradient(circle at 50% 45%, rgba(255,245,230,0.95), rgba(255,210,150,0.5) 40%, transparent 70%);
        mix-blend-mode: screen; filter: blur(8px); animation: awBreathe calc(5.2s / var(--speed)) ease-in-out infinite;
      }
      .aw-sheen {
        position: absolute; inset: -10%; border-radius: 50%;
        background: conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.12) 40deg, transparent 120deg, rgba(255,79,134,0.10) 220deg, transparent 320deg);
        mix-blend-mode: screen; animation: awSpin calc(22s / var(--speed)) linear infinite;
      }
      .aw-rim {
        position: absolute; inset: 0; border-radius: 50%;
        background: radial-gradient(120% 120% at 32% 22%, rgba(255,255,255,0.22), transparent 38%);
        mix-blend-mode: screen; pointer-events: none;
      }
      .aw-scan-ring {
        position: absolute; inset: -11%; border-radius: 50%; border: 1px solid rgba(255,255,255,0.07);
        animation: awSpin calc(9s / var(--speed)) linear infinite; pointer-events: none;
      }
      .aw-comet {
        position: absolute; top: -4px; left: 50%; width: 8px; height: 8px; margin-left: -4px;
        border-radius: 50%; background: var(--c-cyan);
        box-shadow: 0 0 16px 3px var(--c-cyan), 0 0 40px 6px var(--c-cyan);
      }
      .aw-ring-dashed {
        position: absolute; inset: -19%; border-radius: 50%; border: 1px dashed rgba(255,255,255,0.06);
        animation: awSpin calc(38s / var(--speed)) linear infinite reverse; pointer-events: none;
      }
      .aw-comet.c2 {
        top: auto; bottom: -3px; width: 6px; height: 6px; margin-left: -3px; background: var(--c-violet);
        box-shadow: 0 0 14px 3px var(--c-violet), 0 0 32px 5px var(--c-violet);
      }
      .aw-scanner {
        position: absolute; inset: 0; border-radius: 50%;
        background: conic-gradient(from 0deg, transparent 0deg, rgba(154,242,255,0.0) 70deg, rgba(154,242,255,0.30) 90deg, rgba(255,255,255,0.55) 96deg, transparent 100deg);
        mix-blend-mode: screen; animation: awSpin calc(5.5s / var(--speed)) linear infinite; pointer-events: none;
      }
      .aw-ping {
        position: absolute; inset: 4%; border-radius: 50%; border: 1px solid rgba(154,242,255,0.45);
        opacity: 0; animation: awPing calc(4.8s / var(--speed)) cubic-bezier(.2,.6,.3,1) infinite; pointer-events: none;
      }
      .aw-ping.p2 { animation-delay: calc(1.6s / var(--speed)); }
      .aw-ping.p3 { animation-delay: calc(3.2s / var(--speed)); }
      @keyframes awPing {
        0% { transform: scale(0.92); opacity: 0; }
        12% { opacity: 0.55; }
        100% { transform: scale(2.1); opacity: 0; border-color: rgba(111,125,255,0.0); }
      }
      .aw-particles { position: absolute; inset: 0; z-index: 15; pointer-events: none; will-change: transform; }
      .aw-pt { position: absolute; border-radius: 50%; background: var(--c-cyan); opacity: 0; animation: awFloatUp linear infinite, awTwinkle ease-in-out infinite; }
      @keyframes awFloatUp { from { transform: translateY(40px); } to { transform: translateY(-160px); } }
      @keyframes awTwinkle { 0%,100% { opacity: 0; } 20%,80% { opacity: var(--pt-op, 0.6); } }
      @keyframes awSpin { to { transform: rotate(360deg);} }
      @keyframes awDrift1 { 0%,100%{ transform: translate(0,0) scale(1);} 33%{ transform: translate(18%,12%) scale(1.1);} 66%{ transform: translate(-10%,16%) scale(.95);} }
      @keyframes awDrift2 { 0%,100%{ transform: translate(0,0) scale(1);} 33%{ transform: translate(-16%,10%) scale(1.08);} 66%{ transform: translate(10%,-12%) scale(.92);} }
      @keyframes awDrift3 { 0%,100%{ transform: translate(0,0) scale(1);} 33%{ transform: translate(12%,-14%) scale(.95);} 66%{ transform: translate(-14%,-6%) scale(1.12);} }
      @keyframes awDrift4 { 0%,100%{ transform: translate(0,0) scale(1);} 50%{ transform: translate(-18%,-16%) scale(1.2);} }

      @media (prefers-reduced-motion: reduce) {
        .avro-welcome .aw-liquid, .avro-welcome .aw-blob, .avro-welcome .aw-core,
        .avro-welcome .aw-sheen, .avro-welcome .aw-scanner, .avro-welcome .aw-orbWrap::after,
        .avro-welcome .aw-scan-ring, .avro-welcome .aw-ring-dashed, .avro-welcome .aw-ping,
        .avro-welcome .aw-pt, .avro-welcome .aw-wave i, .avro-welcome .aw-stamp.on { animation: none !important; }
        .avro-welcome .aw-ping { display: none; }
        .avro-welcome .aw-wave i { height: 60%; }
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  /**
   * Typing effect for "Hi, I'm Avro AI" text in face detection section
   */
  useEffect(() => {
    // Only start typing when face detection section is visible with look.mp4
    if (!showUI || videoSource !== '/media/look.mp4' || status !== 'checking') {
      typingStartedRef.current = false;
      setTypingText('');
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      return;
    }

    // Start typing effect only once
    if (typingStartedRef.current) {
      return;
    }

    typingStartedRef.current = true;
    const fullText = "Look at me";
    const words = fullText.split(' ');
    let currentWordIndex = 0;
    let currentCharIndex = 0;
    let displayedText = '';

    function typeNext() {
      if (currentWordIndex >= words.length) {
        return; // Finished typing
      }

      const currentWord = words[currentWordIndex];
      
      if (currentCharIndex < currentWord.length) {
        // Type next character
        displayedText += currentWord[currentCharIndex];
        setTypingText(displayedText);
        currentCharIndex++;
        typingTimerRef.current = setTimeout(typeNext, 120); // 120ms per character (slower)
      } else {
        // Word complete, add space and move to next word
        if (currentWordIndex < words.length - 1) {
          displayedText += ' ';
          setTypingText(displayedText);
          currentWordIndex++;
          currentCharIndex = 0;
          typingTimerRef.current = setTimeout(typeNext, 180); // slightly longer pause between words
        } else {
          // All words typed
          setTypingText(displayedText);
        }
      }
    }

    // Start typing after a short delay
    typingTimerRef.current = setTimeout(() => {
      typeNext();
    }, 500); // Slightly longer initial delay

    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    };
  }, [showUI, videoSource, status]);

  /**
   * Typing effect for "I couldn't identify you" text under fail.mp4
   */
  useEffect(() => {
    // Only start typing when fail.mp4 is shown
    if (videoSource !== '/media/fail.mp4' || status !== 'no' || showQR) {
      failTypingStartedRef.current = false;
      setFailTypingText('');
      if (failTypingTimerRef.current) {
        clearTimeout(failTypingTimerRef.current);
        failTypingTimerRef.current = null;
      }
      return;
    }

    // Start typing effect only once
    if (failTypingStartedRef.current) {
      return;
    }

    failTypingStartedRef.current = true;
    const fullText = "I couldn't identify you";
    const words = fullText.split(' ');
    let currentWordIndex = 0;
    let currentCharIndex = 0;
    let displayedText = '';

    function typeNext() {
      if (currentWordIndex >= words.length) {
        return; // Finished typing
      }

      const currentWord = words[currentWordIndex];
      
      if (currentCharIndex < currentWord.length) {
        // Type next character
        displayedText += currentWord[currentCharIndex];
        setFailTypingText(displayedText);
        currentCharIndex++;
        failTypingTimerRef.current = setTimeout(typeNext, 100); // 100ms per character
      } else {
        // Word complete, add space and move to next word
        if (currentWordIndex < words.length - 1) {
          displayedText += ' ';
          setFailTypingText(displayedText);
          currentWordIndex++;
          currentCharIndex = 0;
          failTypingTimerRef.current = setTimeout(typeNext, 200); // 200ms pause between words
        } else {
          // All words typed
          setFailTypingText(displayedText);
        }
      }
    }

    // Start typing after a short delay
    failTypingTimerRef.current = setTimeout(() => {
      typeNext();
    }, 500);

    return () => {
      if (failTypingTimerRef.current) {
        clearTimeout(failTypingTimerRef.current);
        failTypingTimerRef.current = null;
      }
    };
  }, [videoSource, status, showQR]);

  /**
   * Main processing loop - runs at adaptive rate
   */
  function startMainLoop() {
    console.log('[MainLoop] Starting...');

    mainLoopRef.current = setInterval(() => {
      if (!cameraRef.current || !motionDetectorRef.current || !stateMachineRef.current) {
        return;
      }

      const camera = cameraRef.current;
      const motionDetector = motionDetectorRef.current;
      const stateMachine = stateMachineRef.current;

      // Update state machine
      stateMachine.update();
      const currentState = stateMachine.getState();
      setSystemState(currentState);

      // Sync camera FPS with state
      const targetFPS = stateMachine.getCurrentFPS();
      if (camera.getFPS() !== targetFPS) {
        camera.setFPS(targetFPS);
      }

      // Process frame if camera is ready
      if (!camera.shouldProcessFrame() || !camera.isActive()) {
        return;
      }

      const videoElement = camera.getVideoElement();

      // Handle different states
      switch (currentState) {
        case SystemState.IDLE:
        case SystemState.MOTION_DETECTED:
          // Run motion detection
          handleMotionDetection(videoElement, motionDetector, stateMachine);
          break;

        case SystemState.FACE_RECOGNITION_ACTIVE:
          // Continue motion detection + trigger recognition
          const motionResult = motionDetector.detectMotion(videoElement);
          
          if (motionResult.hasMotion) {
            stateMachine.onMotionDetected();
          } else {
            stateMachine.onNoMotion();
          }

          // Trigger face recognition (throttled)
          if (!recognitionTimerRef.current) {
            recognitionTimerRef.current = setTimeout(() => {
              performFaceRecognition(camera);
              recognitionTimerRef.current = null;
            }, stateMachine.getConfig().recognitionInterval);
          }
          break;

        case SystemState.COOLDOWN:
          // Just wait, check for motion
          const cooldownMotion = motionDetector.detectMotion(videoElement);
          if (cooldownMotion.hasMotion) {
            stateMachine.onMotionDetected();
          }
          break;

        case SystemState.SUCCESS:
        case SystemState.FAILED:
          // Terminal states - stop processing
          break;
      }

      // Update debug info
      updateDebugInfo(stateMachine, motionDetector, camera);
    }, 100); // Main loop runs at 10Hz
  }

  /**
   * Handle motion detection logic
   */
  function handleMotionDetection(
    video: HTMLVideoElement,
    detector: MotionDetector,
    stateMachine: EnergyEfficientStateMachine
  ) {
    const result: MotionResult = detector.detectMotion(video);

    if (result.hasMotion) {
      // Increment motion counter
      motionCounterRef.current += 1;
      
      console.log(`[MotionDetector] Motion detected! Change: ${(result.changePercentage * 100).toFixed(1)}% (count: ${motionCounterRef.current}/${MOTION_REQUIRED_FRAMES})`);
      
      // Only trigger state change if we have enough consecutive motion frames
      if (motionCounterRef.current >= MOTION_REQUIRED_FRAMES) {
        // Show UI when motion is confirmed with smooth fade transition
        if (!showUIRef.current) {
          showUIRef.current = true;
          console.log('[UI] Significant motion confirmed - transitioning from large ai.gif to smaller ai.gif in face detection section');
          
          // Step 1: Fade out ai.gif (faster fade)
          setAiGifOpacity(0);
          
          // Step 2: After fade out, show ai.gif in face detection section and show UI
          setTimeout(() => {
            setShowAiGif(false);
            setShowUI(true);
            setFadeIn(true);
            console.log('[UI] Transition complete - look.mp4 visible in face detection section');
            
            // Step 3: Short wait before starting face recognition (faster)
            if (faceDetectionDelayRef.current) {
              clearTimeout(faceDetectionDelayRef.current);
            }
            faceDetectionDelayRef.current = setTimeout(() => {
              console.log('[UI] Starting face recognition after short delay');
              stateMachine.onMotionDetected();
              faceDetectionDelayRef.current = null;

              // Start max recognition timeout - only show failure after full timeout
              if (maxRecognitionTimeoutRef.current) {
                clearTimeout(maxRecognitionTimeoutRef.current);
              }
              const maxTime = stateMachineRef.current?.getConfig().maxRecognitionTime ?? 30000;
              maxRecognitionTimeoutRef.current = setTimeout(() => {
                const state = stateMachineRef.current?.getState();
                if (!showQRRef.current && state !== SystemState.SUCCESS && state !== SystemState.FAILED) {
                  console.log('[Recognition] Max recognition time reached - showing failure');
                  handleRecognitionFailure();
                }
              }, maxTime);
            }, 2000);
          }, 500);
        }
      }
    } else {
      // Reset counter if no motion
      if (motionCounterRef.current > 0) {
        console.log(`[MotionDetector] No motion - resetting counter (was: ${motionCounterRef.current})`);
        motionCounterRef.current = 0;
      }
      stateMachine.onNoMotion();
    }
  }

  /**
   * Perform face recognition
   */
  async function performFaceRecognition(camera: EnergyEfficientCamera) {
    if (stateMachineRef.current?.getState() !== SystemState.FACE_RECOGNITION_ACTIVE) {
      return;
    }

    try {
      const imageBase64 = camera.captureFrameAsBase64();
      if (!imageBase64) {
        return;
      }

      const result = await recognizeFace(imageBase64);

      if (result.match && result.name && result.user_id) {
        handleRecognitionSuccess(result.name, result.user_id, result.visit_count ?? 0);
      }
      // No match: keep trying until maxRecognitionTimeout fires
    } catch {
      // API error (no face detected, network, etc.) - silently retry
    }
  }

  /**
   * Handle successful recognition
   */
  function handleRecognitionSuccess(name: string, userId: number, userVisitCount: number) {
    console.log(`[Recognition] Success: ${name} (ID: ${userId}, visits: ${userVisitCount})`);
    console.log('[Video] Switching from look.mp4 to success.mp4');
    setVisitCount(userVisitCount);

    // Fire-and-forget: send login SMS notification
    sendLoginSms(userId);
    
    if (stateMachineRef.current) {
      stateMachineRef.current.onRecognitionSuccess(name);
    }

    // Clear recognition timeout since we succeeded
    if (maxRecognitionTimeoutRef.current) {
      clearTimeout(maxRecognitionTimeoutRef.current);
      maxRecognitionTimeoutRef.current = null;
    }

    // Clear timers
          if (qrTimerRef.current) {
            clearTimeout(qrTimerRef.current);
            qrTimerRef.current = null;
          }
    if (recognitionTimerRef.current) {
      clearTimeout(recognitionTimerRef.current);
      recognitionTimerRef.current = null;
          }
          
    // Update UI
          setFadeIn(false);
          setTimeout(() => {
      console.log('[Video] Setting videoSource to /media/success.mp4');
            setStatus('yes');
      setUserName(name);
      setVideoSource('/media/success.mp4'); // This should trigger video change
            setShowQR(false);
            showQRRef.current = false;
            
      // Force video reload
      setTimeout(() => {
            if (displayVideoRef.current) {
          console.log('[Video] Loading success.mp4');
              displayVideoRef.current.load();
          displayVideoRef.current.play().catch(err => {
            console.error('[Video] Play error:', err);
          });
            }
        setFadeIn(true);
        
        // Show post-success screen after 2 seconds
        if (postSuccessTimerRef.current) {
          clearTimeout(postSuccessTimerRef.current);
        }
        postSuccessTimerRef.current = setTimeout(() => {
          console.log('[PostSuccess] Showing post-success screen');
          setShowPostSuccess(true);
          setFadeIn(false);
        }, 2000);
        // NOTE: page reload is handled by the restart useEffect once
        // showPostSuccess becomes true (12s), so no extra timer is set here.
      }, 100);
          }, 300);

    // Stop camera (energy saving)
    if (cameraRef.current) {
      cameraRef.current.pause();
    }
          }
          
  /**
   * Handle recognition failure
   */
  function handleRecognitionFailure() {
    console.log('[Recognition] Failed - user not recognized');
                
    if (stateMachineRef.current) {
      stateMachineRef.current.onRecognitionFailed();
    }
        
    // Only show failure UI once
    if (showQRRef.current) {
      return;
    }
          
    // Clear recognition timer
    if (recognitionTimerRef.current) {
      clearTimeout(recognitionTimerRef.current);
      recognitionTimerRef.current = null;
          }
          
    // Show failure animation
          setFadeIn(false);
          setTimeout(() => {
            setStatus('no');
            setUserName('');
            setVideoSource('/media/fail.mp4');
            setFadeIn(true);
            
            // Reset fail typing effect
            setFailTypingText('');
            failTypingStartedRef.current = false;
            if (failTypingTimerRef.current) {
              clearTimeout(failTypingTimerRef.current);
              failTypingTimerRef.current = null;
            }
            
            if (displayVideoRef.current) {
              displayVideoRef.current.load();
              displayVideoRef.current.play();
            }
            
      // Show QR after 3 seconds
            qrTimerRef.current = setTimeout(() => {
        console.log('[UI] Showing QR code');
              setFadeIn(false);
              setTimeout(() => {
                setShowQR(true);
                showQRRef.current = true;
                setFadeIn(true);
                
                if (displayVideoRef.current) {
                  displayVideoRef.current.pause();
                }
              }, 500);
            }, 3000);

      // Restart page after QR screen to reset for next user
      restartTimerRef.current = setTimeout(() => {
        console.log('[System] Restarting after failure flow...');
        window.location.reload();
      }, 20000);
          }, 300);

    // Pause camera (energy saving)
    if (cameraRef.current) {
      cameraRef.current.pause();
      }
  }

  /**
   * Update debug information
   */
  function updateDebugInfo(
    stateMachine: EnergyEfficientStateMachine,
    detector: MotionDetector,
    camera: EnergyEfficientCamera
  ) {
    setDebugInfo({
      fps: camera.getFPS(),
      motionPercent: 0, // Would need to track last result
      motionCounter: motionCounterRef.current,
      timeInState: stateMachine.getTimeInCurrentState(),
      isMotionDetecting: stateMachine.shouldDetectMotion(),
      isRecognizing: stateMachine.shouldRunRecognition(),
    });
  }

  return (
    <div
        style={{
          width: '100vw',
          height: '100vh',
          backgroundColor: 'black', // Always black background
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          padding: 0,
          transition: 'background-color 0.5s ease',
        }}
      >
      {/* Hidden webcam video for face recognition */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ display: 'none' }}
      />

      {/* Animated ring on black screen (idle mode) - ai.gif with fade */}
      {showAiGif && (
        <div
          style={{
            position: 'absolute',
            width: '800px',
            height: '800px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: aiGifOpacity,
            transition: 'opacity 0.5s ease-in-out',
            pointerEvents: 'none',
          }}
        >
          <img
            src="/media/ai.gif"
            alt="Scanning"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
          {/* Enhanced radial fade with stronger top fade */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: `
                radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.7) 70%, black 85%),
                linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.4) 100%)
              `,
              pointerEvents: 'none',
            }}
          />
        </div>
      )}

      {/* UI - Only show after motion detected, hide when post-success screen is shown */}
      {showUI && !showPostSuccess && (
        <>
      {/* Face ID animation video or QR code */}
      {showQR ? (
        <>
          {/* Full screen background GIF */}
        <img
            src="/media/qrback.gif"
            alt="QR Background"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              objectFit: 'cover',
              opacity: fadeIn ? 1 : 0,
              transition: 'opacity 0.5s ease-in-out',
              display: 'block',
              zIndex: 1,
            }}
          />
          {/* Centered reg.png on top of background */}
          <img
            src="/media/reg.png"
            alt="Registration QR"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              maxWidth: '30%',
              maxHeight: '30%',
              width: 'auto',
              height: 'auto',
              opacity: fadeIn ? 1 : 0,
              transition: 'opacity 0.5s ease-in-out',
              display: 'block',
              zIndex: 2,
            }}
          />
          {/* Text below reg.png */}
          <div
            style={{
              position: 'fixed',
              top: 'calc(50% + 16vh)',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#fff',
              fontSize: '20px',
              fontWeight: 'normal',
              textAlign: 'center',
              opacity: fadeIn ? 1 : 0,
              transition: 'opacity 0.5s ease-in-out',
              zIndex: 2,
            }}
          >
            Join Avro Now!
          </div>
        </>
      ) : videoSource.endsWith('.gif') ? (
        // Render GIF as img element with smooth fade transition and edge fade
        <div
          style={{
            display: showQR ? 'none' : 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '350px', // Smaller size for ai.gif
              height: 'auto',
            }}
          >
            <img
              key={videoSource}
              src={videoSource}
              alt="Face ID"
              onLoad={() => {
                console.log('[Image] Loaded:', videoSource, 'Status:', status);
                setFadeIn(true);
              }}
              onError={(e) => {
                console.error('[Image] Error loading:', videoSource, e);
              }}
              style={{
                width: '100%',
                height: 'auto',
                opacity: videoSource === '/media/ai.gif' ? faceidGifOpacity : (fadeIn ? 1 : 0),
                transition: 'opacity 0.5s ease-in-out',
                display: 'block',
              }}
            />
            {/* Radial fade overlay to blend edges with black background */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: `
                  radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.8) 85%, black 95%),
                  linear-gradient(to top, black 0%, transparent 20%, transparent 80%, black 100%),
                  linear-gradient(to bottom, black 0%, transparent 20%, transparent 80%, black 100%),
                  linear-gradient(to left, black 0%, transparent 20%, transparent 80%, black 100%),
                  linear-gradient(to right, black 0%, transparent 20%, transparent 80%, black 100%)
                `,
                pointerEvents: 'none',
                borderRadius: '8px',
              }}
            />
          </div>
          {/* Typing effect text "Hi, I'm Avro AI" */}
          {videoSource === '/media/look.mp4' && status === 'checking' && (
            <div
              style={{
                color: '#fff',
                fontSize: '18px',
                fontWeight: 'normal',
                textAlign: 'center',
                marginTop: '15px',
                opacity: fadeIn ? 1 : 0,
                transition: 'opacity 0.5s ease-in-out',
                minHeight: '25px',
              }}
            >
              {typingText}
              <span
                style={{
                  display: 'inline-block',
                  width: '2px',
                  height: '18px',
                  backgroundColor: '#fff',
                  marginLeft: '2px',
                  animation: 'blink 1s step-end infinite',
                }}
              >
                |
              </span>
            </div>
          )}
        </div>
      ) : (
        // Render MP4 as video element with fade overlay
        <div
          style={{
            display: showQR ? 'none' : 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: videoSource === '/media/look.mp4' ? '340px' : '300px',
              height: 'auto',
            }}
          >
            <video
              key={videoSource} // Force re-render when video source changes
              ref={displayVideoRef}
              autoPlay
              loop={status === 'checking'} // Only loop while checking, not success/fail
              muted
              playsInline
              onLoadedData={() => {
                // Fade in for all videos when loaded
                console.log('[Video] Loaded:', videoSource, 'Status:', status);
                setFadeIn(true);
              }}
              onError={(e) => {
                console.error('[Video] Error loading:', videoSource, e);
              }}
              style={{
                width: '100%',
                height: 'auto',
                opacity: fadeIn ? 1 : 0,
                transition: 'opacity 0.5s ease-in-out',
                display: 'block',
              }}
            >
              <source src={videoSource} type="video/mp4" key={videoSource} />
            </video>
            {/* Radial fade overlay to blend edges with black background */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: `
                  radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.8) 85%, black 95%),
                  linear-gradient(to top, black 0%, transparent 20%, transparent 80%, black 100%),
                  linear-gradient(to bottom, black 0%, transparent 20%, transparent 80%, black 100%),
                  linear-gradient(to left, black 0%, transparent 20%, transparent 80%, black 100%),
                  linear-gradient(to right, black 0%, transparent 20%, transparent 80%, black 100%)
                `,
                pointerEvents: 'none',
                borderRadius: '8px',
              }}
            />
          </div>
          {/* Typing effect text "Hi, I'm Avro" under look.mp4 */}
          {videoSource === '/media/look.mp4' && status === 'checking' && (
            <div
              style={{
                color: '#fff',
                fontSize: '18px',
                fontWeight: 'normal',
                textAlign: 'center',
                marginTop: '15px',
                opacity: fadeIn ? 1 : 0,
                transition: 'opacity 0.5s ease-in-out',
                minHeight: '25px',
              }}
            >
              {typingText}
              <span
                style={{
                  display: 'inline-block',
                  width: '2px',
                  height: '18px',
                  backgroundColor: '#fff',
                  marginLeft: '2px',
                  animation: 'blink 1s step-end infinite',
                }}
              >
                |
              </span>
            </div>
          )}
          {/* Typing effect text "I couldn't identify you" under fail.mp4 */}
          {videoSource === '/media/fail.mp4' && status === 'no' && (
            <div
              style={{
                color: '#fff',
                fontSize: '18px',
                fontWeight: 'normal',
                textAlign: 'center',
                marginTop: '15px',
                opacity: fadeIn ? 1 : 0,
                transition: 'opacity 0.5s ease-in-out',
                minHeight: '25px',
              }}
            >
              {failTypingText}
              <span
                style={{
                  display: 'inline-block',
                  width: '2px',
                  height: '18px',
                  backgroundColor: '#fff',
                  marginLeft: '2px',
                  animation: 'blink 1s step-end infinite',
                }}
              >
                |
              </span>
            </div>
          )}
        </div>
      )}
      
          {/* Status text - only show on success */}
      {status === 'yes' && (
      <div
        style={{
            fontSize: '36px',
            fontWeight: 'normal',
            color: '#fff', // White text on black
          textAlign: 'center',
          maxWidth: '500px',
          lineHeight: '1.5',
          padding: '0 20px',
          opacity: fadeIn ? 1 : 0,
          transition: 'opacity 0.5s ease-in-out',
        }}
      >
          Welcome back, {userName} 
      </div>
      )}
        </>
      )}
      
      {/* Post-success screen: go.gif (2s with fade) then bg.jpeg (10s) */}
      {showPostSuccess && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'black',
            zIndex: 10,
          }}
        >
          {postSuccessPhase === 'go' ? (
            <img
              src="/media/go.gif"
              alt="Go"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: goGifOpacity,
                transition: 'opacity 0.5s ease-in-out',
              }}
            />
          ) : (
            <div className="avro-welcome" ref={avroRef}>
              <div className="aw-particles" />

              <div className="aw-content">
                <div className="aw-orbStage">
                  <div className="aw-orbWrap">
                    <div className="aw-ping" />
                    <div className="aw-ping p2" />
                    <div className="aw-ping p3" />
                    <div className="aw-scan-ring"><span className="aw-comet" /></div>
                    <div className="aw-ring-dashed"><span className="aw-comet c2" /></div>
                    <div className="aw-orb">
                      <div className="aw-liquid">
                        <div className="aw-blob aw-b1" />
                        <div className="aw-blob aw-b2" />
                        <div className="aw-blob aw-b3" />
                        <div className="aw-blob aw-b4" />
                      </div>
                      <div className="aw-core" />
                      <div className="aw-sheen" />
                      <div className="aw-scanner" />
                      <div className="aw-rim" />
                    </div>
                    <div className="aw-orb-label"><b>Avro</b></div>
                  </div>
                </div>

                <div className="aw-greeting">
                  <div className="aw-eyebrow">Welcome back</div>
                  <h1 className="aw-name">{userName || 'Guest'}</h1>
                  <div className="aw-visit">
                    <span className="aw-badge" id="aw-badge">0</span>
                    <span className="aw-visit-text" id="aw-visit-text" />
                  </div>
                  <div className="aw-loyalty">
                    <div className="aw-stamps" id="aw-stamps" />
                    <div className="aw-loyalty-label" id="aw-loyalty-text" />
                  </div>
                </div>
              </div>

              <div className="aw-status">
                <span className="aw-tick">✓</span>
                <span>Identity verified</span>
                <span className="aw-wave"><i /><i /><i /><i /><i /><i /><i /></span>
              </div>
              <div className="aw-clock" id="aw-clock">—</div>

              <div className="aw-grain" />
            </div>
          )}
        </div>
      )}
      
      {/* Debug panel - bottom right */}
      {process.env.NODE_ENV === 'development' && (
        <div
          style={{
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: '#0f0',
            padding: '10px',
            borderRadius: '5px',
            fontSize: '12px',
            fontFamily: 'monospace',
            lineHeight: '1.5',
          }}
        >
          <div><strong>System State:</strong> {systemState}</div>
          <div><strong>FPS:</strong> {debugInfo.fps}</div>
          <div><strong>Time in State:</strong> {(debugInfo.timeInState / 1000).toFixed(1)}s</div>
          <div><strong>Motion Counter:</strong> {debugInfo.motionCounter}/{MOTION_REQUIRED_FRAMES}</div>
          <div><strong>Motion Detection:</strong> {debugInfo.isMotionDetecting ? '🟢' : '🔴'}</div>
          <div><strong>Recognition:</strong> {debugInfo.isRecognizing ? '🟢' : '🔴'}</div>
          <div><strong>UI Visible:</strong> {showUI ? '✅' : '❌'}</div>
        </div>
      )}
    </div>
  );
}

