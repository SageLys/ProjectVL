import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('compact stage proportions', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8');

  it('reserves roughly one third of the compact stage for the dock', () => {
    expect(css).toMatch(
      /\.game-stage\[data-layout="compact"\]\s*\{[^}]*--hud-logical-height:70px;[^}]*--arena-logical-width:444px;[^}]*--arena-logical-height:600px;[^}]*--dock-logical-height:350px;/s,
    );
    expect(70 + 600 + 350).toBe(1020);
    expect(350 / 1020).toBeGreaterThan(0.33);
  });

  it('uses taller cards, smaller titles, and three visible effect lines on short screens', () => {
    expect(css).toContain('.game-stage[data-layout="compact"] .card-slot { height:118px; min-height:118px; }');
    expect(css).toContain('.game-stage[data-layout="compact"] .card-name { font-size:14px; }');
    expect(css).toMatch(
      /\.game-stage\[data-layout="compact"\] \.card-affix-compact\s*\{[^}]*-webkit-line-clamp:3;[^}]*font-size:14px;/s,
    );
  });
});
