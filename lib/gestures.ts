// MediaPipe HandLandmarker returns 21 normalized landmarks per hand.
// Reference indices: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker#hand_landmark_model_bundle
// 0 wrist
// 1-4 thumb (cmc, mcp, ip, tip)
// 5-8 index (mcp, pip, dip, tip)
// 9-12 middle
// 13-16 ring
// 17-20 pinky

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type Handedness = "Left" | "Right";

export interface DetectedHand {
  landmarks: Landmark[];
  handedness: Handedness;
}

export interface Gesture {
  id: string;
  label: string;
  /** Returns true if this hand's landmarks match the gesture. */
  test: (hand: DetectedHand) => boolean;
}

const dist = (a: Landmark, b: Landmark) =>
  Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

const FINGERS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
} as const;

/**
 * A finger counts as "extended" when the distance from the wrist grows
 * monotonically out toward the fingertip. This is rotation-invariant
 * (works whether the hand is upright, sideways, or tilted toward the
 * camera) unlike a plain y-coordinate comparison.
 */
function isFingerExtended(landmarks: Landmark[], wrist: Landmark, chain: readonly number[]): boolean {
  const distances = chain.map((i) => dist(wrist, landmarks[i]));
  for (let i = 1; i < distances.length; i++) {
    if (distances[i] <= distances[i - 1] * 1.02) return false;
  }
  return true;
}

function extendedFingers(hand: DetectedHand) {
  const { landmarks } = hand;
  const wrist = landmarks[0];
  return {
    thumb: isFingerExtended(landmarks, wrist, FINGERS.thumb),
    index: isFingerExtended(landmarks, wrist, FINGERS.index),
    middle: isFingerExtended(landmarks, wrist, FINGERS.middle),
    ring: isFingerExtended(landmarks, wrist, FINGERS.ring),
    pinky: isFingerExtended(landmarks, wrist, FINGERS.pinky),
  };
}

/** Average angular gap (radians) between adjacent fingertips, as seen from the wrist. */
function fingerSpread(hand: DetectedHand): number {
  const { landmarks } = hand;
  const wrist = landmarks[0];
  const tips = [8, 12, 16, 20].map((i) => landmarks[i]); // index -> pinky
  const angles = tips.map((tip) => Math.atan2(tip.y - wrist.y, tip.x - wrist.x));
  let total = 0;
  for (let i = 1; i < angles.length; i++) {
    total += Math.abs(angles[i] - angles[i - 1]);
  }
  return total / (angles.length - 1);
}

/**
 * "Jazz hands": open palm, every finger extended and fanned apart.
 * This is the first gesture in the registry below — add more the same way.
 */
export const openHandGesture: Gesture = {
  id: "open-hand",
  label: "Open Hand",
  test: (hand) => {
    const f = extendedFingers(hand);
    const allExtended = f.thumb && f.index && f.middle && f.ring && f.pinky;
    const spread = fingerSpread(hand);
    // ~0.12 rad (~7deg) average gap is enough to distinguish a fanned-out
    // hand from fingers held tightly together.
    return allExtended && spread > 0.12;
  },
};

/**
 * Landmark index for each fingertip — handy when an effect needs to track a
 * specific point rather than the whole hand (e.g. a sparkler on the index tip).
 */
export const FINGERTIP = {
  thumb: 4,
  index: 8,
  middle: 12,
  ring: 16,
  pinky: 20,
} as const;

/**
 * A single finger held up — index extended, everything else (besides the
 * thumb, which is ambiguous in this pose) curled in.
 */
export const indexPointGesture: Gesture = {
  id: "index-point",
  label: "Index Finger",
  test: (hand) => {
    const f = extendedFingers(hand);
    return f.index && !f.middle && !f.ring && !f.pinky;
  },
};

/**
 * Registry of all known gestures. Import this list to run detection, and
 * append new Gesture objects here (e.g. a fist, a peace sign, thumbs up)
 * to wire in new effects without touching the detection loop.
 */
export const GESTURES: Gesture[] = [openHandGesture, indexPointGesture];

/** Runs every registered gesture against a hand, returning the ids that matched. */
export function detectGestures(hand: DetectedHand): string[] {
  return GESTURES.filter((g) => g.test(hand)).map((g) => g.id);
}