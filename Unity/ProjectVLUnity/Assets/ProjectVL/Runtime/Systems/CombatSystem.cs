using System;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class CombatSystem
    {
        private readonly CombatConfig _combat;

        public CombatSystem(CombatConfig combat)
        {
            _combat = combat;
        }

        public void StepTurret(GameState state, float deltaTime)
        {
            state.ShotCooldown -= deltaTime;
            EnemyState target = FindTarget(state);
            if (target == null)
            {
                return;
            }

            Float2 turret = TurretPosition;
            Float2 direction = (target.Position - turret).Normalized();
            state.TurretAngleRadians = (float)Math.Atan2(direction.Y, direction.X);

            if (state.ShotCooldown > 0f)
            {
                return;
            }

            Float2 muzzle = turret + direction * _combat.bullet.muzzleOffset;
            state.Bullets.Add(new BulletState(
                state.TakeNextBulletId(),
                muzzle,
                direction * _combat.bullet.speed,
                _combat.bullet.radius,
                _combat.bullet.life,
                _combat.defaults.damage));
            state.ShotCooldown = 1f / _combat.defaults.fireRate;
        }

        public void StepBullets(GameState state, float deltaTime)
        {
            for (int bulletIndex = state.Bullets.Count - 1; bulletIndex >= 0; bulletIndex--)
            {
                BulletState bullet = state.Bullets[bulletIndex];
                bullet.Position += bullet.Velocity * deltaTime;
                bullet.LifeRemaining -= deltaTime;

                bool consumed = false;
                for (int enemyIndex = state.Enemies.Count - 1; enemyIndex >= 0; enemyIndex--)
                {
                    EnemyState enemy = state.Enemies[enemyIndex];
                    if (Float2.Distance(bullet.Position, enemy.Position)
                        >= bullet.Radius + enemy.Radius)
                    {
                        continue;
                    }

                    enemy.Hp -= bullet.Damage;
                    if (enemy.Hp <= 0f)
                    {
                        state.Enemies.RemoveAt(enemyIndex);
                        state.Kills++;
                    }

                    consumed = true;
                    break;
                }

                if (consumed || IsExpiredOrOutside(bullet))
                {
                    state.Bullets.RemoveAt(bulletIndex);
                }
            }
        }

        public void StepEnemies(GameState state, float deltaTime)
        {
            Float2 turret = TurretPosition;
            for (int index = state.Enemies.Count - 1; index >= 0; index--)
            {
                EnemyState enemy = state.Enemies[index];
                Float2 toTurret = turret - enemy.Position;
                enemy.Position += toTurret.Normalized()
                    * enemy.Speed
                    * deltaTime;

                if (Float2.Distance(enemy.Position, turret) >= _combat.breakthroughDist)
                {
                    continue;
                }

                state.Enemies.RemoveAt(index);
                state.ApplyDamage(enemy.Damage);
            }
        }

        public EnemyState FindTarget(GameState state)
        {
            Float2 turret = TurretPosition;
            EnemyState closest = null;
            float closestDistance = float.MaxValue;

            foreach (EnemyState enemy in state.Enemies)
            {
                float distance = Float2.Distance(turret, enemy.Position);
                if (distance <= _combat.defaults.range && distance < closestDistance)
                {
                    closest = enemy;
                    closestDistance = distance;
                }
            }

            return closest;
        }

        private Float2 TurretPosition =>
            new Float2(_combat.turret.x, _combat.turret.y);

        private bool IsExpiredOrOutside(BulletState bullet)
        {
            return bullet.LifeRemaining <= 0f
                || bullet.Position.X < -20f
                || bullet.Position.X > _combat.canvas.width + 20f
                || bullet.Position.Y < -20f
                || bullet.Position.Y > _combat.canvas.height + 20f;
        }
    }
}
