import { resolveText } from '../data';

export function rewardCopy(rewardId: string): { name: string; desc: string } {
  return {
    name: resolveText(`rewards.${rewardId}.name`) ?? rewardId,
    desc: resolveText(`rewards.${rewardId}.desc`) ?? rewardId,
  };
}
