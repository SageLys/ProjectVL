import { readFileSync, writeFileSync } from 'node:fs';

const skillsPath = new URL('../src/config/base/skills.json', import.meta.url);
const outputPath = new URL(
  '../Unity/ProjectVLUnity/Assets/ProjectVL/Resources/Config/evolutionBranchEffects.json',
  import.meta.url,
);
const skills = JSON.parse(readFileSync(skillsPath, 'utf8'));

function scalarParams(value, prefix = '', output = []) {
  if (value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    if (value.every(item => ['string', 'number', 'boolean'].includes(typeof item))) {
      output.push({ key: prefix, kind: 'array', text: value.map(String).join('|') });
    }
    return output;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (['effects', 'onDeathEffects', 'auraEffects', 'intervalEffects'].includes(key)) continue;
      scalarParams(child, prefix ? `${prefix}.${key}` : key, output);
    }
    return output;
  }
  const entry = { key: prefix, kind: typeof value };
  if (typeof value === 'number') entry.number = value;
  else if (typeof value === 'boolean') entry.flag = value;
  else entry.text = value;
  output.push(entry);
  return output;
}

function childEffects(container, relation, output) {
  if (!container || typeof container !== 'object') return;
  for (const key of ['effects', 'onDeathEffects', 'auraEffects', 'intervalEffects']) {
    if (!Array.isArray(container[key])) continue;
    const childRelation = key === 'effects' ? relation : key;
    for (const effect of container[key]) output.push(compileAtom(effect, childRelation));
  }
}

function compileAtom(effect, relation = 'direct') {
  const children = [];
  childEffects(effect?.params, 'paramEffect', children);
  childEffects(effect?.forEach, 'forEachEffect', children);
  const params = [
    ...scalarParams(effect?.params),
    ...scalarParams(effect?.scaleBy, 'scaleBy'),
    ...scalarParams(effect?.forEach?.set, 'forEach.set'),
    ...scalarParams(effect?.forEach?.maxTargets, 'forEach.maxTargets'),
    ...scalarParams(effect?.forEach?.order, 'forEach.order'),
  ];
  if (effect?.at !== undefined) scalarParams(effect.at, 'at', params);
  return { atom: String(effect?.atom ?? ''), relation, params, children };
}

function compileBinding(binding) {
  return {
    trigger: binding.trigger,
    at: typeof binding.at === 'string' ? binding.at : '',
    triggerParams: scalarParams(binding.triggerParams),
    effects: (binding.effects ?? []).map(effect => compileAtom(effect)),
  };
}

const cards = skills.cards.filter(card => card.recipeOnly !== true);
const output = {
  version: '1.0.0',
  sourceVersion: skills.version,
  cards: cards.map(card => {
    const checkpoint = card.evolutionTree?.checkpoints?.find(item => item.star === 5);
    return {
      cardId: card.id,
      options: (checkpoint?.options ?? []).map(option => ({
        optionId: option.id,
        bindings: (option.equip ?? []).map(compileBinding),
      })),
    };
  }),
};

writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
const options = output.cards.reduce((sum, card) => sum + card.options.length, 0);
const bindings = output.cards.reduce((sum, card) => sum
  + card.options.reduce((n, option) => n + option.bindings.length, 0), 0);
const countAtom = atom => 1 + atom.children.reduce((sum, child) => sum + countAtom(child), 0);
const atoms = output.cards.reduce((sum, card) => sum + card.options.reduce(
  (optionSum, option) => optionSum + option.bindings.reduce(
    (bindingSum, binding) => bindingSum + binding.effects.reduce(
      (effectSum, atom) => effectSum + countAtom(atom), 0), 0), 0), 0);
console.log(`Exported ${output.cards.length} cards, ${options} five-star options, ${bindings} bindings and ${atoms} atoms.`);
