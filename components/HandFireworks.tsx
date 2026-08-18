"use client";

import { useEffect, useRef, useState } from "react";
import type { HandLandmarker as HandLandmarkerType } from "@mediapipe/tasks-vision";
import { detectGestures, GESTURES, FINGERTIP, type DetectedHand, type Handedness } from "@/lib/gestures";
import { FireworksEngine } from "@/lib/fireworks";

type Status = "idle" | "loading-model" | "requesting-camera" | "running" | "error";

const GESTURE_COOLDOWN_MS = 550; // min gap between bursts per hand, so a held pose doesn't flood particles

export default function HandFireworks() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FireworksEngine | null>(null);
  const landmarkerRef = useRef<HandLandmarkerType | null>(null);
  const lastBurstAt = useRef<Record<number, number>>({});
  const rafRef = useRef<number | null>(null);
  const lastFrameTime = useRef<number>(performance.now());
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [activeGestures, setActiveGestures] = useState<string[]>([]);

  async function start() {
    setErrorMsg("");
    try {
      setStatus("loading-model");
      const { HandLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");

      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm"
      );

      const landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
      });
      landmarkerRef.current = landmarker;

      setStatus("requesting-camera");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      const canvas = canvasRef.current!;
      const engine = new FireworksEngine(canvas);
      engineRef.current = engine;
      resizeToVideo();

      setStatus("running");
      lastFrameTime.current = performance.now();
      loop();
    } catch (err) {
      console.error(err);
      setErrorMsg(
        err instanceof Error ? err.message : "Something went wrong starting the camera or model."
      );
      setStatus("error");
    }
  }

  function resizeToVideo() {
    const video = videoRef.current;
    const engine = engineRef.current;
    if (!video || !engine) return;
    const w = video.clientWidth || video.videoWidth;
    const h = video.clientHeight || video.videoHeight;
    if (w && h) engine.resize(w, h);
  }

  function loop() {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    const engine = engineRef.current;
    if (!video || !landmarker || !engine) return;

    const now = performance.now();
    const dt = Math.min((now - lastFrameTime.current) / 1000, 0.05);
    lastFrameTime.current = now;

    if (video.readyState >= 2) {
      const result = landmarker.detectForVideo(video, now);
      const canvasW = engineRef.current ? canvasRef.current!.clientWidth : 0;
      const canvasH = canvasRef.current!.clientHeight;

      const gesturesThisFrame = new Set<string>();

      result.landmarks.forEach((landmarks, handIndex) => {
        const handednessLabel =
          (result.handedness[handIndex]?.[0]?.categoryName as Handedness) ?? "Right";
        const hand: DetectedHand = {
          landmarks: landmarks.map((l) => ({ x: l.x, y: l.y, z: l.z })),
          handedness: handednessLabel,
        };
        const matches = detectGestures(hand);
        matches.forEach((g) => gesturesThisFrame.add(g));

        // Mirror x because the video is displayed mirrored (selfie view).
        const toCanvas = (l: { x: number; y: number }) => ({
          x: (1 - l.x) * canvasW,
          y: l.y * canvasH,
        });

        if (matches.includes("open-hand")) {
          const origin = toCanvas(hand.landmarks[0]); // wrist
          const last = lastBurstAt.current[handIndex] ?? 0;
          if (now - last > GESTURE_COOLDOWN_MS) {
            engine.burst(origin);
            lastBurstAt.current[handIndex] = now;
          } else {
            engine.sparkle(origin);
          }
        }

        if (matches.includes("index-point")) {
          // Continuous fizz at the fingertip for as long as the pose is held.
          const origin = toCanvas(hand.landmarks[FINGERTIP.index]);
          engine.sparklerTick(origin);
        }
      });

      setActiveGestures((prev) => {
        const next = Array.from(gesturesThisFrame);
        if (prev.length === next.length && prev.every((g, i) => g === next[i])) return prev;
        return next;
      });
    }

    engine.update(dt);
    rafRef.current = requestAnimationFrame(loop);
  }

  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    streamRef.current = null;
    setStatus("idle");
    setActiveGestures([]);
  }

  useEffect(() => {
    const onResize = () => resizeToVideo();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="stage">
      <div className="viewport">
        <video ref={videoRef} className="video" playsInline muted />
        <canvas ref={canvasRef} className="canvas" />
        <div className="vignette" />
        {status !== "running" && (
          <div className="overlay">
            {status === "idle" && (
              <button className="start-btn" onClick={start}>
                Start camera
              </button>
            )}
            {status === "loading-model" && <p>Loading hand-tracking model…</p>}
            {status === "requesting-camera" && <p>Requesting camera access…</p>}
            {status === "error" && (
              <div className="error-box">
                <p>Couldn&apos;t start: {errorMsg}</p>
                <button className="start-btn" onClick={start}>
                  Try again
                </button>
              </div>
            )}
          </div>
        )}

        {status === "running" && (
          <div className="hud">
            <span className="dot dot--live" />
            <span>
              {activeGestures.length > 0
                ? `${activeGestures
                    .map((id) => GESTURES.find((g) => g.id === id)?.label ?? id)
                    .join(", ")}`
                : "Show an open hand ✋ or point one finger up ☝️"}
            </span>
            <button className="stop-btn" onClick={stop}>
              Stop
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .stage {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
          max-width: 960px;
          margin: 0 auto;
        }
        .viewport {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          border-radius: 20px;
          overflow: hidden;
          background: #05060a;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.06) inset;
        }
        .video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          transform: scaleX(-1);
          filter: brightness(0.6) contrast(1.15) saturate(1.05);
        }
        .canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        .vignette {
          position: absolute;
          inset: 0;
          pointer-events: none;
          box-shadow: inset 0 0 120px 40px rgba(0, 0, 0, 0.65);
        }
        .overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(5, 6, 10, 0.55);
          backdrop-filter: blur(2px);
          color: #f4f1ea;
          font-size: 15px;
          text-align: center;
          padding: 24px;
        }
        .start-btn,
        .stop-btn {
          background: linear-gradient(135deg, #ff8a3d, #ff5c5c);
          color: #17120b;
          border: none;
          border-radius: 999px;
          padding: 10px 22px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: transform 0.15s ease, filter 0.15s ease;
        }
        .start-btn:hover {
          filter: brightness(1.08);
          transform: translateY(-1px);
        }
        .stop-btn {
          background: rgba(20, 18, 24, 0.55);
          color: #f4f1ea;
          border: 1px solid rgba(244, 241, 234, 0.35);
          padding: 5px 14px;
          font-weight: 600;
          font-size: 12px;
        }
        .error-box {
          display: flex;
          flex-direction: column;
          gap: 12px;
          align-items: center;
        }
        .hud {
          position: absolute;
          left: 50%;
          bottom: 18px;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          color: #f4f1ea;
          background: rgba(15, 13, 20, 0.55);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 999px;
          padding: 8px 10px 8px 16px;
          white-space: nowrap;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #555;
          flex-shrink: 0;
        }
        .dot--live {
          background: #ff8a3d;
          box-shadow: 0 0 0 4px rgba(255, 138, 61, 0.25);
          animation: pulse 1.6s ease-in-out infinite;
        }
        @keyframes pulse {
          0%,
          100% {
            box-shadow: 0 0 0 4px rgba(255, 138, 61, 0.25);
          }
          50% {
            box-shadow: 0 0 0 7px rgba(255, 138, 61, 0.12);
          }
        }
      `}</style>
    </div>
  );
}