using System;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class CombatSystem
    {
        private readonly CombatConfig _combat;
        private readonly EnemiesConfig _enemies;

        public CombatSystem(CombatConfig combat, EnemiesConfig enemies)
        {
            _combat = combat;
            _enemies = enemies;
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
                        state.GrantReward(enemy.Reward);
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
                if (enemy.SpawnKind == EnemySpawnKind.WaveBoss)
                {
                    StepBoss(state, enemy, deltaTime);
                    continue;
                }

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

        private void StepBoss(GameState state, EnemyState boss, float deltaTime)
        {
            if (boss.BossPhase == BossPhase.Contact)
            {
                StepBossContact(state, boss, deltaTime);
                return;
            }

            BossBehaviorConfig behavior = _enemies.bossBehavior;
            Float2 turret = TurretPosition;
            Float2 toTurret = turret - boss.Position;
            float turretDistance = toTurret.Length;
            if (turretDistance <= behavior.contactDistance)
            {
                EnterBossContact(boss, turret);
                return;
            }

            Float2 direction = toTurret.Normalized();
            float orbitStart = Math.Min(
                _combat.defaults.range * behavior.orbitStartRangeRatio,
                behavior.orbitStartMaxDistance);
            float curveSpan = orbitStart - behavior.contactDistance;
            if (turretDistance <= orbitStart && curveSpan > 0f)
            {
                float progress = Math.Max(
                    0f,
                    Math.Min(1f, (turretDistance - behavior.contactDistance) / curveSpan));
                float curveWeight = (float)Math.Sin(Math.PI * progress)
                    * behavior.curveStrength;
                var tangent = new Float2(
                    -direction.Y * boss.OrbitDirection,
                    direction.X * boss.OrbitDirection);
                direction = (direction + tangent * curveWeight).Normalized();
            }

            float step = boss.Speed * _enemies.defaults.enemySpeed * deltaTime;
            if (step + 0.000001f >= turretDistance - behavior.contactDistance)
            {
                EnterBossContact(boss, turret);
                return;
            }

            boss.Position += direction * step;
        }

        private void EnterBossContact(EnemyState boss, Float2 turret)
        {
            BossBehaviorConfig behavior = _enemies.bossBehavior;
            Float2 fromTurret = boss.Position - turret;
            boss.ContactAngleRadians = fromTurret.Length > 0f
                ? (float)Math.Atan2(fromTurret.Y, fromTurret.X)
                : boss.ContactAngleRadians;
            boss.Position = turret + new Float2(
                (float)Math.Cos(boss.ContactAngleRadians),
                (float)Math.Sin(boss.ContactAngleRadians))
                * behavior.contactDistance;
            boss.BossPhase = BossPhase.Contact;
            boss.ContactTickRemaining = behavior.contactWarmup;
        }

        private void StepBossContact(GameState state, EnemyState boss, float deltaTime)
        {
            BossBehaviorConfig behavior = _enemies.bossBehavior;
            Float2 turret = TurretPosition;
            Float2 fromTurret = boss.Position - turret;
            if (fromTurret.Length > behavior.contactExitDistance)
            {
                boss.BossPhase = BossPhase.Approach;
                return;
            }

            if (fromTurret.Length > 0f)
            {
                boss.ContactAngleRadians = (float)Math.Atan2(
                    fromTurret.Y,
                    fromTurret.X);
            }

            boss.Position = turret + new Float2(
                (float)Math.Cos(boss.ContactAngleRadians),
                (float)Math.Sin(boss.ContactAngleRadians))
                * behavior.contactDistance;
            boss.ContactTickRemaining -= deltaTime;
            while (boss.ContactTickRemaining <= 0f
                && state.Mode == GameMode.Playing)
            {
                boss.ContactTickRemaining += behavior.contactTickInterval;
                state.ApplyDamage(boss.ContactDps * behavior.contactTickInterval);
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
