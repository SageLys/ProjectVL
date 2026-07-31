using System;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public enum DropCollectResult
    {
        NotFound,
        Collected,
        HandFull
    }

    public sealed class DropSystem
    {
        private static readonly string[] CardTypes =
        {
            "pierce",
            "chainLightning",
            "frost",
            "decoy",
            "scorch",
            "harvest",
            "aegis",
            "splitBlast",
            "impact",
            "sanctum",
            "thorns"
        };

        private readonly EconomyConfig _economy;
        private readonly IRandomSource _random;
        private readonly RewardMeterSystem _rewardMeter;
        private readonly CardPoolSystem _cardPool;
        private readonly WavesConfig _waves;

        public DropSystem(
            EconomyConfig economy,
            IRandomSource random,
            RewardMeterSystem rewardMeter = null,
            CardPoolSystem cardPool = null,
            WavesConfig waves = null)
        {
            _economy = economy ?? throw new ArgumentNullException(nameof(economy));
            _random = random ?? throw new ArgumentNullException(nameof(random));
            _rewardMeter = rewardMeter;
            _cardPool = cardPool;
            _waves = waves;
        }

        public GroundDropState TrySpawnOnKill(
            GameState state,
            EnemyState enemy)
        {
            if (state == null
                || enemy == null
                || enemy.SpawnKind != EnemySpawnKind.Regular)
            {
                return null;
            }

            if (_economy.ordinaryDropRate.enabled)
            {
                if (StageForWave(state.Wave) == RunStage.Validation)
                {
                    return null;
                }

                state.OrdinaryDropEligibleKillsThisWave++;
                if (state.OrdinaryDropCredit < 1f)
                {
                    return null;
                }

                state.OrdinaryDropCredit -= 1f;
            }
            else
            {
                float chance = Math.Min(
                    _economy.drops.chanceCap,
                    _economy.defaults.dropChance
                        * state.DropRateMultiplier);
                if (_random.NextFloat() >= chance)
                {
                    return null;
                }
            }

            string cardType = _cardPool?.SelectNormalEnemyDropType(state)
                ?? SelectActiveType(state);
            GroundDropState drop = Spawn(
                state,
                enemy.Position,
                cardType,
                NormalDropStar(),
                true);
            state.OrdinaryDropsShownThisWave++;
            return drop;
        }

        public GroundDropState SpawnTestDrop(
            GameState state,
            Float2 position)
        {
            string cardType = _cardPool?.SelectActiveDropType(state);
            if (string.IsNullOrEmpty(cardType))
            {
                int typeIndex = state.GroundDrops.Count % CardTypes.Length;
                cardType = CardTypes[typeIndex];
            }

            return Spawn(state, position, cardType, 1, false);
        }

        public GroundDropState SpawnBonusDrop(
            GameState state,
            Float2 position,
            int star)
        {
            return Spawn(
                state,
                position,
                SelectActiveType(state),
                Math.Max(1, star),
                false);
        }

        public GroundDropState SpawnWeightedBonusDrop(
            GameState state,
            Float2 position,
            float oneStarWeight,
            float twoStarWeight)
        {
            float total = Math.Max(
                0.0001f,
                oneStarWeight + twoStarWeight);
            int star = _random.NextFloat() * total
                < oneStarWeight ? 1 : 2;
            return SpawnBonusDrop(state, position, star);
        }

        public GroundDropState TrySpawnBonus(
            GameState state,
            Float2 position,
            float chance)
        {
            if (_random.NextFloat() >= chance)
            {
                return null;
            }

            return Spawn(
                state,
                position,
                SelectActiveType(state),
                1,
                false);
        }

        public GroundDropState SpawnSpecificDrop(
            GameState state,
            Float2 position,
            string cardType,
            int star,
            float lifetime,
            string source = "bonus",
            bool secure = false,
            int? bountyEncounterId = null,
            int? validationRewardWave = null)
        {
            if (state == null
                || string.IsNullOrEmpty(cardType)
                || !CardPoolSystem.IsPlayable(cardType))
            {
                return null;
            }

            var drop = new GroundDropState(
                state.TakeNextDropId(),
                position,
                cardType,
                Math.Max(1, star),
                Math.Max(0.1f, lifetime),
                source,
                secure,
                bountyEncounterId,
                validationRewardWave);
            state.GroundDrops.Add(drop);
            _cardPool?.RecordDropShown(state, cardType, false);
            EmitDropLanded(state, drop);
            return drop;
        }

        public void Step(GameState state, float deltaTime)
        {
            TickOrdinaryDropBudget(state, deltaTime);
            for (int index = state.GroundDrops.Count - 1; index >= 0; index--)
            {
                GroundDropState drop = state.GroundDrops[index];
                drop.LifeRemaining -= deltaTime;
                if (drop.LifeRemaining <= 0f)
                {
                    state.GroundDrops.RemoveAt(index);
                    state.EmitTelemetry(new TelemetryEventRecord
                    {
                        type = "dropExpired",
                        dropId = drop.Id,
                        entityId = drop.Id,
                        cardType = drop.CardType,
                        source = drop.Source,
                        stage = StageForWave(state.Wave).ToString(),
                        star = drop.Star,
                        secure = drop.Secure,
                        x = drop.Position.X,
                        y = drop.Position.Y,
                        visibleSeconds = drop.MaxLife
                    });
                    if (state.ExpiryConvertRatio > 0f
                        && _random.NextFloat()
                            < state.ExpiryConvertRatio)
                    {
                        float rewardPoints = drop.Star
                            * (_rewardMeter?.Config
                                .expiryConvertPointsPerStar ?? 4f);
                        if (_rewardMeter != null)
                        {
                            _rewardMeter.AddPoints(state, rewardPoints);
                        }
                        else
                        {
                            state.AddExperience(rewardPoints);
                        }

                        state.ExpiredDropsConverted++;
                    }
                }
            }
        }

        public void TickOrdinaryDropBudget(
            GameState state,
            float deltaTime)
        {
            OrdinaryDropRateConfig rate = _economy.ordinaryDropRate;
            if (!rate.enabled
                || state == null
                || state.Mode != GameMode.Playing
                || state.Paused
                || state.WavePhase != WavePhase.Regular
                || StageForWave(state.Wave) == RunStage.Validation)
            {
                return;
            }

            float perMinute = rate.selectionPerMinute;
            if (StageForWave(state.Wave) == RunStage.Build)
            {
                float transition = rate.buildTransitionSeconds <= 0f
                    ? 1f
                    : Math.Min(
                        1f,
                        state.OrdinaryDropBuildStageSeconds
                            / rate.buildTransitionSeconds);
                perMinute +=
                    (rate.buildPerMinute - rate.selectionPerMinute)
                    * transition;
                state.OrdinaryDropBuildStageSeconds += deltaTime;
            }

            float multiplier = rate.modifiersAffectTarget
                ? state.DropRateMultiplier
                : 1f;
            state.OrdinaryDropCredit = Math.Min(
                Math.Max(1f, rate.carryCap),
                state.OrdinaryDropCredit
                    + perMinute * multiplier / 60f * deltaTime);
            state.OrdinaryDropActiveRegularSeconds += deltaTime;
        }

        public DropCollectResult CollectNearest(
            GameState state,
            Float2 position)
        {
            GroundDropState nearest = null;
            float nearestDistance = _economy.drops.pickupRadius;
            foreach (GroundDropState drop in state.GroundDrops)
            {
                float distance = Float2.Distance(position, drop.Position);
                if (distance <= nearestDistance)
                {
                    nearest = drop;
                    nearestDistance = distance;
                }
            }

            if (nearest == null)
            {
                return DropCollectResult.NotFound;
            }

            bool granted = state.TryGrantCard(
                nearest.CardType,
                nearest.Star);
            if (!granted)
            {
                state.EmitTelemetry(new TelemetryEventRecord
                {
                    type = "dropRejectedFullHand",
                    dropId = nearest.Id,
                    entityId = nearest.Id,
                    cardType = nearest.CardType,
                    source = nearest.Source,
                    stage = StageForWave(state.Wave).ToString(),
                    star = nearest.Star,
                    secure = nearest.Secure
                });
                return DropCollectResult.HandFull;
            }

            state.GroundDrops.Remove(nearest);
            state.EmitTelemetry(new TelemetryEventRecord
            {
                type = "pickup",
                dropId = nearest.Id,
                entityId = nearest.Id,
                cardType = nearest.CardType,
                source = nearest.Source,
                stage = StageForWave(state.Wave).ToString(),
                star = nearest.Star,
                secure = nearest.Secure,
                x = nearest.Position.X,
                y = nearest.Position.Y
            });
            if (nearest.BountyEncounterId.HasValue)
            {
                state.EmitTelemetry(new TelemetryEventRecord
                {
                    type = "bountyRewardPickup",
                    dropId = nearest.Id,
                    encounterId = nearest.BountyEncounterId.Value,
                    rewardCardType = nearest.CardType,
                    rewardCardStar = nearest.Star
                });
            }
            if (nearest.ValidationRewardWave.HasValue)
            {
                state.EmitTelemetry(new TelemetryEventRecord
                {
                    type = "validationRewardPickup",
                    dropId = nearest.Id,
                    cardType = nearest.CardType,
                    rewardKind = "card",
                    source = nearest.Source,
                    stage = StageForWave(
                        nearest.ValidationRewardWave.Value).ToString(),
                    star = nearest.Star,
                    secure = true
                });
            }
            CardCombatProfile profile = CardEffectResolver.Resolve(state);
            state.RestoreHp(profile.PickupRestore);
            return DropCollectResult.Collected;
        }

        private GroundDropState Spawn(
            GameState state,
            Float2 position,
            string cardType,
            int star,
            bool ordinary)
        {
            float lifetime = _economy.defaults.dropLifetime
                * state.DropLifetimeMultiplier;
            var drop = new GroundDropState(
                state.TakeNextDropId(),
                position,
                cardType,
                star,
                lifetime,
                ordinary ? "normalKill" : "bonus");
            state.GroundDrops.Add(drop);
            _cardPool?.RecordDropShown(state, cardType, ordinary);
            EmitDropLanded(state, drop);
            return drop;
        }

        private void EmitDropLanded(
            GameState state,
            GroundDropState drop)
        {
            state.EmitTelemetry(new TelemetryEventRecord
            {
                type = "dropLanded",
                dropId = drop.Id,
                entityId = drop.Id,
                cardType = drop.CardType,
                source = drop.Source,
                stage = StageForWave(state.Wave).ToString(),
                star = drop.Star,
                secure = drop.Secure,
                x = drop.Position.X,
                y = drop.Position.Y
            });
            string god = FindGodForCard(state, drop.CardType);
            if (!string.IsNullOrEmpty(god))
            {
                state.EmitTelemetry(new TelemetryEventRecord
                {
                    type = "card_shown_by_god",
                    cardType = drop.CardType,
                    godId = god,
                    source = drop.Source,
                    stage = StageForWave(state.Wave).ToString()
                });
            }
            if (drop.BountyEncounterId.HasValue)
            {
                state.EmitTelemetry(new TelemetryEventRecord
                {
                    type = "bountyRewardLanded",
                    dropId = drop.Id,
                    encounterId = drop.BountyEncounterId.Value,
                    rewardCardType = drop.CardType,
                    rewardCardStar = drop.Star,
                    x = drop.Position.X,
                    y = drop.Position.Y
                });
            }
            if (drop.ValidationRewardWave.HasValue)
            {
                state.EmitTelemetry(new TelemetryEventRecord
                {
                    type = "validationRewardLanded",
                    dropId = drop.Id,
                    cardType = drop.CardType,
                    rewardKind = "card",
                    source = drop.Source,
                    stage = StageForWave(
                        drop.ValidationRewardWave.Value).ToString(),
                    star = drop.Star,
                    secure = true,
                    x = drop.Position.X,
                    y = drop.Position.Y
                });
            }
        }

        private static string FindGodForCard(
            GameState state,
            string cardType)
        {
            foreach (var entry in state.RosterByGod)
            {
                if (entry.Value.Contains(cardType))
                    return entry.Key;
            }

            return null;
        }

        private string SelectActiveType(GameState state)
        {
            string selected = _cardPool?.SelectActiveDropType(state);
            if (!string.IsNullOrEmpty(selected))
            {
                return selected;
            }

            int typeIndex = Math.Min(
                CardTypes.Length - 1,
                (int)(_random.NextFloat() * CardTypes.Length));
            return CardTypes[typeIndex];
        }

        private int NormalDropStar()
        {
            DropStarPolicyConfig policy = _economy.dropStarPolicy;
            if (_economy.placeholderAssumptions.normalDropsOnlyOneStar)
            {
                return Math.Max(1, policy.normal);
            }

            return _random.NextFloat() < policy.star2Share
                ? Math.Max(1, policy.normal + 1)
                : Math.Max(1, policy.normal);
        }

        private RunStage StageForWave(int wave)
        {
            if (_waves == null)
            {
                return RunStage.Selection;
            }

            if (wave <= _waves.stagePlan.selectionWaves)
            {
                return RunStage.Selection;
            }

            return wave
                > _waves.totalWaves - _waves.stagePlan.validationWaves
                ? RunStage.Validation
                : RunStage.Build;
        }
    }
}
