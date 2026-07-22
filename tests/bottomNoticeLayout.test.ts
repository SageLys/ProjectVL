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
    expect(css).toContain('bottom:calc(100% + 4px)');
    expect(css).toContain('calc((100dvh - 345px) * 540 / 730 + 16px)');
  });
});
