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
            CardCombatProfile profile = CardEffectResolver.Resolve(state);
            state.Bullets.Add(new BulletState(
                state.TakeNextBulletId(),
                muzzle,
                direction * _combat.bullet.speed,
                _combat.bullet.radius,
                _combat.bullet.life,
                _combat.defaults.damage,
                profile));
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
                    if (bullet.HitEnemyIds.Contains(enemy.Id))
                    {
                        continue;
                    }

                    if (Float2.Distance(bullet.Position, enemy.Position)
                        >= bullet.Radius + enemy.Radius)
                    {
                        continue;
                    }

                    bullet.HitEnemyIds.Add(enemy.Id);
                    Float2 hitPosition = enemy.Position;
                    DamageEnemy(state, enemy, bullet.Damage);
                    ApplyStatusEffects(enemy, bullet);
                    ApplyChainLightning(
                        state,
                        bullet,
                        hitPosition,
                        enemy.Id);

                    if (bullet.PierceRemaining > 0)
                    {
                        bullet.PierceRemaining--;
                        bullet.Damage *= bullet.PierceDamageRetention
                            * (1f + bullet.RampPerPierce);
                    }
                    else
                    {
                        consumed = true;
                    }

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
                UpdateStatuses(enemy, deltaTime);
                if (enemy.FrozenRemaining > 0f)
                {
                    continue;
                }

                if (enemy.SpawnKind == EnemySpawnKind.WaveBoss)
                {
                    StepBoss(state, enemy, deltaTime);
                    continue;
                }

                Float2 toTurret = turret - enemy.Position;
                enemy.Position += toTurret.Normalized()
                    * enemy.Speed
                    * (1f - enemy.SlowRatio)
                    * deltaTime;

                if (Float2.Distance(enemy.Position, turret) >= _combat.breakthroughDist)
                {
                    continue;
                }

                state.Enemies.RemoveAt(index);
                state.ApplyDamage(enemy.Damage);
            }
        }

        private static void DamageEnemy(
            GameState state,
            EnemyState enemy,
            float damage)
        {
            float vulnerability = enemy.VulnerableRemaining > 0f
                ? enemy.VulnerableRatio
                : 0f;
            enemy.Hp -= damage * (1f + vulnerability);
            if (enemy.Hp > 0f)
            {
                return;
            }

            if (state.Enemies.Remove(enemy))
            {
                state.Kills++;
                state.GrantReward(enemy.Reward);
            }
        }

        private static void ApplyStatusEffects(
            EnemyState enemy,
            BulletState bullet)
        {
            if (enemy.Hp <= 0f)
            {
                return;
            }

            if (bullet.SlowRatio > 0f)
            {
                enemy.SlowRatio = Math.Max(
                    enemy.SlowRatio,
                    bullet.SlowRatio);
                enemy.SlowRemaining = Math.Max(
                    enemy.SlowRemaining,
                    bullet.SlowDuration);
            }

            if (bullet.FreezeStacksToTrigger > 0)
            {
                enemy.FreezeStacks++;
                if (enemy.FreezeStacks >= bullet.FreezeStacksToTrigger)
                {
                    enemy.FreezeStacks = 0;
                    enemy.FrozenRemaining = Math.Max(
                        enemy.FrozenRemaining,
                        bullet.FreezeDuration);
                }
            }

            if (bullet.VulnerableRatio > 0f)
            {
                enemy.VulnerableRatio = Math.Max(
                    enemy.VulnerableRatio,
                    bullet.VulnerableRatio);
                enemy.VulnerableRemaining = Math.Max(
                    enemy.VulnerableRemaining,
                    bullet.VulnerableDuration);
            }
        }

        private static void ApplyChainLightning(
            GameState state,
            BulletState bullet,
            Float2 origin,
            int primaryEnemyId)
        {
            if (bullet.ChainBounces <= 0
                || bullet.ChainSearchRange <= 0f)
            {
                return;
            }

            var chainedIds = new System.Collections.Generic.HashSet<int>
            {
                primaryEnemyId
            };
            float damage = bullet.Damage;
            Float2 currentOrigin = origin;
            for (int bounce = 0; bounce < bullet.ChainBounces; bounce++)
            {
                EnemyState next = FindClosestChainTarget(
                    state,
                    currentOrigin,
                    bullet.ChainSearchRange,
                    chainedIds);
                if (next == null)
                {
                    break;
                }

                chainedIds.Add(next.Id);
                bullet.HitEnemyIds.Add(next.Id);
                currentOrigin = next.Position;
                damage *= bullet.ChainDamageRetention;
                DamageEnemy(state, next, damage);
                ApplyStatusEffects(next, bullet);
            }
        }

        private static EnemyState FindClosestChainTarget(
            GameState state,
            Float2 origin,
            float searchRange,
            System.Collections.Generic.HashSet<int> excludedIds)
        {
            EnemyState closest = null;
            float closestDistance = searchRange;
            foreach (EnemyState enemy in state.Enemies)
            {
                if (excludedIds.Contains(enemy.Id))
                {
                    continue;
                }

                float distance = Float2.Distance(origin, enemy.Position);
                if (distance <= closestDistance)
                {
                    closest = enemy;
                    closestDistance = distance;
                }
            }

            return closest;
        }

        private static void UpdateStatuses(
            EnemyState enemy,
            float deltaTime)
        {
            enemy.SlowRemaining = Math.Max(
                0f,
                enemy.SlowRemaining - deltaTime);
            if (enemy.SlowRemaining <= 0f)
            {
                enemy.SlowRatio = 0f;
            }

            enemy.FrozenRemaining = Math.Max(
                0f,
                enemy.FrozenRemaining - deltaTime);
            enemy.VulnerableRemaining = Math.Max(
                0f,
                enemy.VulnerableRemaining - deltaTime);
            if (enemy.VulnerableRemaining <= 0f)
            {
                enemy.VulnerableRatio = 0f;
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
