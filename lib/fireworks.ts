export interface Vec2 {
  x: number;
  y: number;
}

type BurstStyle = "peony" | "chrysanthemum" | "willow" | "crackle";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // seconds remaining
  maxLife: number;
  colorStart: string; // hot core color, cools into colorEnd over the particle's life
  colorEnd: string;
  size: number;
  gravity: number;
  drag: number;
  trail: Vec2[];
  trailLength: number;
  twinkle: boolean;
  twinklePhase: number;
  crackle: boolean; // eligible to pop a secondary mini-burst as it dies
  crackled: boolean;
  flash?: boolean; // rendered as a large soft radial flash instead of a dot
}

const SHELL_PALETTES: string[][] = [
  ["#ff5e5e", "#ff9d5c", "#ffd15c"], // warm ember
  ["#5ec8ff", "#5c86ff", "#a15cff"], // cool violet-blue
  ["#5cffb0", "#5cffe0", "#5cc8ff"], // sea green-cyan
  ["#ff5cd1", "#ff5c8a", "#ffb85c"], // magenta-coral
  ["#ffe45c", "#fff2b0", "#ffcc5c"], // gold
  ["#c15cff", "#ff5cf1", "#5c86ff"], // purple-pink
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const bigint = parseInt(h, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

function lerpColor(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const clamped = Math.max(0, Math.min(1, t));
  const r = Math.round(ca.r + (cb.r - ca.r) * clamped);
  const g = Math.round(ca.g + (cb.g - ca.g) * clamped);
  const bch = Math.round(ca.b + (cb.b - ca.b) * clamped);
  return `rgb(${r}, ${g}, ${bch})`;
}

export class FireworksEngine {
  private particles: Particle[] = [];
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private clock = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    this.ctx = ctx;
  }

  resize(width: number, height: number, dpr = window.devicePixelRatio || 1) {
    this.width = width;
    this.height = height;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Spawns one realistic firework shell-burst centered at (x, y) in canvas pixel coordinates. */
  burst(origin: Vec2, opts: { style?: BurstStyle; palette?: string[] } = {}) {
    const style = opts.style ?? pick<BurstStyle>(["peony", "chrysanthemum", "willow", "crackle"]);
    const palette = opts.palette ?? pick(SHELL_PALETTES);
    const hotCore = "#fffbe8";

    // Bright core flash — the instantaneous "pop" of the shell igniting.
    this.particles.push({
      x: origin.x,
      y: origin.y,
      vx: 0,
      vy: 0,
      life: 0.18,
      maxLife: 0.18,
      colorStart: "#ffffff",
      colorEnd: "#ffffff",
      size: 48,
      gravity: 0,
      drag: 1,
      trail: [],
      trailLength: 0,
      twinkle: false,
      twinklePhase: 0,
      crackle: false,
      crackled: false,
      flash: true,
    });

    const count = style === "chrysanthemum" ? 90 : style === "willow" ? 70 : 80;
    const speed = style === "willow" ? 210 : 300;
    const gravity = style === "willow" ? 340 : 190;
    const drag = style === "willow" ? 0.985 : 0.965;
    const trailLength = style === "peony" ? 3 : 6;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.25;
      const velocity = speed * (0.55 + Math.random() * 0.55);
      const maxLife = style === "willow" ? 1.6 + Math.random() * 0.5 : 1.1 + Math.random() * 0.6;
      this.particles.push({
        x: origin.x,
        y: origin.y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: maxLife,
        maxLife,
        colorStart: hotCore,
        colorEnd: pick(palette),
        size: 1.6 + Math.random() * 1.8,
        gravity,
        drag,
        trail: [],
        trailLength,
        twinkle: style === "chrysanthemum" || Math.random() < 0.3,
        twinklePhase: Math.random() * Math.PI * 2,
        crackle: style === "crackle" && Math.random() < 0.55,
        crackled: false,
      });
    }
  }

  private popCrackle(p: Particle) {
    const sparks = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < sparks; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = 40 + Math.random() * 90;
      const maxLife = 0.2 + Math.random() * 0.25;
      this.particles.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: maxLife,
        maxLife,
        colorStart: "#ffffff",
        colorEnd: "#ffe9a8",
        size: 1 + Math.random(),
        gravity: 220,
        drag: 0.92,
        trail: [],
        trailLength: 2,
        twinkle: true,
        twinklePhase: Math.random() * Math.PI * 2,
        crackle: false,
        crackled: false,
      });
    }
  }

  /** Lightweight ambient sparkle, used while a gesture is being held. */
  sparkle(origin: Vec2) {
    for (let i = 0; i < 4; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = 30 + Math.random() * 60;
      const maxLife = 0.4 + Math.random() * 0.3;
      const color = pick(pick(SHELL_PALETTES));
      this.particles.push({
        x: origin.x + (Math.random() - 0.5) * 20,
        y: origin.y + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 40,
        life: maxLife,
        maxLife,
        colorStart: "#ffffff",
        colorEnd: color,
        size: 1.5 + Math.random(),
        gravity: 60,
        drag: 0.96,
        trail: [],
        trailLength: 3,
        twinkle: true,
        twinklePhase: Math.random() * Math.PI * 2,
        crackle: false,
        crackled: false,
      });
    }
  }

  /**
   * Emits a few fizzing, short-lived sparks around a point. Call this every
   * frame while a "sparkler" gesture (e.g. one finger up) is held, tracking
   * the tip position — it reads as a lit sparkler rather than a burst.
   */
  sparklerTick(origin: Vec2) {
    const count = 3 + Math.floor(Math.random() * 3);
    const sparklerColors = ["#fff8e1", "#ffd700", "#ffecb3", "#fff176", "#ffe082"];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 90;
      const maxLife = 0.15 + Math.random() * 0.25;
      this.particles.push({
        x: origin.x + (Math.random() - 0.5) * 6,
        y: origin.y + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: maxLife,
        maxLife,
        colorStart: "#ffffff",
        colorEnd: pick(sparklerColors),
        size: 0.8 + Math.random() * 1.2,
        gravity: 260,
        drag: 0.9,
        trail: [],
        trailLength: 2,
        twinkle: false,
        twinklePhase: 0,
        crackle: false,
        crackled: false,
      });
    }
  }

  update(dt: number) {
    this.clock += dt;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    this.particles = this.particles.filter((p) => p.life > 0);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;

      if (p.flash) {
        const t = p.life / p.maxLife;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        grad.addColorStop(0, `rgba(255,255,255,${0.85 * t})`);
        grad.addColorStop(0.4, `rgba(255,244,214,${0.4 * t})`);
        grad.addColorStop(1, "rgba(255,244,214,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.trailLength > 0) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > p.trailLength) p.trail.shift();
      }

      const cooled = 1 - p.life / p.maxLife;
      const color = lerpColor(p.colorStart, p.colorEnd, Math.min(cooled * 2.2, 1));
      let alpha = Math.max(p.life / p.maxLife, 0);
      if (p.twinkle) {
        alpha *= 0.55 + 0.45 * Math.sin(this.clock * 18 + p.twinklePhase);
        alpha = Math.max(alpha, 0);
      }

      // Trail: fading line through recent positions.
      for (let i = 1; i < p.trail.length; i++) {
        const from = p.trail[i - 1];
        const to = p.trail[i];
        const segAlpha = alpha * (i / p.trail.length) * 0.5;
        ctx.strokeStyle = color;
        ctx.globalAlpha = segAlpha;
        ctx.lineWidth = Math.max(p.size * 0.6, 0.5);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }

      // Head: bright glowing dot.
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = p.size * 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();

      if (p.crackle && !p.crackled && p.life / p.maxLife < 0.45 && Math.random() < 0.06) {
        p.crackled = true;
        this.popCrackle(p);
      }
    }

    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  get particleCount() {
    return this.particles.length;
  }
}