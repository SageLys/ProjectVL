using System;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class EnemyFactory
    {
        private readonly CombatConfig _combat;
        private readonly EnemiesConfig _enemies;
        private readonly WavesConfig _waves;
        private readonly IRandomSource _random;
        private readonly DifficultySystem _difficulty;

        public EnemyFactory(
            CombatConfig combat,
            EnemiesConfig enemies,
            WavesConfig waves,
            IRandomSource random,
            DifficultySystem difficulty = null)
        {
            _combat = combat;
            _enemies = enemies;
            _waves = waves;
            _random = random;
            _difficulty = difficulty;
        }

        public EnemyKind DetermineKind(int wave, float roll)
        {
            float tankThreshold = _waves.typeRoll.tankBase
                + wave * _waves.typeRoll.tankPerWave;
            if (roll < tankThreshold)
            {
                return EnemyKind.Tank;
            }

            return roll < _waves.typeRoll.fastThreshold
                ? EnemyKind.Fast
                : EnemyKind.Normal;
        }

        public EnemyState SpawnRegular(GameState state)
        {
            EnemyKind kind = DetermineKind(state.Wave, _random.NextFloat());
            EnemyTypeConfig definition = _enemies.Get(kind);
            DifficultyMultipliers multipliers = MultipliersFor(state, kind);
            float hp = (definition.hpBase + state.Wave * definition.hpPerWave)
                * multipliers.Hp;
            float speed = (definition.speedBase + state.Wave * definition.speedPerWave)
                * multipliers.Speed;

            var enemy = new EnemyState(
                state.TakeNextEnemyId(),
                kind,
                RandomEdgePosition(),
                hp,
                speed,
                definition.r,
                definition.damage * multipliers.Damage,
                xpReward: definition.xp,
                label: definition.label,
                color: definition.color,
                sides: definition.sides,
                knockbackResist: definition.knockbackResist,
                ccResist: definition.ccResist);
            state.Enemies.Add(enemy);
            EmitSpawn(state, enemy, multipliers);
            return enemy;
        }

        public EnemyState SpawnWaveBoss(GameState state)
        {
            EnemyTypeConfig definition = _enemies.Get(EnemyKind.Boss);
            DifficultyMultipliers multipliers =
                MultipliersFor(state, EnemyKind.Boss);
            float hp = (definition.hpBase + state.Wave * definition.hpPerWave)
                * multipliers.Hp;
            float speed = (definition.speedBase + state.Wave * definition.speedPerWave)
                * multipliers.Speed;
            var boss = new EnemyState(
                state.TakeNextEnemyId(),
                EnemyKind.Boss,
                RandomEdgePosition(),
                hp,
                speed,
                definition.r,
                definition.damage * multipliers.Damage,
                EnemySpawnKind.WaveBoss,
                definition.contactDps * multipliers.Damage,
                xpReward: definition.xp,
                label: definition.label,
                color: definition.color,
                sides: definition.sides,
                knockbackResist: definition.knockbackResist,
                ccResist: definition.ccResist);
            boss.ContactTickRemaining = _enemies.bossBehavior.contactWarmup;
            state.Enemies.Add(boss);
            EmitSpawn(state, boss, multipliers);
            return boss;
        }

        public EnemyState SpawnValidationElite(
            GameState state,
            ValidationEnemyConfig validation)
        {
            EnemyKind kind = ParseKind(validation.type);
            EnemyTypeConfig definition = _enemies.Get(kind);
            DifficultyMultipliers multipliers = MultipliersFor(state, kind);
            float hp = (definition.hpBase + state.Wave * definition.hpPerWave)
                * validation.hpMul
                * multipliers.Hp;
            float speed = (definition.speedBase + state.Wave * definition.speedPerWave)
                * validation.speedMul
                * multipliers.Speed;
            var enemy = new EnemyState(
                state.TakeNextEnemyId(),
                kind,
                RandomEdgePosition(),
                hp,
                speed,
                definition.r,
                definition.damage
                    * validation.damageMul
                    * multipliers.Damage,
                EnemySpawnKind.ValidationElite,
                0f,
                ToRunReward(validation.reward),
                definition.xp,
                definition.label,
                definition.color,
                definition.sides,
                definition.knockbackResist,
                definition.ccResist,
                validation.knockbackResistOverride,
                validation.ccResistOverride);
            state.Enemies.Add(enemy);
            EmitSpawn(state, enemy, multipliers);
            return enemy;
        }

        public EnemyState SpawnBountyMember(
            GameState state,
            EnemyKind kind,
            Float2 position,
            BountyEncounterState encounter,
            BountyEncounterConfig bounty)
        {
            EnemyTypeConfig definition = _enemies.Get(kind);
            DifficultyMultipliers multipliers = MultipliersFor(state, kind);
            float hp = (definition.hpBase + state.Wave * definition.hpPerWave)
                * bounty.hpMul
                * multipliers.Hp;
            float speed =
                (definition.speedBase + state.Wave * definition.speedPerWave)
                * bounty.speedMul
                * multipliers.Speed;
            var enemy = new EnemyState(
                state.TakeNextEnemyId(),
                kind,
                position,
                hp,
                speed,
                definition.r,
                definition.damage
                    * bounty.damageMul
                    * multipliers.Damage,
                EnemySpawnKind.Bounty,
                0f,
                null,
                definition.xp,
                definition.label,
                definition.color,
                definition.sides,
                definition.knockbackResist,
                definition.ccResist);
            enemy.BountyEncounterId = encounter.Id;
            enemy.BountyRewardType = encounter.RewardCardType;
            state.Enemies.Add(enemy);
            EmitSpawn(state, enemy, multipliers);
            return enemy;
        }

        public static RunReward ToRunReward(RewardConfig reward)
        {
            if (reward == null)
            {
                return null;
            }

            RewardKind kind = string.Equals(
                reward.kind,
                "wildcard",
                StringComparison.OrdinalIgnoreCase)
                ? RewardKind.Wildcard
                : RewardKind.Card;
            return new RunReward(kind, reward.star, reward.count, reward.typePolicy);
        }

        private static EnemyKind ParseKind(string type)
        {
            switch (type)
            {
                case "fast":
                    return EnemyKind.Fast;
                case "tank":
                    return EnemyKind.Tank;
                case "boss":
                    return EnemyKind.Boss;
                default:
                    return EnemyKind.Normal;
            }
        }

        private DifficultyMultipliers MultipliersFor(
            GameState state,
            EnemyKind kind)
        {
            return _difficulty != null
                ? _difficulty.Get(state.Difficulty, kind, state.Wave)
                : new DifficultyMultipliers(1f, 1f, 1f);
        }

        private Float2 RandomEdgePosition()
        {
            int side = Math.Min(3, (int)(_random.NextFloat() * 4f));
            float horizontal = 35f + _random.NextFloat() * (_combat.canvas.width - 70f);
            float vertical = 35f + _random.NextFloat() * (_combat.canvas.height - 70f);

            switch (side)
            {
                case 0:
                    return new Float2(horizontal, -_waves.spawnMargin);
                case 1:
                    return new Float2(_combat.canvas.width + _waves.spawnMargin, vertical);
                case 2:
                    return new Float2(horizontal, _combat.canvas.height + _waves.spawnMargin);
                default:
                    return new Float2(-_waves.spawnMargin, vertical);
            }
        }

        private static void EmitSpawn(
            GameState state,
            EnemyState enemy,
            DifficultyMultipliers multipliers)
        {
            state.EmitTelemetry(new TelemetryEventRecord
            {
                type = "spawn",
                enemyId = enemy.Id,
                entityId = enemy.Id,
                detail = enemy.Kind.ToString(),
                source = enemy.SpawnKind.ToString(),
                x = enemy.Position.X,
                y = enemy.Position.Y,
                difficultyHpMultiplier = multipliers.Hp,
                difficultyDamageMultiplier = multipliers.Damage
            });
        }
    }
}
