using System;
using System.Collections.Generic;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class BountySystem
    {
        private readonly BountyConfig _config;
        private readonly CombatConfig _combat;
        private readonly WavesConfig _waves;
        private readonly WavePlanResolver _wavePlans;
        private readonly EnemyFactory _enemies;
        private readonly CardPoolSystem _cards;
        private readonly DropSystem _drops;
        private readonly IRandomSource _random;

        public float EmergencyOverrideDistance =>
            _config.encounter.emergencyOverrideDistance;

        public BountySystem(
            BountyConfig config,
            CombatConfig combat,
            WavesConfig waves,
            EnemyFactory enemies,
            CardPoolSystem cards,
            DropSystem drops,
            IRandomSource random)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _combat = combat ?? throw new ArgumentNullException(nameof(combat));
            _waves = waves ?? throw new ArgumentNullException(nameof(waves));
            _enemies = enemies ?? throw new ArgumentNullException(nameof(enemies));
            _cards = cards ?? throw new ArgumentNullException(nameof(cards));
            _drops = drops ?? throw new ArgumentNullException(nameof(drops));
            _random = random ?? throw new ArgumentNullException(nameof(random));
            _wavePlans = new WavePlanResolver(waves);
        }

        public void OnWaveStarted(GameState state)
        {
            state.BountyOffers.Clear();
            state.BountyEncounters.Clear();
            state.BountyOffersThisWave = 0;
            state.BountiesAcceptedThisWave = 0;
            state.BountiesCompletedThisWave = 0;
            state.BountyCheckTimer = _config.offer.checkIntervalSeconds;
            state.BountyCooldownRemaining = 0f;
            state.GuaranteedBountyThisWave = false;
        }

        public void ClearOffers(GameState state)
        {
            state?.BountyOffers.Clear();
        }

        public bool HasBlockingEncounter(GameState state)
        {
            if (state == null)
            {
                return false;
            }

            foreach (BountyEncounterState encounter in state.BountyEncounters)
            {
                if (encounter.Status == BountyEncounterStatus.Spawning
                    || encounter.Status == BountyEncounterStatus.Active)
                {
                    return true;
                }
            }

            return false;
        }

        public void Step(GameState state, float deltaTime)
        {
            if (state == null)
            {
                return;
            }

            TickOffers(state, deltaTime);
            TickEncounterSpawns(state, deltaTime);
            state.BountyCooldownRemaining = Math.Max(
                0f,
                state.BountyCooldownRemaining - deltaTime);

            if (state.Mode != GameMode.Playing
                || state.IntermissionActive
                || state.WavePhase != WavePhase.Regular)
            {
                return;
            }

            state.BountyCheckTimer -= deltaTime;
            float interval = Math.Max(
                0.01f,
                _config.offer.checkIntervalSeconds);
            while (state.BountyCheckTimer <= 0f)
            {
                state.BountyCheckTimer += interval;
                if (!CanCreateOffer(state))
                {
                    continue;
                }

                float progress = state.WaveSpawnQuota > 0
                    ? 1f - state.SpawnLeft / (float)state.WaveSpawnQuota
                    : 1f;
                bool guaranteed =
                    state.BountyOffersThisWave
                        < _config.offer.minOffersPerWave
                    && progress >= _config.offer.guaranteeAtWaveProgress;
                if (guaranteed
                    || (state.BountyCooldownRemaining <= 0f
                        && _random.NextFloat() < CalculateOfferChance(state)))
                {
                    CreateOffer(state, guaranteed);
                }
            }
        }

        public bool CanCreateOffer(GameState state)
        {
            return state != null
                && _config.enabled
                && state.Wave >= _config.offer.enabledFromWave
                && state.Mode == GameMode.Playing
                && state.WavePhase == WavePhase.Regular
                && !state.IntermissionActive
                && _wavePlans.StageForWave(state.Wave)
                    != RunStage.Validation
                && state.BountyOffersThisWave
                    < _config.offer.maxOffersPerWave
                && state.BountyOffers.Count
                    < _config.offer.maxConcurrentOffers
                && ActiveEncounterCount(state)
                    < _config.offer.maxConcurrentEncounters;
        }

        public float CalculateOfferChance(GameState state)
        {
            BountyOfferConfig offer = _config.offer;
            float hpRatio = state.MaxHp > 0f
                ? state.Hp / state.MaxHp
                : 0f;
            float healthyScore = Clamp01(
                (hpRatio - offer.healthyHpThreshold)
                / Math.Max(0.0001f, 1f - offer.healthyHpThreshold));
            float noDamageSeconds = Math.Max(
                0f,
                state.Time - state.LastHpLossAt);
            float noDamageScore = Clamp01(
                noDamageSeconds
                / Math.Max(0.0001f, offer.noDamageRampSeconds));
            float recentDamageScore = Clamp01(
                1f - noDamageSeconds
                / Math.Max(0.0001f, offer.recentDamagePenaltySeconds));
            return Clamp(
                offer.baseChancePerCheck
                    + healthyScore * offer.healthyHpBonusMax
                    + noDamageScore * offer.noDamageBonusMax
                    - recentDamageScore * offer.recentDamagePenalty,
                offer.minChancePerCheck,
                offer.maxChancePerCheck);
        }

        public BountyOfferState CreateOffer(
            GameState state,
            bool guaranteed)
        {
            BountySide side = (BountySide)Math.Min(
                3,
                (int)(_random.NextFloat() * 4f));
            Float2 position = OfferPosition(side);
            BountyRewardConfig reward = _config.reward;
            var offer = new BountyOfferState(
                state.TakeNextBountyOfferId(),
                SelectBountyRewardType(state),
                RewardStar(
                    reward.cardStarByWave,
                    reward.cardStarMax,
                    state.Wave),
                reward.cardCount,
                RewardStar(
                    reward.wildcardStarByWave,
                    reward.wildcardStarMax,
                    state.Wave),
                reward.wildcardCount,
                side,
                position,
                _config.offer.markWindowSeconds,
                guaranteed,
                state.Time);
            state.BountyOffers.Add(offer);
            state.BountyOffersThisWave++;
            state.TotalBountyOffers++;
            state.GuaranteedBountyThisWave |= guaranteed;
            state.BountyCooldownRemaining = _config.offer.cooldownSeconds;
            state.EmitTelemetry(new TelemetryEventRecord
            {
                type = "bountyOffer",
                offerId = offer.Id,
                entityId = offer.Id,
                rewardCardType = offer.RewardCardType,
                rewardCardStar = offer.RewardCardStar,
                wildcardStar = offer.WildcardStar,
                wildcardCount = offer.WildcardCount,
                guaranteed = offer.Guaranteed,
                x = offer.Position.X,
                y = offer.Position.Y
            });
            return offer;
        }

        public bool AcceptAt(GameState state, Float2 point)
        {
            float hitRadius = _config.visual.offerRadius + 16f;
            for (int index = 0; index < state.BountyOffers.Count; index++)
            {
                BountyOfferState offer = state.BountyOffers[index];
                if (Float2.Distance(point, offer.Position) > hitRadius)
                {
                    continue;
                }

                state.BountyOffers.RemoveAt(index);
                int memberCount = Math.Min(
                    _config.encounter.enemyCountMax,
                    _config.encounter.enemyCountBase
                        + (int)Math.Floor(
                            (state.Wave - 1)
                            * _config.encounter.enemyCountPerWave));
                var encounter = new BountyEncounterState(
                        state.TakeNextBountyEncounterId(),
                        offer,
                        memberCount,
                        state.Time,
                        state.Hp);
                state.BountyEncounters.Add(encounter);
                state.BountiesAcceptedThisWave++;
                state.TotalBountiesAccepted++;
                state.EmitTelemetry(new TelemetryEventRecord
                {
                    type = "bountyAccepted",
                    offerId = offer.Id,
                    encounterId = encounter.Id,
                    rewardCardType = encounter.RewardCardType,
                    rewardCardStar = encounter.RewardCardStar,
                    wildcardStar = encounter.WildcardStar,
                    wildcardCount = encounter.WildcardCount,
                    guaranteed = encounter.Guaranteed,
                    memberCount = memberCount,
                    decisionSeconds = Math.Max(
                        0f,
                        state.Time - offer.CreatedAt),
                    hpAtAccept = state.Hp
                });
                return true;
            }

            return false;
        }

        public bool NotifyKilled(GameState state, EnemyState enemy)
        {
            if (state == null || enemy?.BountyEncounterId == null)
            {
                return false;
            }

            BountyEncounterState encounter = FindEncounter(
                state,
                enemy.BountyEncounterId.Value);
            if (encounter == null
                || (encounter.Status != BountyEncounterStatus.Spawning
                    && encounter.Status != BountyEncounterStatus.Active))
            {
                return false;
            }

            encounter.MemberIds.Remove(enemy.Id);
            encounter.LastKillPosition = enemy.Position;
            if (encounter.MemberIds.Count > 0
                || encounter.PendingSpawnCount > 0)
            {
                return false;
            }

            encounter.Status = BountyEncounterStatus.Completed;
            state.BountiesCompletedThisWave++;
            state.TotalBountiesCompleted++;
            state.EmitTelemetry(new TelemetryEventRecord
            {
                type = "bountyCompleted",
                encounterId = encounter.Id,
                rewardCardType = encounter.RewardCardType,
                rewardCardStar = encounter.RewardCardStar,
                wildcardStar = encounter.WildcardStar,
                wildcardCount = encounter.WildcardCount,
                guaranteed = encounter.Guaranteed,
                clearSeconds = Math.Max(
                    0f,
                    state.Time - encounter.AcceptedAt),
                hpAtAccept = encounter.HpAtAccept,
                hpAtComplete = state.Hp
            });
            SpawnReward(state, encounter);
            return true;
        }

        public bool NotifyBreached(GameState state, EnemyState enemy)
        {
            if (state == null || enemy?.BountyEncounterId == null)
            {
                return false;
            }

            int encounterId = enemy.BountyEncounterId.Value;
            BountyEncounterState encounter = FindEncounter(
                state,
                encounterId);
            if (encounter == null
                || (encounter.Status != BountyEncounterStatus.Spawning
                    && encounter.Status != BountyEncounterStatus.Active))
            {
                return false;
            }

            encounter.Status = BountyEncounterStatus.Failed;
            encounter.PendingSpawnCount = 0;
            encounter.MemberIds.Clear();
            state.EmitTelemetry(new TelemetryEventRecord
            {
                type = "bountyFailed",
                encounterId = encounter.Id,
                rewardCardType = encounter.RewardCardType,
                rewardCardStar = encounter.RewardCardStar,
                wildcardStar = encounter.WildcardStar,
                wildcardCount = encounter.WildcardCount,
                guaranteed = encounter.Guaranteed,
                hpAtAccept = encounter.HpAtAccept
            });
            foreach (EnemyState member in state.Enemies)
            {
                if (member.BountyEncounterId != encounterId)
                {
                    continue;
                }

                member.BountyEncounterId = null;
                member.BountyRewardType = null;
                member.SpawnKind = EnemySpawnKind.Regular;
            }

            return true;
        }

        public string SelectBountyRewardType(GameState state)
        {
            IReadOnlyList<string> pool = _cards.GetRunPool(state);
            if (pool.Count == 0)
            {
                return null;
            }

            var weights = new List<float>();
            foreach (string type in pool)
            {
                float weight = 1f;
                if (OneStarCount(state, type) == 1)
                {
                    weight *= _config.rewardBias.nearMergeBonus;
                }

                if (_cards.CalculateCommitmentScore(state, type) > 0f)
                {
                    weight *= _config.rewardBias.investedBonus;
                }

                weight *= 1f + _cards.CalculateAffinityScore(state, type);
                if (!string.IsNullOrEmpty(state.FocusGod)
                    && state.RosterByGod.TryGetValue(
                        state.FocusGod,
                        out List<string> focusRoster)
                    && focusRoster.Contains(type))
                {
                    weight *= 1.75f;
                }

                if (state.StatsFor(type).TotalShown == 0)
                {
                    weight *= _config.rewardBias.droughtBonus;
                }

                if (_config.reward.repeatProtection > 0
                    && pool.Count > 1
                    && type == state.LastBountyRewardType)
                {
                    weight = 0f;
                }

                weights.Add(Math.Max(0f, weight));
            }

            string selected = WeightedPick(pool, weights);
            state.LastBountyRewardType = selected;
            return selected;
        }

        private void TickOffers(GameState state, float deltaTime)
        {
            for (int index = state.BountyOffers.Count - 1; index >= 0; index--)
            {
                BountyOfferState offer = state.BountyOffers[index];
                offer.Remaining -= deltaTime;
                if (offer.Remaining <= 0f)
                {
                    state.BountyOffers.RemoveAt(index);
                    state.EmitTelemetry(new TelemetryEventRecord
                    {
                        type = "bountyOfferExpired",
                        offerId = offer.Id,
                        entityId = offer.Id,
                        rewardCardType = offer.RewardCardType,
                        guaranteed = offer.Guaranteed
                    });
                }
            }
        }

        private void TickEncounterSpawns(GameState state, float deltaTime)
        {
            float interval = Math.Max(
                0.01f,
                _config.encounter.spawnIntervalSeconds);
            foreach (BountyEncounterState encounter in state.BountyEncounters)
            {
                if (encounter.Status != BountyEncounterStatus.Spawning)
                {
                    continue;
                }

                encounter.SpawnTimer -= deltaTime;
                while (encounter.PendingSpawnCount > 0
                    && encounter.SpawnTimer <= 0f)
                {
                    EnemyState member = _enemies.SpawnBountyMember(
                        state,
                        SelectEnemyKind(),
                        SpawnPosition(encounter),
                        encounter,
                        _config.encounter);
                    encounter.MemberIds.Add(member.Id);
                    encounter.PendingSpawnCount--;
                    encounter.SpawnTimer += interval;
                    state.EmitTelemetry(new TelemetryEventRecord
                    {
                        type = "bountyMemberSpawned",
                        encounterId = encounter.Id,
                        enemyId = member.Id,
                        entityId = member.Id,
                        x = member.Position.X,
                        y = member.Position.Y
                    });
                }

                if (encounter.PendingSpawnCount == 0)
                {
                    encounter.Status = BountyEncounterStatus.Active;
                }
            }
        }

        private void SpawnReward(
            GameState state,
            BountyEncounterState encounter)
        {
            int visualCount = Math.Max(1, encounter.RewardCardCount);
            for (int index = 0; index < encounter.RewardCardCount; index++)
            {
                float offset = (index - (visualCount - 1) * 0.5f) * 34f;
                _drops.SpawnSpecificDrop(
                    state,
                    encounter.LastKillPosition + new Float2(offset, -28f),
                    encounter.RewardCardType,
                    encounter.RewardCardStar,
                    _config.reward.dropLifetimeSeconds,
                    "bounty",
                    true,
                    encounter.Id);
            }

            if (encounter.WildcardCount > 0)
            {
                state.GrantReward(
                    new RunReward(
                        RewardKind.Wildcard,
                        encounter.WildcardStar,
                        encounter.WildcardCount,
                        "bounty"));
                state.EmitTelemetry(new TelemetryEventRecord
                {
                    type = "bountyRewardLanded",
                    encounterId = encounter.Id,
                    rewardKind = "wildcard",
                    wildcardStar = encounter.WildcardStar,
                    wildcardCount = encounter.WildcardCount,
                    secure = true
                });
                state.EmitTelemetry(new TelemetryEventRecord
                {
                    type = "bountyRewardPickup",
                    encounterId = encounter.Id,
                    rewardKind = "wildcard",
                    wildcardStar = encounter.WildcardStar,
                    wildcardCount = encounter.WildcardCount,
                    secure = true
                });
            }
        }

        private EnemyKind SelectEnemyKind()
        {
            BountyCompositionConfig composition =
                _config.encounter.composition;
            float normal = Math.Max(0f, composition.normalWeight);
            float fast = Math.Max(0f, composition.fastWeight);
            float tank = Math.Max(0f, composition.tankWeight);
            float total = normal + fast + tank;
            if (total <= 0f)
            {
                return EnemyKind.Normal;
            }

            float roll = _random.NextFloat() * total;
            return roll < normal
                ? EnemyKind.Normal
                : roll < normal + fast
                    ? EnemyKind.Fast
                    : EnemyKind.Tank;
        }

        private Float2 SpawnPosition(BountyEncounterState encounter)
        {
            float offset =
                (_random.NextFloat() - 0.5f) * _config.encounter.spawnSpread;
            float margin = _waves.spawnMargin;
            float bottomSpawnY = BottomSpawnY();
            if (encounter.Side == BountySide.Top
                || encounter.Side == BountySide.Bottom)
            {
                return new Float2(
                    Clamp(
                        encounter.LastKillPosition.X + offset,
                        35f,
                        _combat.canvas.width - 35f),
                    encounter.Side == BountySide.Top
                        ? -margin
                        : bottomSpawnY);
            }

            return new Float2(
                encounter.Side == BountySide.Left
                    ? -margin
                    : _combat.canvas.width + margin,
                Clamp(
                    encounter.LastKillPosition.Y + offset,
                    35f,
                    bottomSpawnY - 35f));
        }

        private Float2 OfferPosition(BountySide side)
        {
            float inset = Math.Max(
                _config.visual.offerEdgeInset,
                _config.visual.offerRadius + 2f);
            float bottomSpawnY = BottomSpawnY();
            if (side == BountySide.Top || side == BountySide.Bottom)
            {
                return new Float2(
                    inset
                        + _random.NextFloat()
                        * Math.Max(0f, _combat.canvas.width - inset * 2f),
                    side == BountySide.Top
                        ? inset
                        : Math.Max(inset, bottomSpawnY - inset));
            }

            return new Float2(
                side == BountySide.Left
                    ? inset
                    : _combat.canvas.width - inset,
                inset
                    + _random.NextFloat()
                    * Math.Max(0f, bottomSpawnY - inset * 2f));
        }

        private float BottomSpawnY()
        {
            return Math.Max(
                70f,
                _combat.canvas.height
                    - Math.Max(0f, _waves.bottomSpawnInset));
        }

        private string WeightedPick(
            IReadOnlyList<string> values,
            IReadOnlyList<float> weights)
        {
            float total = 0f;
            foreach (float weight in weights)
            {
                total += Math.Max(0f, weight);
            }

            if (total <= 0f)
            {
                int index = Math.Min(
                    values.Count - 1,
                    (int)(_random.NextFloat() * values.Count));
                return values[index];
            }

            float roll = _random.NextFloat() * total;
            for (int index = 0; index < values.Count; index++)
            {
                roll -= Math.Max(0f, weights[index]);
                if (roll < 0f)
                {
                    return values[index];
                }
            }

            return values[values.Count - 1];
        }

        private static int RewardStar(
            int[] schedule,
            int maximum,
            int wave)
        {
            if (schedule == null || schedule.Length == 0)
            {
                return 1;
            }

            int index = Math.Min(
                schedule.Length - 1,
                Math.Max(0, wave - 1));
            return Math.Min(maximum, schedule[index]);
        }

        private static int OneStarCount(
            GameState state,
            string cardType)
        {
            int count = 0;
            foreach (CardState card in state.Hand)
            {
                if (card?.Type == cardType && card.Star == 1)
                {
                    count++;
                }
            }

            foreach (CardState card in state.Equipment)
            {
                if (card?.Type == cardType && card.Star == 1)
                {
                    count++;
                }
            }

            return count;
        }

        private static int ActiveEncounterCount(GameState state)
        {
            int count = 0;
            foreach (BountyEncounterState encounter in state.BountyEncounters)
            {
                if (encounter.Status == BountyEncounterStatus.Spawning
                    || encounter.Status == BountyEncounterStatus.Active)
                {
                    count++;
                }
            }

            return count;
        }

        private static BountyEncounterState FindEncounter(
            GameState state,
            int id)
        {
            return state.BountyEncounters.Find(
                encounter => encounter.Id == id);
        }

        private static float Clamp(float value, float min, float max)
        {
            return Math.Max(min, Math.Min(max, value));
        }

        private static float Clamp01(float value)
        {
            return Clamp(value, 0f, 1f);
        }
    }
}
