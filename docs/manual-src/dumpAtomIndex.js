import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const [skills, texts, contract] = await Promise.all([
  readFile(new URL('src/config/base/skills.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('src/data/texts.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('docs/manual-src/contract.json', root), 'utf8').then(JSON.parse),
]);

const atoms = Object.fromEntries(Object.keys(contract.atoms).map(atom => [atom, []]));
const triggers = Object.fromEntries(contract.triggers.map(trigger => [trigger, []]));

function addEffects(effects, label, nested = false) {
  for (const effect of effects ?? []) {
    if (!atoms[effect.atom]) atoms[effect.atom] = [];
    atoms[effect.atom].push(`${label}${nested ? ' >嵌套' : ''}`);
    const children = effect.params?.effects;
    if (Array.isArray(children)) addEffects(children, label, true);
  }
}

function addBindings(bindings, prefix) {
  for (const binding of bindings ?? []) {
    const label = `${prefix}/${binding.trigger}`;
    if (!triggers[binding.trigger]) triggers[binding.trigger] = [];
    triggers[binding.trigger].push(label);
    addEffects(binding.effects, label);
  }
}

for (const card of skills.cards) {
  const name = texts.cards?.[card.id]?.name ?? card.id;
  const prefix = `${name}(${card.id})`;
  for (const [star, tier] of Object.entries(card.stars ?? {})) {
    addBindings(tier.equip, `${prefix} ${star}★`);
  }
  for (const checkpoint of card.evolutionTree?.checkpoints ?? []) {
    for (const option of checkpoint.options ?? []) {
      addBindings(option.equip, `${prefix} ${checkpoint.star}★ ${option.id}`);
    }
  }
  for (const shared of card.evolutionTree?.sharedNodes ?? []) {
    addBindings(shared.equip, `${prefix} ${shared.star}★ 共享`);
  }
  for (const [star, anchor] of Object.entries(card.consumable?.anchors ?? {})) {
    addEffects(anchor.effects, `${prefix} 消耗 ${star}★`);
  }
}

process.stdout.write(`${JSON.stringify({ atoms, triggers }, null, 1)}\n`);
