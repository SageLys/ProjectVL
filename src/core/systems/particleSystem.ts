import type { GameState, Rng } from '../types';

const TAU = Math.PI * 2;

/** 生成一枚粒子（纯模拟数据，渲染在表现层读取）。 */
export function spawnParticle(state: GameState, rng: Rng, x: number, y: number, color: string, speed = 80): void {
  const a = rng() * TAU;
  const s = rng() * speed;
  state.particles.push({
    x, y,
    vx: Math.cos(a) * s,
    vy: Math.sin(a) * s,
    life: 0.25 + rng() * 0.35,
    max: 0.6,
    color,
    size: 2 + rng() * 3,
  });
}

/** 推进粒子：位移 + 阻尼衰减 + 寿命递减，寿命耗尽移除。 */
export function updateParticles(state: GameState, dt: number): void {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.97;
    p.vy *= 0.97;
    p.life -= dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}
