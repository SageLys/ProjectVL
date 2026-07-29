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

        public DropSystem(
            EconomyConfig economy,
            IRandomSource random)
        {
            _economy = economy ?? throw new ArgumentNullException(nameof(economy));
            _random = random ?? throw new ArgumentNullException(nameof(random));
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

            float chance = Math.Min(
                _economy.drops.chanceCap,
                _economy.defaults.dropChance
                    * state.DropRateMultiplier);
            if (_random.NextFloat() >= chance)
            {
                return null;
            }

            int typeIndex = Math.Min(
                CardTypes.Length - 1,
                (int)(_random.NextFloat() * CardTypes.Length));
            return Spawn(
                state,
                enemy.Position,
                CardTypes[typeIndex],
                1);
        }

        public GroundDropState SpawnTestDrop(
            GameState state,
            Float2 position)
        {
            int typeIndex = state.GroundDrops.Count % CardTypes.Length;
            return Spawn(state, position, CardTypes[typeIndex], 1);
        }

        public GroundDropState SpawnBonusDrop(
            GameState state,
            Float2 position,
            int star)
        {
            int typeIndex = Math.Min(
                CardTypes.Length - 1,
                (int)(_random.NextFloat() * CardTypes.Length));
            return Spawn(
                state,
                position,
                CardTypes[typeIndex],
                Math.Max(1, star));
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

            int typeIndex = Math.Min(
                CardTypes.Length - 1,
                (int)(_random.NextFloat() * CardTypes.Length));
            return Spawn(
                state,
                position,
                CardTypes[typeIndex],
                1);
        }

        public void Step(GameState state, float deltaTime)
        {
            for (int index = state.GroundDrops.Count - 1; index >= 0; index--)
            {
                GroundDropState drop = state.GroundDrops[index];
                drop.LifeRemaining -= deltaTime;
                if (drop.LifeRemaining <= 0f)
                {
                    state.GroundDrops.RemoveAt(index);
                    if (state.ExpiryConvertRatio > 0f
                        && _random.NextFloat()
                            < state.ExpiryConvertRatio)
                    {
                        state.AddExperience(drop.Star * 4f);
                        state.ExpiredDropsConverted++;
                    }
                }
            }
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
                return DropCollectResult.HandFull;
            }

            state.GroundDrops.Remove(nearest);
            CardCombatProfile profile = CardEffectResolver.Resolve(state);
            state.RestoreHp(profile.PickupRestore);
            return DropCollectResult.Collected;
        }

        private GroundDropState Spawn(
            GameState state,
            Float2 position,
            string cardType,
            int star)
        {
            float lifetime = _economy.defaults.dropLifetime
                * state.DropLifetimeMultiplier;
            var drop = new GroundDropState(
                state.TakeNextDropId(),
                position,
                cardType,
                star,
                lifetime);
            state.GroundDrops.Add(drop);
            return drop;
        }
    }
}
