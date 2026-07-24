import { cfg } from '../config';
import { texts } from '../data';
import type { GameEvent } from '../core/types';
import { fmt } from './format';
import { cardDisplayName as name } from './cardMeta';

const T = texts.toast;

/** 事件类型中会改变卡槽/装备内容、需要重绘槽位的集合。 */
export const SLOT_CHANGING = new Set<GameEvent['type']>([
  'collected', 'moved', 'swapped', 'merged', 'fed', 'skillConsumed', 'equipped',
  'wildcardsGranted', 'wildcardMerged',
  'evolutionBranchSelected',
  'bossRewardGranted',
]);

function wildcardGrantDescription(grants: Array<{ star: number; count: number }>): string {
  return grants.map(grant => `${grant.star}★万能卡×${grant.count}`).join('、');
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
    case 'relicOffered':
    case 'evolutionBranchOffered':
      return null;
    case 'bossRewardGranted': return fmt(T.bossReward, { desc: wildcardGrantDescription(ev.grants) });
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
    case 'wildcardsGranted': return T.testWildcards;
    case 'wildcardMerged': return fmt(T.wildcardMerged, { name: name(ev.cardType), star: ev.resultStar });
    case 'wildcardMergeRejected':
      return ev.reason === 'missingWildcard' ? fmt(T.wildcardMissing, { star: ev.requiredStar ?? '' }) : ev.reason === 'maxStar' ? T.wildcardMaxStar : null;
    case 'skillConsumed': return fmt(T.skillConsumed, { name: name(ev.cardType), star: ev.star });
    case 'equipped': return fmt(T.equipped, { name: name(ev.cardType), star: ev.star });
    case 'shieldBroken': return T.shieldBroken;
    case 'testDrops': return fmt(T.testDrops, { name: name(ev.cardType) });
    case 'relicSelected': return fmt(T.perkApplied, { title: ev.title });
    case 'waveBaseRewardChosen': {
      const add = ev.stat === 'xpGainPct' ? `${ev.add * 100}%` : String(ev.add);
      const stat = (texts.waveRewardStats as Record<string, string>)[ev.stat] ?? ev.stat;
      return fmt(T.waveBaseRewardChosen, { stat, add });
    }
    case 'evolutionBranchSelected': return `${name(ev.cardType)}：路线已锁定`;
    case 'bountyAccepted': return fmt(T.bountyAccepted, { name: name(ev.rewardCardType) });
    case 'bountyCompleted': return fmt(T.bountyCompleted, { name: name(ev.rewardCardType) });
    case 'bountyFailed': return T.bountyFailed;
    case 'bountyOfferSpawned':
    case 'bountyOfferExpired':
    case 'bountyMemberSpawned':
    case 'bountyRewardDropped':
    case 'dropExpired':
    case 'levelUp':
    case 'gameEnd':
      return null;
  }
}
