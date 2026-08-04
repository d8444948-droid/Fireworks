# Hand Fireworks

Wave open hands ("jazz hands") at your webcam to set off fireworks. Built with Next.js,
MediaPipe Tasks Vision (HandLandmarker), and a small canvas particle engine.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000 and click **Start camera**. Grant camera permission, then hold
up an open, spread hand — a firework will burst from your wrist position. It works with
one or two hands.

MediaPipe's WASM runtime and the hand-landmark model are fetched from Google's CDN at
runtime (see `components/HandFireworks.tsx`), so no model files need to be checked in.
First load will take a second or two while they download.

## How it's structured

- **`lib/gestures.ts`** — pure, framework-free gesture detection over MediaPipe's 21
  hand landmarks. `openHandGesture` checks that all five fingers are extended (using
  distance-from-wrist, which is rotation-invariant) and spread apart. Gestures are
  registered in the `GESTURES` array.
- **`lib/fireworks.ts`** — a standalone canvas particle system (`FireworksEngine`) with
  `burst()` for a full firework and `sparkle()` for a lighter continuous effect while a
  gesture is held. No dependency on React or MediaPipe.
- **`components/HandFireworks.tsx`** — wires it together: starts the webcam, runs
  `HandLandmarker.detectForVideo()` every animation frame, runs each detected hand
  through `detectGestures()`, and triggers the fireworks engine at the wrist position
  when a gesture matches. A per-hand cooldown (550ms) prevents a held pose from flooding
  the screen with particles — you get one clean burst, then light sparkles until you
  release the gesture.

## Adding more gestures later

Add a new entry to `lib/gestures.ts`:

```ts
export const peaceSignGesture: Gesture = {
  id: "peace-sign",
  label: "Peace Sign",
  test: (hand) => {
    // your landmark logic here, e.g. index + middle extended,
    // ring + pinky curled
  },
};

export const GESTURES: Gesture[] = [openHandGesture, peaceSignGesture];
```

`detectGestures()` already runs every registered gesture, and `activeGestures` in
`HandFireworks.tsx` will show the matched id(s) in the HUD automatically. If you want
different visual effects per gesture (e.g. a different firework palette, or an entirely
different effect like confetti), branch on the matched gesture id where `engine.burst()`
is called and pass gesture-specific options — `FireworksEngine.burst()` already accepts
an optional `palette`.

## Notes / things you may want to tune

- **Sensitivity**: the spread threshold (`0.12` radians) and the "extended" tolerance
  (`* 1.02`) in `lib/gestures.ts` are reasonable defaults — tighten or loosen them if it
  misfires on your camera/lighting.
- **Cooldown**: `GESTURE_COOLDOWN_MS` in `HandFireworks.tsx` controls how often a held
  gesture re-bursts vs. just sparkling.
- **Performance**: `delegate: "GPU"` is set for the landmarker; if you see stutter on a
  low-power device, switch it to `"CPU"`.
- **Mirroring**: the video is CSS-mirrored (selfie view) and the burst origin is mirrored
  to match (`(1 - wrist.x) * canvasW`) — keep this in mind if you change the video layout.
