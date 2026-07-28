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

        public EnemyFactory(
            CombatConfig combat,
            EnemiesConfig enemies,
            WavesConfig waves,
            IRandomSource random)
        {
            _combat = combat;
            _enemies = enemies;
            _waves = waves;
            _random = random;
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
            float hp = definition.hpBase + state.Wave * definition.hpPerWave;
            float speed = definition.speedBase + state.Wave * definition.speedPerWave;

            var enemy = new EnemyState(
                state.TakeNextEnemyId(),
                kind,
                RandomEdgePosition(),
                hp,
                speed,
                definition.r,
                definition.damage);
            state.Enemies.Add(enemy);
            return enemy;
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
    }
}
