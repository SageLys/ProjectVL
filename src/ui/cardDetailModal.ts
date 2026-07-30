import type { Card } from '../core/types';
import { buildCardDetailViewModel, type CardDetailViewModel, type EffectSection, type RecipeDisplayContext } from './cardDetailModel';
import type { EffectTextBlock } from './effectText';

export interface CardDetailModalHooks {
  onOpen(): void;
  onClose(): void;
  recipeContext?(): RecipeDisplayContext;
}

export interface CardDetailModal {
  open(card: Card, source: 'cards' | 'equipment', returnFocus?: HTMLElement): void;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

/** 卡牌详情的可访问弹窗外壳；内容模型由后续展示层注入。 */
export function createCardDetailModal(hooks: CardDetailModalHooks): CardDetailModal {
  const overlay = document.createElement('div');
  const dialog = document.createElement('section');
  const header = document.createElement('header');
  const title = document.createElement('h2');
  const closeButton = document.createElement('button');
  const scroll = document.createElement('div');
  let open = false;
  let focusTarget: HTMLElement | null = null;

  overlay.className = 'card-detail-modal';
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  dialog.className = 'card-detail-card';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'cardDetailTitle');
  header.className = 'card-detail-header';
  title.id = 'cardDetailTitle';
  closeButton.type = 'button';
  closeButton.className = 'card-detail-close';
  closeButton.setAttribute('aria-label', '关闭卡牌详情');
  closeButton.textContent = '×';
  scroll.className = 'card-detail-scroll';
  header.append(title, closeButton);
  dialog.append(header, scroll);
  overlay.append(dialog);
  document.body.append(overlay);

  function close(): void {
    if (!open) return;
    open = false;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    hooks.onClose();
    const target = focusTarget;
    focusTarget = null;
    if (target?.isConnected) target.focus();
  }

  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', event => {
    if (event.target === overlay) close();
  });
  const onKeyDown = (event: KeyboardEvent) => {
    if (open && event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };
  document.addEventListener('keydown', onKeyDown);

  function renderBlocks(blocks: EffectTextBlock[], empty = '暂无效果。'): HTMLElement {
    const container = document.createElement('div');
    container.className = 'effect-blocks';
    if (!blocks.length) {
      const note = document.createElement('p');
      note.className = 'card-detail-empty';
      note.textContent = empty;
      container.append(note);
      return container;
    }
    for (const block of blocks) {
      const article = document.createElement('article');
      article.className = 'effect-block';
      const trigger = document.createElement('h4');
      trigger.textContent = block.trigger;
      const list = document.createElement('ul');
      for (const line of block.lines) {
        const item = document.createElement('li');
        item.textContent = line.text;
        if (line.depth) item.style.setProperty('--effect-depth', String(line.depth));
        list.append(item);
      }
      article.append(trigger, list);
      container.append(article);
    }
    return container;
  }

  function renderEffectSection(section: EffectSection): HTMLElement {
    const element = document.createElement('section');
    element.className = 'card-detail-section';
    const heading = document.createElement('h3');
    heading.textContent = section.title;
    const hint = document.createElement('p');
    hint.className = 'card-detail-hint';
    hint.textContent = section.hint;
    element.append(heading, hint, renderBlocks(section.blocks, section.empty));
    return element;
  }

  function renderModel(model: CardDetailViewModel): void {
    title.textContent = `${model.star}★ ${model.name}`;
    dialog.style.setProperty('--detail-accent', model.accent);
    const intro = document.createElement('section');
    intro.className = 'card-detail-intro';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = model.iconSvg;
    const introCopy = document.createElement('div');
    const meta = document.createElement('p');
    meta.className = 'card-detail-meta';
    meta.textContent = `${model.sourceLabel} · ${model.god} · ${model.category}`;
    const overview = document.createElement('p');
    overview.className = 'card-detail-overview';
    overview.textContent = model.overview;
    const route = document.createElement('p');
    route.className = 'card-detail-route';
    route.textContent = `当前路线：${model.currentRoute}`;
    introCopy.append(meta, overview, route);
    intro.append(icon, introCopy);

    const effects = document.createElement('section');
    effects.className = 'card-detail-group';
    const effectTitle = document.createElement('h3');
    effectTitle.textContent = '当前效果';
    effects.append(effectTitle, renderEffectSection(model.consume), renderEffectSection(model.equip));

    const affixes = document.createElement('section');
    affixes.className = 'card-detail-group';
    const affixTitle = document.createElement('h3');
    affixTitle.textContent = '数值词条';
    affixes.append(affixTitle);
    if (!model.affixes.length) {
      const empty = document.createElement('p');
      empty.className = 'card-detail-empty';
      empty.textContent = '这张卡没有数值词条。';
      affixes.append(empty);
    }
    for (const affix of model.affixes) {
      const item = document.createElement('article');
      item.className = 'affix-detail';
      const value = document.createElement('strong');
      value.textContent = affix.value;
      const equipment = document.createElement('p');
      equipment.textContent = affix.equipment;
      const consumable = document.createElement('p');
      consumable.textContent = affix.consumable;
      item.append(value, equipment, consumable);
      affixes.append(item);
    }

    const glossary = document.createElement('section');
    glossary.className = 'card-detail-group';
    const glossaryTitle = document.createElement('h3');
    glossaryTitle.textContent = '关键词解释';
    const terms = document.createElement('dl');
    for (const entry of model.glossary) {
      const term = document.createElement('dt');
      term.textContent = entry.term;
      const description = document.createElement('dd');
      description.textContent = entry.description;
      terms.append(term, description);
    }
    glossary.append(glossaryTitle, terms);
    if (!model.glossary.length) {
      const empty = document.createElement('p');
      empty.className = 'card-detail-empty';
      empty.textContent = '当前效果没有额外机制关键词。';
      glossary.append(empty);
    }

    const tree = document.createElement('section');
    tree.className = 'card-detail-group';
    const treeTitle = document.createElement('h3');
    treeTitle.textContent = '完整技能树与进化配方';
    tree.append(treeTitle);
    for (const ingredient of model.tree.asIngredient) {
      const preview = document.createElement('article');
      preview.className = `skill-recipe-ingredient${ingredient.compatible ? '' : ' unavailable'}`;
      preview.dataset.recipeId = ingredient.recipeId;
      const heading = document.createElement('h4');
      heading.textContent = '进化配方（作为材料）';
      const notice = document.createElement('p');
      notice.textContent = ingredient.notice;
      preview.append(heading, notice);
      tree.append(preview);
    }
    if (model.tree.recipe) {
      const recipe = document.createElement('article');
      recipe.className = 'skill-recipe';
      const formula = document.createElement('strong');
      formula.textContent = `${model.tree.recipe.ingredientA} + ${model.tree.recipe.ingredientB} → ${model.tree.recipe.output}`;
      const notice = document.createElement('p');
      notice.textContent = model.tree.recipe.notice;
      recipe.append(formula, notice, renderBlocks(model.tree.recipe.exactEffects));
      tree.append(recipe);
    } else {
      const track = document.createElement('div');
      track.className = 'skill-tree';
      for (const node of model.tree.nodes) {
        const nodeElement = document.createElement('article');
        nodeElement.className = [
          'skill-tree-node',
          node.reached ? 'is-reached' : 'is-locked',
          node.current ? 'is-current' : '',
        ].filter(Boolean).join(' ');
        const nodeHeading = document.createElement('h4');
        nodeHeading.textContent = `${node.star}★ ${node.label}${node.locked ? ' · 未解锁' : ''}`;
        nodeElement.append(nodeHeading);
        if (node.exactEffects?.length) nodeElement.append(renderBlocks(node.exactEffects));
        if (node.options) {
          const options = document.createElement('div');
          options.className = 'skill-tree-options';
          for (const option of node.options) {
            const optionElement = document.createElement('article');
            optionElement.className = [
              'skill-tree-option',
              option.selected ? 'is-selected' : '',
              option.available ? 'is-available' : 'is-unselected',
            ].filter(Boolean).join(' ');
            const name = document.createElement('strong');
            name.textContent = option.name;
            const intent = document.createElement('p');
            intent.textContent = option.intent;
            const keywords = document.createElement('small');
            keywords.textContent = `适合：${option.keywords.join('、') || '当前机制强化'}`;
            optionElement.append(name, intent, renderBlocks(option.exactEffects), keywords);
            options.append(optionElement);
          }
          nodeElement.append(options);
        }
        track.append(nodeElement);
      }
      tree.append(track);
    }
    scroll.replaceChildren(intro, effects, affixes, glossary, tree);
  }

  return {
    open(card, source, returnFocus) {
      focusTarget = returnFocus ?? document.activeElement as HTMLElement | null;
      renderModel(buildCardDetailViewModel(card, source, hooks.recipeContext?.()));
      if (!open) {
        open = true;
        overlay.hidden = false;
        overlay.setAttribute('aria-hidden', 'false');
        hooks.onOpen();
      }
      closeButton.focus();
    },
    close,
    isOpen: () => open,
    destroy() {
      if (open) close();
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
    },
  };
}
