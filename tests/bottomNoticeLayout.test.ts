import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('bottom notification layout', () => {
  it('places one-line notifications after the hand dock', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const dockEnd = html.indexOf('</section>', html.indexOf('id="dock"'));
    const notice = html.indexOf('class="bottom-notice"');
    const toast = html.indexOf('id="toast"');

    expect(dockEnd).toBeGreaterThan(-1);
    expect(notice).toBeGreaterThan(dockEnd);
    expect(toast).toBeGreaterThan(notice);
  });
});
