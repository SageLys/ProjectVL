import { describe, expect, it } from 'vitest';
import { canvasPoint, distanceFrom, isTap, resolveTarget } from '../src/input/pointerRouter';

const input = { tapMaxPx: 8, tapMaxMs: 150 };
const start = { x: 10, y: 20, at: 1000 };

describe('pointerRouter · 阈值', () => {
  it('位移与时长都严格小于阈值才是点击', () => expect(isTap(start, { x: 13, y: 24, at: 1149 }, 5, input)).toBe(true));
  it('位移等于阈值判拖拽', () => expect(isTap(start, { x: 18, y: 20, at: 1100 }, 8, input)).toBe(false));
  it('时长等于阈值判拖拽', () => expect(isTap(start, { x: 10, y: 20, at: 1150 }, 0, input)).toBe(false));
  it('按整段最大位移而非最终位移判定', () => expect(isTap(start, { x: 10, y: 20, at: 1100 }, 9, input)).toBe(false));
});

describe('pointerRouter · 坐标与取消', () => {
  it('把 CSS 显示坐标等比换算到 540×960 画布', () => {
    expect(canvasPoint({ width: 540, height: 960 }, { left: 10, top: 20, width: 270, height: 480 } as DOMRect, 145, 260)).toEqual({ x: 270, y: 480 });
  });
  it('计算 pointerdown 后的欧氏位移', () => expect(distanceFrom(start, 16, 28)).toBe(10));
  it('出屏/非画布/非卡格落点走取消路径', () => {
    expect(resolveTarget({ width: 540, height: 960 }, { left: 0, top: 0, right: 270, bottom: 480, width: 270, height: 480 }, -1, 100)).toEqual({ kind: 'cancel' });
  });
  it('画布抬指返回换算后的释放落点', () => {
    expect(resolveTarget({ width: 540, height: 960 }, { left: 0, top: 0, right: 270, bottom: 480, width: 270, height: 480 }, 135, 240)).toEqual({ kind: 'arena', x: 270, y: 480 });
  });
  it('卡格优先于下方画布并保留目标索引', () => expect(resolveTarget({ width: 540, height: 960 }, { left: 0, top: 0, right: 270, bottom: 480, width: 270, height: 480 }, 100, 100, { slotKind: 'cards', index: 3 })).toEqual({ kind: 'slot', slotKind: 'cards', index: 3 }));
});
