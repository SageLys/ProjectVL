import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('restored pre-mobile-rework shell', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8');

  it('uses the direct game shell without the fixed transformed stage', () => {
    expect(html).toContain('<main class="game-shell">');
    expect(html).not.toContain('id="viewportHost"');
    expect(html).not.toContain('id="safeViewport"');
    expect(html).not.toContain('class="game-stage"');
    expect(css).not.toContain('.viewport-host');
    expect(css).not.toContain('.game-stage {');
    expect(css).not.toContain('transform:translate(var(--stage-x)');
  });

  it('restores the height-budgeted shell and responsive 540:730 arena', () => {
    expect(css).toMatch(/\.game-shell\s*\{[^}]*width:min\(100vw,calc\(\(100dvh - 345px\) \* 540 \/ 730 \+ 16px\),540px\)/s);
    expect(css).toMatch(/\.arena\s*\{[^}]*width:calc\(100% - 20px\)[^}]*aspect-ratio:540 \/ 730/s);
    expect(css).toMatch(/\.game-dock\s*\{[^}]*grid-template-rows:auto auto auto/s);
  });

  it('keeps the later compact card summary inside the restored slots', () => {
    expect(css).toContain('.game-shell .card-overview');
    expect(css).toContain('.game-shell .card-affix-compact');
    expect(css).toContain('.game-shell .card.equipped .affix-full');
  });
});
