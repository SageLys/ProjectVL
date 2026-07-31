import { cfg } from '../config';
import { texts } from '../data';
import type { GameEvent } from '../core/types';
import { fmt } from './format';
import { cardDisplayName as name } from './cardMeta';

const T = texts.toast;

/** Clears run-scoped presentation dedupe without changing recipe events or telemetry. */
export function resetToastDedupe(): void {
}

/** 事件类型中会改变卡槽/装备内容、需要重绘槽位的集合。 */
export const SLOT_CHANGING = new Set<GameEvent['type']>([
  'collected', 'moved', 'swapped', 'merged', 'fed', 'skillConsumed', 'equipped',
  'mergeRefunded', 'wildcardsGranted', 'wildcardMerged',
  'evolutionBranchSelected',
  'bossRewardGranted',
  'recipeCompleted',
]);

function wildcardGrantDescription(grants: Array<{ star: number; count: number }>): string {
  return grants.map(grant => `${grant.count} 张 ${grant.star}★ 万能卡`).join('、');
}

/** 把语义事件翻译成 toast 文案；无需 toast 的事件返回 null。 */
export function formatToast(ev: GameEvent): string | null {
  switch (ev.type) {
    case 'waveStart': return fmt(T.waveStart, { wave: ev.wave });
    case 'waveCleared': return fmt(T.waveClear, { wave: ev.wave });
    case 'waveBossSpawned': return T.waveBoss;
    case 'decisionOffered':
    case 'decisionResolved':
    case 'godOffer':
    case 'godSelected':
    case 'runRosterCreated':
    case 'activePoolCreated':
    case 'intermissionReady':
    case 'waveRewardsGranted':
    case 'waveBaseRewardOffered':
    case 'evolutionBranchOffered':
    case 'affixRolled':
      return null;
    case 'recipeAvailable': return null;
    case 'bossRewardGranted': return fmt(T.bossReward, { desc: wildcardGrantDescription(ev.grants) });
    case 'validationRewardGranted': return ev.delivery === 'hand'
      ? `验证奖励已直接加入手牌：${name(ev.cardType)} ${ev.star}★`
      : `手牌已满，验证奖励已安全落地：${name(ev.cardType)} ${ev.star}★`;
    case 'validationRewardSettleStarted': return `验证奖励结算窗口：${ev.seconds} 秒`;
    case 'validationEliteSpawned': return '验证精英已入场';
    case 'validationEscortSpawned':
    case 'validationEscortsCleared':
      return null;
    case 'breakthrough': return fmt(T.breakthrough, { damage: Math.round(ev.damage) });
    case 'bossContactStarted': return T.bossContactStarted;
    case 'bossContactDamage':
    case 'bossContactEnded':
      return null;
    case 'cardsFull': return ev.secure ? '验证奖励待处理：请消耗、合成或替换一张手牌' : T.cardsFull;
    case 'collected': return ev.merges ? fmt(T.collectMerged, { count: ev.merges }) : fmt(T.collect, { name: name(ev.cardType) });
    case 'equipFull': return T.equipFull;
    case 'equipRejected':
      return ev.reason === 'provisional'
        ? texts.evolution.pending
        : ev.reason === 'duplicate'
          ? T.equipRejectedDuplicate
          : fmt(T.equipRejectedStar, { threshold: cfg.economy.equipThreshold });
    case 'moved': return fmt(T.moved, { name: name(ev.cardType), mergeSuffix: ev.merges ? fmt(T.mergeSuffix, { count: ev.merges }) : '' });
    case 'swapped': return fmt(T.swapped, { a: name(ev.a), b: name(ev.b) });
    case 'merged': return null; // 合成提示已并入 collected/moved 的 mergeSuffix
    case 'fed': return fmt(T.fed, { name: name(ev.cardType), star: ev.resultStar });
    case 'mergeRefunded':
      if (ev.granted > 0 && ev.lost > 0) return fmt(T.mergeRefundPartial, {
        name: name(ev.cardType), star: ev.star, granted: ev.granted, lost: ev.lost,
      });
      if (ev.granted > 0) return fmt(T.mergeRefunded, {
        name: name(ev.cardType), star: ev.star, granted: ev.granted,
      });
      return fmt(T.mergeRefundLost, { name: name(ev.cardType), star: ev.star, lost: ev.lost });
    case 'wildcardsGranted': return fmt(T.wildcardsGranted, { desc: wildcardGrantDescription(ev.grants) });
    case 'wildcardMerged': return fmt(T.wildcardMerged, { name: name(ev.cardType), star: ev.resultStar });
    case 'wildcardMergeRejected':
      return ev.reason === 'missingWildcard' ? fmt(T.wildcardMissing, { star: ev.requiredStar ?? '' }) : ev.reason === 'maxStar' ? T.wildcardMaxStar : null;
    case 'skillConsumed': return fmt(T.skillConsumed, { name: name(ev.cardType), star: ev.star });
    case 'equipped': return fmt(T.equipped, { name: name(ev.cardType), star: ev.star });
    case 'shieldBroken': return T.shieldBroken;
    case 'shieldRestored': return T.shieldRestored;
    case 'testDrops': return fmt(T.testDrops, { name: name(ev.cardType) });
    case 'rewardTriggered': {
      const reward = (texts.rewards as Record<string, { name?: string }>)[ev.rewardId];
      return `${reward?.name ?? ev.rewardId} 已执行`;
    }
    case 'rewardPointsGained':
    case 'rewardConfirmed':
      return null;
    case 'waveBaseRewardChosen': {
      const add = ev.stat === 'xpGainPct' ? `${ev.add * 100}%` : String(ev.add);
      const stat = (texts.waveRewardStats as Record<string, string>)[ev.stat] ?? ev.stat;
      return fmt(T.waveBaseRewardChosen, { stat, add });
    }
    case 'evolutionBranchSelected': return `${name(ev.cardType)}：本卡路线已确定`;
    case 'recipeCompleted': return `卡间进化完成：${name(ev.outputCardType)} ${ev.outputStar}★`;
    case 'recipeRejected': {
      if (ev.reason === 'paused') return '暂停时不能进化';
      if (ev.reason === 'decision') return '请先完成当前决策';
      if (ev.reason === 'intermission' || ev.reason === 'phase' || ev.reason === 'mode') return '当前阶段不能进化';
      if (ev.reason === 'limit') return '本局进化次数已用尽';
      if (ev.reason === 'completed') return '同一配方每局只能完成一次';
      if (ev.reason === 'star') return '进化材料尚未达到 5★';
      if (ev.reason === 'provisional') return '请先确定材料卡的进化分支';
      if (ev.reason === 'slots') return '没有可放置进化产物的槽位';
      return '进化材料已变化，操作已取消';
    }
    case 'bountyAccepted': return fmt(T.bountyAccepted, { name: name(ev.rewardCardType) });
    case 'bountyCompleted': return fmt(T.bountyCompleted, { name: name(ev.rewardCardType) });
    case 'bountyFailed': return T.bountyFailed;
    case 'bountyOfferSpawned':
    case 'bountyOfferExpired':
    case 'bountyMemberSpawned':
    case 'bountyRewardDropped':
    case 'dropExpired':
    case 'gameEnd':
      return null;
  }
}
