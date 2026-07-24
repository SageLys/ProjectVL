import type { Config, GameEvent, GameState, Rng, RunDecision } from '../types';

export type DecisionResolver = (
  state: GameState,
  config: Config,
  rng: Rng,
  decision: RunDecision,
  choice: string,
) => GameEvent[];

const resolvers: Partial<Record<RunDecision['kind'], DecisionResolver>> = {};

/** 后续构筑系统按 kind 注册规则应用函数；UI 不接触此注册表。 */
export function registerDecisionResolver(kind: RunDecision['kind'], resolver: DecisionResolver): void {
  resolvers[kind] = resolver;
}

/** 测试与热重载清理入口。 */
export function clearDecisionResolvers(): void {
  for (const kind of Object.keys(resolvers) as RunDecision['kind'][]) delete resolvers[kind];
}

function validChoices(decision: RunDecision): string[] {
  switch (decision.kind) {
    case 'godDraft':
    case 'godFocus':
      return decision.candidates;
    case 'evolutionBranch':
    case 'relic':
      return decision.options;
    case 'recipeEvolution':
      return [decision.recipeId];
  }
}

/** 入队不会覆盖已有 current；只有真正成为 current 时才发 offered 事件。 */
export function enqueueDecision(state: GameState, decision: RunDecision): GameEvent[] {
  if (state.decisions.current) {
    state.decisions.pending.push(decision);
    return [];
  }
  state.decisions.current = decision;
  state.paused = true;
  return [{ type: 'decisionOffered', kind: decision.kind }];
}

/** 解析当前选择并顺序弹出下一项；升级选择始终保有更高的暂停优先级。 */
export function resolveCurrentDecision(
  state: GameState,
  config: Config,
  rng: Rng,
  choice: string,
): GameEvent[] {
  const decision = state.decisions.current;
  if (
    !decision
    || state.pendingLevelUps > 0
    || state.offeredPerks.length > 0
    || !validChoices(decision).includes(choice)
  ) return [];

  const events = resolvers[decision.kind]?.(state, config, rng, decision, choice) ?? [];
  events.push({ type: 'decisionResolved', kind: decision.kind, choice });
  state.decisions.current = state.decisions.pending.shift() ?? null;
  if (state.decisions.current) {
    state.paused = true;
    events.push({ type: 'decisionOffered', kind: state.decisions.current.kind });
  } else {
    state.paused = state.pendingLevelUps > 0 || state.offeredPerks.length > 0;
  }
  return events;
}

export function clearDecisionQueue(state: GameState): void {
  state.decisions.current = null;
  state.decisions.pending.length = 0;
}
