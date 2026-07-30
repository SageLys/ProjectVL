import { cfg } from '../src/config';
import { createDefaultConfig, createInitialState } from '../src/core/createInitialState';
import { registerSkillDefs } from '../src/core/effects/interpreter';
import { makeRng } from '../src/core/rng';
import { baselineDps, totalDamage, totalMaxHp, totalRange } from '../src/core/stats';
import { resolveCurrentDecision } from '../src/core/systems/decisionQueueSystem';
import { collectNearest } from '../src/core/systems/dropSystem';
import { consumeCard, moveOrSwap } from '../src/core/systems/equipmentSystem';
import { beginOpeningIntermission, confirmIntermissionReady } from '../src/core/systems/intermissionSystem';
import { confirmRewardReceipt } from '../src/core/systems/rewardMeterSystem';
import { updateGame } from '../src/core/updateGame';

const seed = Number(process.argv[2] ?? 42);
const rng = makeRng(seed);
const state = createInitialState('hell');
const config = createDefaultConfig();
state.mode = 'playing';
state.hp = 1_000_000;
registerSkillDefs(cfg.skills.cards);
beginOpeningIntermission(state);

const checkpoints: Record<string, unknown> = {};
for (let frame = 0; frame < 30 * 60 * 45 && state.mode === 'playing'; frame++) {
  state.hp = 1_000_000;
  updateGame(state, config, rng, 1 / 30);
  while (state.rewardMeter.currentReceipt) confirmRewardReceipt(state, config, rng);
  if (state.decisions.current) {
    const decision = state.decisions.current;
    const choice = decision.kind === 'godDraft' || decision.kind === 'godFocus'
      || decision.kind === 'waveBaseReward'
      ? decision.candidates[0]
      : decision.kind === 'evolutionBranch'
        ? decision.options[0]
        : '';
    resolveCurrentDecision(state, config, rng, choice);
  }
  if (state.intermission.active && state.intermission.step === 'free') confirmIntermissionReady(state);
  if (frame % 6 === 0 && state.groundDrops.length) {
    const drop = state.groundDrops[0];
    collectNearest(state, config, rng, drop.x, drop.y, cfg.economy.drops.pickupRadius);
  }
  if (frame % 30 === 0) {
    const source = state.cards.findIndex(card => card && card.star >= cfg.economy.equipThreshold);
    const target = state.equipment.findIndex(card => card === null);
    if (source >= 0 && target >= 0) moveOrSwap(state, config, rng, 'cards', source, 'equipment', target);
  }
  if (frame % 15 === 0 && state.cards.filter(card => card === null).length <= 1) {
    const oneStar = state.cards.findIndex(card => card?.star === 1);
    const source = oneStar >= 0 ? oneStar : state.cards.findIndex(Boolean);
    if (source >= 0) consumeCard(state, config, rng, source, 480, 300);
  }

  for (const wave of [5, 10]) {
    if (state.wave < wave || checkpoints[wave]) continue;
    checkpoints[wave] = {
      frame,
      totalDamage: totalDamage(state, config),
      baselineDps: baselineDps(state, config),
      totalRange: totalRange(state, config),
      totalMaxHp: totalMaxHp(state),
      runBaseStats: { ...state.runBaseStats },
      equipment: state.equipment.filter(Boolean).map(card => ({
        type: card!.type,
        affixes: state.runBuild.cardAffixRolls[card!.type] ?? [],
      })),
    };
  }
}

console.log(JSON.stringify({ seed, mode: state.mode, finalWave: state.wave, checkpoints }, null, 2));
