import './telemetryHud.css';
import type { DifficultyId, GameConfig } from '../config/types';
import type { Enemy, GameEvent, GameState } from '../core/types';
import { EVENT_UNIVERSE, OPPORTUNITY_EVENTS, percentile } from './metrics';
import type { TelemetryEvent, TelemetryInputType, TelemetrySession } from './types';
import { difficultyMultipliersFor } from '../core/difficulty';
import { stageForWave } from '../core/runStage';
import { calculateBuildMaturity } from '../core/systems/dropTypePolicy';
import { composeWeaponForm, getModifiers } from '../core/effects/interpreter';
import { cardDisplayName } from '../ui/cardMeta';
import { combatFormLabel } from '../debug/devToolsMode';
import { cardGodInRun } from '../core/systems/activePoolSystem';

declare const __GIT_COMMIT__: string;

interface Options {
  getState(): GameState;
  getConfig(): GameConfig;
  getSeed(): number;
  getPresetName(): string;
  getRange(): number;
  getDifficultyId(): DifficultyId;
}

interface FrameEnemy { enemy: Enemy; x: number; y: number; hp: number }

function download(filename: string, value: unknown): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeIso(iso: string): string { return iso.replace(/:/g, '-'); }
function fullConfig(config: GameConfig): Record<string, unknown> {
  const { tuner: _tuner, ...effective } = structuredClone(config);
  return effective as unknown as Record<string, unknown>;
}

export interface DevTelemetry {
  reset(): void;
  beforeUpdate(): void;
  afterUpdate(): void;
  recordGameEvents(events: GameEvent[]): void;
  recordInput(type: TelemetryInputType, detail?: string): void;
  updateFrame(now: number): void;
  exportSession(): Promise<string>;
  getSession(): TelemetrySession;
}

export function createDevTelemetry(options: Options): DevTelemetry {
  let startedAt = new Date().toISOString();
  let filename = `session_${safeIso(startedAt)}_${options.getSeed()}.json`;
  const events: TelemetryEvent[] = [];
  const samples: TelemetrySession['samples'] = [];
  const inputs: TelemetrySession['inputs'] = [];
  const knownEnemies = new Set<number>();
  const knownDrops = new Set<number>();
  const dangerEntries = new Map<number, TelemetryEvent>();
  let before = new Map<number, FrameEnemy>();
  let killsBefore = 0;
  let nextSample = 0;
  const bossSpawnedAt = new Map<number, number>();
  const validationRewardLandedAt = new Map<number, number>();
  const pendingValidationRewards: Array<{
    telemetry: TelemetryEvent;
    rewardKind: 'card' | 'wildcard';
    cardType?: string;
    star: number;
    resolved: boolean;
  }> = [];
  let fps = 0;
  let lastHudUpdate = -Infinity;
  const frameTimes: number[] = [];

  const hud = document.createElement('aside');
  hud.className = 'telemetry-hud';
  hud.innerHTML = `<header><b>DEV 遥测</b><button type="button" data-hide>隐藏</button></header><dl>
    <dt>当前同屏</dt><dd data-current>0</dd><dt>本波 E1 P50/P95</dt><dd data-e1>—</dd>
    <dt>空档 当前 / E2最大</dt><dd data-gap>0.00 / 0.00s</dd><dt>滚动 10s 机会</dt><dd data-e3>0</dd>
    <dt>本波危险区进入</dt><dd data-e4>0</dd><dt>开局 90s 操作</dt><dd data-e6>0</dd><dt>FPS</dt><dd data-fps>0</dd></dl>
    <section class="telemetry-cards"><b>装备触发（本波）</b><div data-card-stats></div></section>`;
  document.body.append(hud);
  hud.style.width = '250px';
  const actions = document.createElement('div');
  actions.className = 'telemetry-actions';
  actions.innerHTML = `<button type="button" data-toggle>HUD</button><button type="button" data-export>导出会话</button><button type="button" data-baseline>导出手感基线</button><label>空档警戒(s)<input data-threshold type="number" min="0.25" step="0.25" value="3"></label>`;
  document.body.append(actions);
  const rating = document.createElement('div');
  rating.className = 'telemetry-rating'; rating.hidden = true; document.body.append(rating);

  function state(): GameState { return options.getState(); }
  function at(): number { return Number(state().time.toFixed(6)); }
  function stage(wave = state().wave): TelemetryEvent['stage'] {
    const config = options.getConfig();
    return stageForWave(wave, config.waves.totalWaves, config.waves.stagePlan);
  }
  function buildSnapshot(): Pick<TelemetryEvent, 'maturity' | 'highestStar' | 'equippedCount'> {
    const cards = [...state().cards, ...state().equipment].filter(card => card !== null);
    return {
      maturity: Number(calculateBuildMaturity(state()).toFixed(4)),
      highestStar: cards.reduce((highest, card) => Math.max(highest, card.star), 0),
      equippedCount: state().equipment.filter(card => card !== null).length,
    };
  }
  function beforeFinalBoss(): boolean {
    const finalWave = options.getConfig().waves.totalWaves;
    return state().wave < finalWave || (state().wave === finalWave && !bossSpawnedAt.has(finalWave));
  }
  function highStarFlags(): Pick<TelemetryEvent, 'reached5BeforeFinalBoss' | 'reached6BeforeFinalBoss'> {
    const highest = beforeFinalBoss()
      ? [...state().cards, ...state().equipment].reduce((value, card) => Math.max(value, card?.star ?? 0), 0)
      : 0;
    return { reached5BeforeFinalBoss: highest >= 5, reached6BeforeFinalBoss: highest >= 6 };
  }
  function resolveValidationOperation(
    rewardKind: 'card' | 'wildcard',
    operation: 'merge' | 'equip' | 'consume',
    cardType: string,
    resultingStar?: number,
    wildcardStar?: number,
  ): void {
    const pending = pendingValidationRewards.find(item => !item.resolved
      && item.rewardKind === rewardKind
      && (rewardKind === 'card' ? item.cardType === cardType : item.star === wildcardStar));
    if (!pending) return;
    pending.resolved = true;
    pending.telemetry.firstOperation = operation;
    pending.telemetry.firstOperationSeconds = Math.max(
      0,
      at() - (pending.telemetry.dropId === undefined ? pending.telemetry.at : validationRewardLandedAt.get(pending.telemetry.dropId) ?? pending.telemetry.at),
    );
    if (beforeFinalBoss()) {
      if ((resultingStar ?? 0) >= 5) pending.telemetry.reached5BeforeFinalBoss = true;
      if ((resultingStar ?? 0) >= 6) pending.telemetry.reached6BeforeFinalBoss = true;
    }
  }
  function add(event: Omit<TelemetryEvent, 'at' | 'wave'> & Partial<Pick<TelemetryEvent, 'at' | 'wave'>>): TelemetryEvent {
    const item = { at: at(), wave: state().wave, ...event } as TelemetryEvent;
    events.push(item);
    return item;
  }

  function checkDanger(enemy: Enemy): void {
    if (dangerEntries.has(enemy.id)) return;
    const config = options.getConfig();
    const distance = Math.hypot(enemy.x - config.combat.turret.x, enemy.y - config.combat.turret.y);
    if (distance < config.combat.breakthroughDist + config.combat.dangerZoneWidth) {
      dangerEntries.set(enemy.id, add({ type: 'dangerEnter', enemyId: enemy.id, x: enemy.x, y: enemy.y, distance }));
    }
  }

  function closeDanger(enemyId: number): void {
    const entry = dangerEntries.get(enemyId);
    if (entry && entry.visibleSeconds == null) entry.visibleSeconds = Math.max(0, at() - entry.at);
  }

  function syncAdditions(): void {
    for (const enemy of state().enemies) {
      if (!knownEnemies.has(enemy.id)) {
        knownEnemies.add(enemy.id);
        add({ type: 'spawn', enemyId: enemy.id, x: enemy.x, y: enemy.y });
      }
      checkDanger(enemy);
    }
    for (const drop of state().groundDrops) if (!knownDrops.has(drop.id)) {
      knownDrops.add(drop.id);
      add({
        type: 'dropLanded',
        dropId: drop.id,
        x: drop.x,
        y: drop.y,
        cardType: drop.kind === 'card' ? drop.type : 'wildcard',
        source: drop.source,
        stage: stage(),
        star: drop.star,
        secure: drop.secure,
      });
      if (drop.kind === 'card') {
        const godId = cardGodInRun(state(), drop.type);
        if (godId) add({
          type: 'card_shown_by_god',
          cardType: drop.type,
          godId,
          source: drop.source,
          stage: stage(),
        });
      }
      if (drop.secure && drop.validationRewardWave !== undefined) {
        validationRewardLandedAt.set(drop.id, at());
        add({
          type: 'validationRewardLanded', dropId: drop.id, x: drop.x, y: drop.y,
          source: drop.source, stage: stage(drop.validationRewardWave), star: drop.star, secure: true,
          rewardKind: drop.kind,
          cardType: drop.kind === 'card' ? drop.type : 'wildcard',
          typePolicy: drop.validationTypePolicy,
          wildcardCount: drop.kind === 'wildcard' ? drop.count : undefined,
        });
      }
      if (drop.bountyEncounterId !== undefined) {
        const encounter = state().bountyEncounters.find(item => item.id === drop.bountyEncounterId);
        add({
          type: 'bountyRewardLanded',
          dropId: drop.id,
          x: drop.x,
          y: drop.y,
          encounterId: drop.bountyEncounterId,
          rewardCardType: encounter?.rewardCardType ?? (drop.kind === 'card' ? drop.type : undefined),
          ...(drop.kind === 'card' ? { rewardCardStar: drop.star } : { wildcardStar: drop.star }),
        });
      }
    }
    const liveDrops = new Set(state().groundDrops.map(drop => drop.id));
    for (const id of knownDrops) if (!liveDrops.has(id)) knownDrops.delete(id);
  }

  function getSession(): TelemetrySession {
    const difficultyId = options.getDifficultyId();
    const wave1 = difficultyMultipliersFor(difficultyId, 'normal', 1);
    return {
      meta: {
        startedAt,
        exportedAt: new Date().toISOString(),
        config: fullConfig(options.getConfig()),
        presetName: options.getPresetName(),
        seed: options.getSeed(),
        difficulty: { id: difficultyId, hpMultiplierAtWave1: wave1.hp, damageMultiplierAtWave1: wave1.damage },
        gitCommit: typeof __GIT_COMMIT__ === 'string' ? __GIT_COMMIT__ : 'unknown',
      },
      events: structuredClone(events), samples: structuredClone(samples), inputs: structuredClone(inputs),
    };
  }

  async function exportSession(): Promise<string> {
    const session = getSession();
    const body = JSON.stringify({ filename, session });
    try {
      const response = await fetch('/__telemetry/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!response.ok) throw new Error(await response.text());
    } catch {
      download(filename, session);
    }
    return `telemetry/${filename}`;
  }

  function openRating(): void {
    const waves = [...new Set(events.filter(event => event.type === 'waveStart').map(event => event.wave))];
    rating.innerHTML = `<form><h2>本局手感评分</h2><p>1（低）–5（高），按刚完成的各波当场填写。</p><table><thead><tr><th>波</th><th>有事做 busy</th><th>有东西看 watch</th><th>紧张 tension</th></tr></thead><tbody>${waves.map(wave => `<tr data-wave="${wave}"><th>${wave}</th>${['busy', 'watch', 'tension'].map(key => `<td><input name="${key}-${wave}" type="number" min="1" max="5" required></td>`).join('')}</tr>`).join('')}</tbody></table><p><label>整体分 overall <input name="overall" type="number" min="1" max="5" required></label></p><p><label>玩家 <input class="wide" name="player" required placeholder="姓名/代号"></label></p><footer><button type="button" data-cancel>取消</button><button type="submit">写入手感基线</button></footer><p data-status></p></form>`;
    rating.hidden = false;
    rating.querySelector('[data-cancel]')!.addEventListener('click', () => { rating.hidden = true; });
    rating.querySelector('form')!.addEventListener('submit', event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget as HTMLFormElement);
      const sessionId = filename.replace(/\.json$/, '');
      const ratingPerWave = waves.map(wave => ({ busy: Number(form.get(`busy-${wave}`)), watch: Number(form.get(`watch-${wave}`)), tension: Number(form.get(`tension-${wave}`)) }));
      const config = fullConfig(options.getConfig());
      const baselineSession = { id: sessionId, seed: options.getSeed(), ratingPerWave, overall: Number(form.get('overall')), telemetryFile: `telemetry/${filename}` };
      const meta = { date: new Date().toISOString().slice(0, 10), gitCommit: typeof __GIT_COMMIT__ === 'string' ? __GIT_COMMIT__ : 'unknown', spawnMode: String((options.getConfig().waves as unknown as { spawnMode?: string }).spawnMode ?? 'interval'), presetName: options.getPresetName(), player: String(form.get('player')) };
      const status = rating.querySelector<HTMLElement>('[data-status]')!;
      status.textContent = '正在写入会话与 docs/P6_手感基线_v1.json…';
      void exportSession().then(() => fetch('/__telemetry/baseline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meta, config, session: baselineSession }) }))
        .then(async response => {
          if (!response.ok) throw new Error(await response.text());
          status.textContent = '已写入 docs/P6_手感基线_v1.json（已有 sessions 已保留）。';
          setTimeout(() => { rating.hidden = true; }, 700);
        }).catch(() => {
          download('P6_手感基线_v1.json', { meta, config, sessions: [baselineSession] });
          status.textContent = '项目写入失败，已下载单会话基线 JSON。';
        });
    });
  }

  function reset(): void {
    events.length = 0; samples.length = 0; inputs.length = 0;
    knownEnemies.clear(); knownDrops.clear(); dangerEntries.clear(); before.clear();
    killsBefore = 0; nextSample = 0;
    bossSpawnedAt.clear();
    validationRewardLandedAt.clear();
    pendingValidationRewards.length = 0;
    startedAt = new Date().toISOString();
    filename = `session_${safeIso(startedAt)}_${options.getSeed()}.json`;
  }

  function beforeUpdate(): void {
    before = new Map(state().enemies.map(enemy => [enemy.id, { enemy, x: enemy.x, y: enemy.y, hp: enemy.hp }]));
    killsBefore = state().kills;
  }

  function afterUpdate(): void {
    const currentIds = new Set(state().enemies.map(enemy => enemy.id));
    const removed = [...before.values()].filter(item => !currentIds.has(item.enemy.id));
    for (const item of removed) checkDanger(item.enemy);
    const killCount = Math.max(0, state().kills - killsBefore);
    const killed = removed.filter(item => item.enemy.hp <= 0);
    for (const item of removed.filter(candidate => !killed.includes(candidate)).sort((a, b) => a.enemy.hp - b.enemy.hp)) {
      if (killed.length >= killCount) break;
      killed.push(item);
    }
    for (const item of killed.slice(0, killCount)) {
      const config = options.getConfig();
      const distance = Math.hypot(item.enemy.x - config.combat.turret.x, item.enemy.y - config.combat.turret.y);
      add({ type: 'kill', enemyId: item.enemy.id, x: item.enemy.x, y: item.enemy.y, distance, range: options.getRange() });
      closeDanger(item.enemy.id);
    }
    for (const item of removed) { knownEnemies.delete(item.enemy.id); closeDanger(item.enemy.id); }
    syncAdditions();
    const time = state().time;
    const waveActive = state().wave > 0 && state().wavePhase !== 'between' && state().mode === 'playing';
    if (!waveActive) nextSample = Math.floor(time * 4 + 1) / 4;
    else while (nextSample <= time) {
      samples.push({ at: Number(nextSample.toFixed(6)), wave: state().wave, enemies: state().enemies.length });
      nextSample += 0.25;
    }
  }

  function recordGameEvents(gameEvents: GameEvent[]): void {
    let shouldExport = false;
    for (const event of gameEvents) {
      if (event.type === 'waveStart') {
        for (const id of dangerEntries.keys()) closeDanger(id);
        dangerEntries.clear();
        knownEnemies.clear(); knownDrops.clear();
        const dm = difficultyMultipliersFor(options.getDifficultyId(), 'normal', event.wave);
        add({
          type: 'waveStart', wave: event.wave, stage: stage(event.wave),
          difficultyHpMultiplier: Number(dm.hp.toFixed(2)), difficultyDamageMultiplier: Number(dm.damage.toFixed(2)),
          ...buildSnapshot(),
        });
      }
      if (event.type === 'waveCleared') {
        add({
          type: 'waveCleared', wave: event.wave, stage: stage(event.wave),
          activeRegularSeconds: state().ordinaryDrop.activeRegularSeconds,
          ordinaryDropsShown: state().ordinaryDrop.shownThisWave,
          eligibleKills: state().ordinaryDrop.eligibleKillsThisWave,
          ...buildSnapshot(),
        });
        shouldExport = true;
      }
      if (event.type === 'waveBossSpawned') {
        bossSpawnedAt.set(event.wave, at());
        add({ type: 'waveBossSpawned', wave: event.wave });
      }
      if (event.type === 'bossRewardGranted') {
        const clearSeconds = Math.max(0, at() - (bossSpawnedAt.get(event.wave) ?? at()));
        add({ type: 'waveBossKilled', wave: event.wave, clearSeconds });
        add({ type: 'bossRewardGranted', wave: event.wave, wildcardStar: event.grants[0]?.star, wildcardCount: event.grants[0]?.count });
      }
      if (event.type === 'gameEnd' && event.win && !events.some(item => item.type === 'waveCleared' && item.wave === state().wave)) {
        add({
          type: 'waveCleared', stage: stage(),
          activeRegularSeconds: state().ordinaryDrop.activeRegularSeconds,
          ordinaryDropsShown: state().ordinaryDrop.shownThisWave,
          eligibleKills: state().ordinaryDrop.eligibleKillsThisWave,
          ...buildSnapshot(),
        });
        shouldExport = true;
      }
      if (event.type === 'rewardTriggered') add({
        type: 'reward_triggered', rewardId: event.rewardId,
        activationIndex: event.activationIndex, rewardResult: { ...event.result },
      });
      if (event.type === 'rewardConfirmed') add({ type: 'reward_confirmed', rewardId: event.rewardId });
      if (event.type === 'evolutionBranchOffered') add({
        type: 'evolution_branch_offered',
        cardType: event.cardType,
        checkpointStar: event.checkpointStar,
        candidates: [...event.options],
        provisionalCardId: event.provisionalCardId,
      });
      if (event.type === 'evolutionBranchSelected') add({
        type: 'evolution_branch_selected',
        cardType: event.cardType,
        checkpointStar: event.checkpointStar,
        optionId: event.optionId,
        provisionalCardId: event.provisionalCardId,
      });
      if (event.type === 'recipeAvailable') add({
        type: 'recipe_available',
        recipeIds: [...event.recipeIds],
      });
      if (event.type === 'recipeCompleted') add({
        type: 'recipe_completed',
        recipeId: event.recipeId,
        cardType: event.outputCardType,
        outputStar: event.outputStar,
        outputCardId: event.outputCardId,
        targetSlotKind: event.target.slotKind,
        targetSlotIndex: event.target.index,
        materialCardIds: [...event.materialCardIds],
        assistBudgetUsed: state().recipes.assistBudgetUsed,
      });
      if (event.type === 'validationRewardGranted') add({
        type: 'validation_reward_granted',
        wave: event.wave,
        cardType: event.cardType,
        star: event.star,
        delivery: event.delivery,
        assistBudgetUsed: state().recipes.assistBudgetUsed,
      });
      if (event.type === 'validationRewardSettleStarted') add({
        type: 'validation_reward_settle_started',
        wave: event.wave,
        settleSeconds: event.seconds,
        assistBudgetUsed: state().recipes.assistBudgetUsed,
      });
      if (event.type === 'affixRolled') {
        for (const affix of event.affixes) add({
          type: 'affix_rolled',
          cardType: event.cardType,
          affixStat: affix.stat,
          affixValue: affix.value,
          consumableDuration: affix.consumableDuration,
        });
      }
      if (event.type === 'decisionOffered') add({
        type: 'decision_offered',
        decisionKind: event.kind,
      });
      if (event.type === 'decisionResolved') add({
        type: 'decision_resolved',
        decisionKind: event.kind,
        choice: event.choice,
      });
      if (event.type === 'intermissionReady') add({
        type: 'intermission_ready',
        wave: event.wave,
        automatic: event.automatic,
      });
      if (event.type === 'waveRewardsGranted') add({
        type: 'wave_rewards_granted',
        wave: event.wave,
        waveRewards: event.granted.map(reward => ({ ...reward })),
      });
      if (event.type === 'waveBaseRewardOffered') add({
        type: 'wave_base_reward_offered',
        wave: event.wave,
        candidates: [...event.candidates],
      });
      if (event.type === 'waveBaseRewardChosen') add({
        type: 'wave_base_reward_resolved',
        wave: event.wave,
        waveRewardStat: event.stat,
        waveRewardAdd: event.add,
      });
      if (event.type === 'godOffer') add({
        type: 'god_offer',
        wave: event.wave,
        godRole: event.role,
        candidates: [...event.candidates],
      });
      if (event.type === 'godSelected') add({
        type: 'god_selected',
        wave: event.wave,
        godRole: event.role,
        godId: event.god,
      });
      if (event.type === 'runRosterCreated') add({
        type: 'run_roster_created',
        cardTypes: [...event.cardTypes],
      });
      if (event.type === 'activePoolCreated') add({
        type: 'active_pool_created',
        wave: event.wave,
        focusGod: event.focusGod ?? undefined,
        cardTypes: [...event.cardTypes],
      });
      if (event.type === 'dropExpired') add({
        type: 'dropExpired', dropId: event.dropId, source: event.source, stage: stage(),
        star: event.star, secure: event.secure,
      });
      if (event.type === 'cardsFull') add({
        type: 'dropRejectedFullHand', dropId: event.dropId, source: event.source,
        stage: stage(), star: event.star, secure: event.secure,
      });
      if (event.type === 'collected') {
        const godId = cardGodInRun(state(), event.cardType);
        add({
          type: 'pickup', dropId: event.dropId, cardType: event.cardType, source: event.source,
          stage: stage(), star: event.star, secure: event.secure,
        });
        if (godId) add({
          type: 'card_collected_by_god',
          cardType: event.cardType,
          godId,
          source: event.source,
          stage: stage(),
          star: event.star,
        });
        if (event.merges > 0) add({ type: 'mergeOpportunity', cardType: event.cardType });
        if (event.bountyEncounterId !== undefined) {
          const encounter = state().bountyEncounters.find(item => item.id === event.bountyEncounterId);
          add({ type: 'bountyRewardPickup', encounterId: event.bountyEncounterId, rewardCardType: encounter?.rewardCardType ?? event.cardType, cardType: event.cardType });
        }
        if (event.secure && event.validationRewardWave !== undefined && event.dropId !== undefined) {
          const pickup = add({
            type: 'validationRewardPickup', dropId: event.dropId, cardType: event.cardType,
            source: event.source, stage: stage(event.validationRewardWave), star: event.star,
            secure: true, rewardKind: 'card', typePolicy: event.validationTypePolicy,
            ...highStarFlags(),
          });
          pendingValidationRewards.push({
            telemetry: pickup, rewardKind: 'card', cardType: event.cardType,
            star: event.star ?? 1, resolved: false,
          });
        }
      }
      if (event.type === 'wildcardsGranted' && event.bountyEncounterId !== undefined) {
        const encounter = state().bountyEncounters.find(item => item.id === event.bountyEncounterId);
        add({ type: 'pickup', cardType: 'wildcard' });
        add({ type: 'bountyRewardPickup', encounterId: event.bountyEncounterId, rewardCardType: encounter?.rewardCardType, cardType: 'wildcard', wildcardStar: event.grants[0]?.star });
      }
      if (event.type === 'wildcardsGranted' && event.dropId !== undefined) {
        if (event.bountyEncounterId === undefined) add({
          type: 'pickup', dropId: event.dropId, cardType: 'wildcard', source: event.source,
          stage: stage(), star: event.star ?? event.grants[0]?.star, secure: event.secure,
        });
        if (event.secure && event.validationRewardWave !== undefined) {
          const pickup = add({
            type: 'validationRewardPickup', dropId: event.dropId, cardType: 'wildcard', rewardKind: 'wildcard',
            source: event.source, stage: stage(event.validationRewardWave),
            star: event.star ?? event.grants[0]?.star, secure: true,
            wildcardCount: event.grants[0]?.count,
            ...highStarFlags(),
          });
          pendingValidationRewards.push({
            telemetry: pickup, rewardKind: 'wildcard', star: event.star ?? event.grants[0]?.star ?? 1, resolved: false,
          });
        }
      }
      if (event.type === 'merged') resolveValidationOperation('card', 'merge', event.cardType, event.resultStar);
      if (event.type === 'fed') resolveValidationOperation('card', 'merge', event.cardType, event.resultStar);
      if (event.type === 'equipped') resolveValidationOperation('card', 'equip', event.cardType, event.star);
      if (event.type === 'skillConsumed') resolveValidationOperation('card', 'consume', event.cardType, event.star);
      if (event.type === 'wildcardMerged') {
        resolveValidationOperation('wildcard', 'merge', event.cardType, event.resultStar, event.consumedStar);
      }
      if (event.type === 'gameEnd') {
        for (const pending of pendingValidationRewards.filter(item => !item.resolved)) {
          pending.resolved = true;
          pending.telemetry.firstOperation = 'unused';
          pending.telemetry.firstOperationSeconds = Math.max(
            0,
            at() - (pending.telemetry.dropId === undefined ? pending.telemetry.at : validationRewardLandedAt.get(pending.telemetry.dropId) ?? pending.telemetry.at),
          );
        }
      }
      if (event.type === 'bountyOfferSpawned') {
        const offer = state().bountyOffers.find(item => item.id === event.offerId);
        add({
          type: 'bountyOffer',
          offerId: event.offerId,
          rewardCardType: event.rewardCardType,
          rewardCardStar: offer?.rewardCardStar,
          wildcardStar: offer?.wildcardStar,
          guaranteed: event.guaranteed,
        });
      }
      if (event.type === 'bountyOfferExpired') add({ type: 'bountyOfferExpired', offerId: event.offerId });
      if (event.type === 'bountyAccepted') {
        const encounter = state().bountyEncounters.find(item => item.id === event.encounterId);
        add({
          type: 'bountyAccepted',
          offerId: event.offerId,
          encounterId: event.encounterId,
          rewardCardType: event.rewardCardType,
          rewardCardStar: encounter?.rewardCardStar,
          wildcardStar: encounter?.wildcardStar,
          guaranteed: encounter?.guaranteed,
          memberCount: event.memberCount,
          decisionSeconds: event.decisionSeconds,
          hpAtAccept: encounter?.hpAtAccept,
        });
      }
      if (event.type === 'bountyMemberSpawned') add({ type: 'bountyMemberSpawned', encounterId: event.encounterId, enemyId: event.enemyId });
      if (event.type === 'bountyCompleted') {
        const encounter = state().bountyEncounters.find(item => item.id === event.encounterId);
        add({ type: 'bountyCompleted', encounterId: event.encounterId, rewardCardType: event.rewardCardType, rewardCardStar: encounter?.rewardCardStar, wildcardStar: encounter?.wildcardStar, guaranteed: encounter?.guaranteed, clearSeconds: event.clearSeconds, hpAtAccept: encounter?.hpAtAccept, hpAtComplete: state().hp });
      }
      if (event.type === 'bountyFailed') {
        const encounter = state().bountyEncounters.find(item => item.id === event.encounterId);
        add({ type: 'bountyFailed', encounterId: event.encounterId, rewardCardType: encounter?.rewardCardType, rewardCardStar: encounter?.rewardCardStar, wildcardStar: encounter?.wildcardStar, guaranteed: encounter?.guaranteed, hpAtAccept: encounter?.hpAtAccept });
      }
    }
    syncAdditions();
    if (shouldExport) void exportSession();
  }

  function recordInput(type: TelemetryInputType, detail?: string): void {
    inputs.push({ type, at: at(), wave: state().wave, ...(detail ? { detail } : {}) });
  }

  function updateFrame(now: number): void {
    frameTimes.push(now);
    while (frameTimes.length && frameTimes[0] < now - 1000) frameTimes.shift();
    fps = frameTimes.length > 1 ? (frameTimes.length - 1) * 1000 / (frameTimes[frameTimes.length - 1] - frameTimes[0]) : 0;
    if (hud.hidden) return;
    if (now - lastHudUpdate < 250) return;
    lastHudUpdate = now;
    const wave = state().wave;
    const waveStart = [...events].reverse().find(event => event.type === 'waveStart' && event.wave === wave)?.at ?? 0;
    const waveSamples = samples.filter(sample => sample.wave === wave && sample.at >= waveStart).map(sample => sample.enemies);
    const universe = events.filter(event => EVENT_UNIVERSE.has(event.type) && event.wave === wave && event.at >= waveStart);
    const lastEventAt = universe.length ? universe[universe.length - 1].at : waveStart;
    const gap = Math.max(0, state().time - lastEventAt);
    const eventTimes = universe.map(event => event.at);
    let maxGap = eventTimes.length && eventTimes[0] > waveStart ? eventTimes[0] - waveStart : 0;
    for (let index = 1; index < eventTimes.length; index++) maxGap = Math.max(maxGap, eventTimes[index] - eventTimes[index - 1]);
    maxGap = Math.max(maxGap, gap);
    const threshold = Number(actions.querySelector<HTMLInputElement>('[data-threshold]')!.value) || 3;
    hud.querySelector('[data-current]')!.textContent = String(state().enemies.length);
    hud.querySelector('[data-e1]')!.textContent = waveSamples.length ? `${percentile(waveSamples, .5)!.toFixed(1)} / ${percentile(waveSamples, .95)!.toFixed(1)}` : '—';
    const gapNode = hud.querySelector<HTMLElement>('[data-gap]')!; gapNode.textContent = `${gap.toFixed(2)} / ${maxGap.toFixed(2)}s`; gapNode.classList.toggle('warn', gap > threshold);
    hud.querySelector('[data-e3]')!.textContent = String(events.filter(event => OPPORTUNITY_EVENTS.has(event.type) && event.at > state().time - 10 && event.at <= state().time).length);
    hud.querySelector('[data-e4]')!.textContent = String(events.filter(event => event.type === 'dangerEnter' && event.wave === wave).length);
    hud.querySelector('[data-e6]')!.textContent = String(inputs.filter(input => input.at <= 90).length);
    hud.querySelector('[data-fps]')!.textContent = fps.toFixed(0);
    const form = composeWeaponForm(getModifiers(state()).weaponForms);
    const formLabel = combatFormLabel(form);
    hud.querySelector<HTMLElement>('[data-card-stats]')!.innerHTML = state().equipment
      .map(card => {
        if (!card) return '';
        const stats = state().combatTelemetry.perCard[card.id] ?? { triggers: 0, hits: 0, damage: 0 };
        const damped = stats.suppressedByFusion ? ` · 融合衰减×${stats.suppressedByFusion}` : '';
        return `<div class="telemetry-card" style="display:grid;padding:4px 0;border-top:1px solid #234">`
          + `<span>${cardDisplayName(card.type)} ${card.star}★</span><small>${formLabel}</small>`
          + `<em>触发 ${stats.triggers} · 命中 ${stats.hits} · 伤害 ${stats.damage.toFixed(1)}${damped}</em></div>`;
      }).join('');
  }

  hud.querySelector('[data-hide]')!.addEventListener('click', () => { hud.hidden = true; });
  actions.querySelector('[data-toggle]')!.addEventListener('click', () => { hud.hidden = !hud.hidden; });
  actions.querySelector('[data-export]')!.addEventListener('click', () => { void exportSession(); });
  actions.querySelector('[data-baseline]')!.addEventListener('click', openRating);

  return { reset, beforeUpdate, afterUpdate, recordGameEvents, recordInput, updateFrame, exportSession, getSession };
}
