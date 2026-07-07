// 数据聚合入口：所有可调数值/文案的唯一来源。
// 改数值 → 只改这些 JSON；规则读取方式在 core/ 与表现层。
import gameConfig from './gameConfig.json';
import cards from './cards.json';
import enemies from './enemies.json';
import waves from './waves.json';
import perks from './perks.json';
import texts from './texts.json';

export { gameConfig, cards, enemies, waves, perks, texts };
