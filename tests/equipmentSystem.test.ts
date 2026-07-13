import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { consumeCard, moveOrSwap, unequipDestroy } from '../src/core/systems/equipmentSystem';
import { card, freshState, createDefaultConfig, constRng, resetTestEnv } from './helpers';

const config = createDefaultConfig(); const rng = constRng(0.5);
beforeEach(resetTestEnv); afterEach(resetTestEnv);

describe('equipmentSystem · 方案A永久装备', () => {
  it('1★拖入装备格被拒且无副作用', () => { const s=freshState(); s.cards[0]=card('damage',1); expect(moveOrSwap(s,config,rng,'cards',0,'equipment',0)).toEqual([{type:'equipRejected',reason:'star'}]); expect(s.cards[0]?.star).toBe(1); expect(s.equipment[0]).toBeNull(); expect(s.equipOps).toBe(0); });
  it('2★拖入装备格被拒且反馈门槛', () => { const s=freshState(); s.cards[0]=card('damage',2); expect(moveOrSwap(s,config,rng,'cards',0,'equipment',0)).toEqual([{type:'equipRejected',reason:'star'}]); });
  it('3★与6★均可装备并产出 equipped', () => { for(const star of [3,6]){ const s=freshState(); s.cards[0]=card('damage',star); expect(moveOrSwap(s,config,rng,'cards',0,'equipment',0)).toContainEqual({type:'equipped',cardType:'damage',star,slotIndex:0}); expect(s.cards[0]).toBeNull(); expect(s.equipment[0]?.star).toBe(star); } });
  it('同类型已占位时不同星拒绝', () => { const s=freshState(); s.equipment[0]=card('damage',3); s.cards[0]=card('damage',4); expect(moveOrSwap(s,config,rng,'cards',0,'equipment',1)).toEqual([{type:'equipRejected',reason:'duplicate'}]); });
  it('替换别类目标时同类型仍唯一', () => { const s=freshState(); s.equipment[0]=card('damage',3); s.equipment[1]=card('rate',3); s.cards[0]=card('damage',4); expect(moveOrSwap(s,config,rng,'cards',0,'equipment',1)).toEqual([{type:'equipRejected',reason:'duplicate'}]); });
  it('同型同星喂养直接升星且不产生 equipped', () => { const s=freshState(); s.equipment[0]=card('damage',3); s.cards[0]=card('damage',3); const ev=moveOrSwap(s,config,rng,'cards',0,'equipment',0); expect(ev).toContainEqual({type:'fed',cardType:'damage',resultStar:4}); expect(ev.some(e=>e.type==='equipped')).toBe(false); expect(s.cards[0]).toBeNull(); expect(s.equipment[0]?.star).toBe(4); });
  it('装备卡不能拖回手牌', () => { const s=freshState(); const c=card('damage',3); s.equipment[0]=c; expect(moveOrSwap(s,config,rng,'equipment',0,'cards',0)).toEqual([]); expect(s.equipment[0]).toBe(c); expect(s.cards[0]).toBeNull(); });
  it('销毁清空格位、无手牌返还并产出事件', () => { const s=freshState(); s.equipment[1]=card('range',5); expect(unequipDestroy(s,1)).toEqual([{type:'equipmentDestroyed',cardType:'range',star:5,slotIndex:1}]); expect(s.equipment[1]).toBeNull(); expect(s.cards.every(c=>c===null)).toBe(true); expect(s.equipOps).toBe(1); });
  it('销毁空格无副作用', () => { const s=freshState(); expect(unequipDestroy(s,0)).toEqual([]); expect(s.equipOps).toBe(0); });
});

describe('equipmentSystem · 遥测拆分', () => {
  it('消耗只计 consumes', () => { const s=freshState(); s.cards[0]=card('rate',2); consumeCard(s,config,rng,0,1,2); expect(s.consumes).toBe(1); expect(s.equipOps).toBe(0); });
});
