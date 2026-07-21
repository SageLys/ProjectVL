// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPointerRouter, type DropTarget } from '../src/input/pointerRouter';
import { consumeCard, moveOrSwap } from '../src/core/systems/equipmentSystem';
import { renderCards } from '../src/ui/renderCards';
import { renderEquipment } from '../src/ui/renderEquipment';
import { SLOT_CHANGING } from '../src/ui/eventText';
import type { GameEvent } from '../src/core/types';
import type { SlotHandlers, SlotSource } from '../src/ui/slotFactory';
import { card, constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

describe('equipment pointer flow', () => {
  beforeEach(resetTestEnv);
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
    resetTestEnv();
  });

  it('keeps the equipment source/index through an arena drop, clears the DOM, and accepts a replacement', () => {
    document.body.innerHTML = `
      <canvas id="game" width="540" height="730"></canvas>
      <div id="dock"><div id="equipmentSlots"></div><div id="cards"></div></div>
      <div id="aimPreview"></div><div id="screenPreview"></div>
    `;

    const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
    const equipmentSlots = document.querySelector<HTMLElement>('#equipmentSlots')!;
    const cards = document.querySelector<HTMLElement>('#cards')!;
    const state = freshState();
    const config = createDefaultConfig();
    const rng = constRng(0.5);
    state.equipment[1] = card('pierce', 3);
    state.cards[0] = card('frost', 3);

    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 540, bottom: 730, width: 540, height: 730 }),
    });

    let hit: Element = canvas;
    vi.spyOn(document, 'elementFromPoint').mockImplementation(() => hit);
    const drops: Array<{ source: SlotSource; index: number; target: Exclude<DropTarget, { kind: 'cancel' }> }> = [];
    let router: ReturnType<typeof createPointerRouter>;
    const handlers: SlotHandlers = {
      dragStart(event, source, index, element) { router.begin(event, source, index, element); },
    };
    const refs = { cards, equipmentSlots } as never;
    const refreshSlots = () => {
      renderCards(refs, state, handlers);
      renderEquipment(refs, state, handlers);
    };
    const dispatch = (events: GameEvent[]) => {
      if (events.some(event => SLOT_CHANGING.has(event.type))) refreshSlots();
    };

    router = createPointerRouter({
      canvas,
      dock: document.querySelector<HTMLElement>('#dock')!,
      aimPreview: document.querySelector<HTMLElement>('#aimPreview')!,
      screenPreview: document.querySelector<HTMLElement>('#screenPreview')!,
      input: { tapMaxPx: 8, tapMaxMs: 150, reticleOffsetY: 30, confirmStyle: 'hold-ring', holdOrDbl: 'double-tap' },
      onArenaTap() {},
      onDrop(source, index, target) {
        drops.push({ source, index, target });
        let events: GameEvent[] = [];
        if (source === 'wildcard') return;
        if (target.kind === 'arena') events = consumeCard(state, config, rng, index, target.x, target.y, source);
        else events = moveOrSwap(state, config, rng, source, index, target.slotKind, target.index);
        dispatch(events);
      },
      previewFor: () => ({ placement: 'none' }),
    });
    refreshSlots();

    const equipped = equipmentSlots.querySelector<HTMLElement>('[data-testid="equipment-slot"][data-index="1"] [data-testid="equipped-card"]')!;
    equipped.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, button: 0, clientX: 270, clientY: 800 }));
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientX: 270, clientY: 365 }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientX: 270, clientY: 365 }));

    expect(drops[0]).toEqual({ source: 'equipment', index: 1, target: { kind: 'arena', x: 270, y: 365 } });
    expect(state.equipment[1]).toBeNull();
    const freedSlot = equipmentSlots.querySelector<HTMLElement>('[data-testid="equipment-slot"][data-index="1"]')!;
    expect(freedSlot.textContent).toBe('3★+');
    expect(freedSlot.querySelector('[data-testid="equipped-card"]')).toBeNull();

    hit = freedSlot;
    const replacement = cards.querySelector<HTMLElement>('[data-testid="card-slot"][data-index="0"] [data-testid="upgrade-card"]')!;
    replacement.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 8, button: 0, clientX: 270, clientY: 800 }));
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 8, clientX: 270, clientY: 760 }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 8, clientX: 270, clientY: 760 }));

    expect(drops[1]).toEqual({ source: 'cards', index: 0, target: { kind: 'slot', slotKind: 'equipment', index: 1 } });
    expect(state.equipment[1]?.type).toBe('frost');
    expect(state.cards[0]).toBeNull();
  });
});
