import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('bottom notification layout', () => {
  it('places one-line notifications at the top edge of the dock without adding a row below the hand', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8');
    const dock = html.indexOf('id="dock"');
    const notice = html.indexOf('class="dock-toast"');
    const equipment = html.indexOf('id="equipmentBar"');
    const toast = html.indexOf('id="toast"');

    expect(notice).toBeGreaterThan(dock);
    expect(notice).toBeLessThan(equipment);
    expect(toast).toBeGreaterThan(notice);
    expect(html).not.toContain('bottom-notice');
    expect(css).toContain('.dock-toast { position:absolute;');
    expect(css).toContain('right:10px; top:4px;');
    expect(css).not.toMatch(/\.dock-toast\s*\{[^}]*bottom:calc\(100% \+ 4px\)/s);
    expect(css).toContain('.game-shell {');
    expect(css).not.toContain('transform:translate(var(--stage-x),var(--stage-y)) scale(var(--stage-scale))');
  });
});
