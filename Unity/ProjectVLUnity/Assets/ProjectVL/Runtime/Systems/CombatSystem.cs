using System;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class CombatSystem
    {
        private readonly CombatConfig _combat;
        private readonly EnemiesConfig _enemies;
        private readonly DropSystem _drops;

        public CombatSystem(
            CombatConfig combat,
            EnemiesConfig enemies,
            DropSystem drops = null)
        {
            _combat = combat;
            _enemies = enemies;
            _drops = drops;
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
            CardCombatProfile profile = CardEffectResolver.Resolve(state);
            if (profile.BeamInterval > 0f)
            {
                return;
            }

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
                _combat.defaults.damage
                    * profile.ProjectileDamageMultiplier,
                profile));
            state.ShotCooldown = 1f
                / (_combat.defaults.fireRate * state.FireRateMultiplier);
        }

        public void StepPassives(GameState state, float deltaTime)
        {
            CardCombatProfile profile = CardEffectResolver.Resolve(state);
            state.DropRateMultiplier = profile.DropRateMultiplier;
            state.DropLifetimeMultiplier = profile.DropLifetimeMultiplier;
            state.ExpiryConvertRatio = profile.ExpiryConvertRatio;
            state.XpMultiplier = profile.XpMultiplier;
            state.BeamVisualRemaining = Math.Max(
                0f,
                state.BeamVisualRemaining - deltaTime);
            if (state.Wave > 0 && state.EquipmentEffectWave != state.Wave)
            {
                InitializeWaveEffects(state, profile);
            }

            if (state.FireRateBuffRemaining > 0f)
            {
                state.FireRateBuffRemaining = Math.Max(
                    0f,
                    state.FireRateBuffRemaining - deltaTime);
                if (state.FireRateBuffRemaining <= 0f)
                {
                    state.FireRateMultiplier = 1f;
                }
            }

            if (state.ShieldMaxHits > 0
                && state.ShieldHits <= 0
                && state.ShieldRegenRemaining > 0f)
            {
                state.ShieldRegenRemaining = Math.Max(
                    0f,
                    state.ShieldRegenRemaining - deltaTime);
                if (state.ShieldRegenRemaining <= 0f)
                {
                    state.ShieldHits = state.ShieldMaxHits;
                }
            }

            state.ImpactBreachCooldownRemaining = Math.Max(
                0f,
                state.ImpactBreachCooldownRemaining - deltaTime);
            state.ImpactHitCooldownRemaining = Math.Max(
                0f,
                state.ImpactHitCooldownRemaining - deltaTime);
            if (profile.ImpactPulseInterval > 0f)
            {
                state.ImpactPulseRemaining -= deltaTime;
                if (state.ImpactPulseRemaining <= 0f)
                {
                    ApplyAreaKnockback(
                        state,
                        TurretPosition,
                        profile.ImpactPulseRadius,
                        profile.ImpactPulseKnockback,
                        profile.ImpactPulseStunDuration);
                    state.ImpactPulseRemaining =
                        profile.ImpactPulseInterval;
                }
            }

            if (profile.ThornsAuraTickInterval > 0f)
            {
                state.ThornsAuraTickRemaining -= deltaTime;
                if (state.ThornsAuraTickRemaining <= 0f)
                {
                    DamageArea(
                        state,
                        TurretPosition,
                        profile.ThornsAuraRadius,
                        _combat.defaults.damage
                            * profile.ThornsAuraDamageRatio,
                        -1,
                        0f,
                        0f);
                    ExecuteLowHealthEnemies(
                        state,
                        TurretPosition,
                        profile.ThornsAuraRadius,
                        profile.ThornsAuraExecuteThresholdRatio);
                    state.ThornsAuraTickRemaining =
                        profile.ThornsAuraTickInterval;
                }
            }

            if (profile.ScorchAuraTickInterval > 0f)
            {
                state.ScorchAuraTickRemaining -= deltaTime;
                if (state.ScorchAuraTickRemaining <= 0f)
                {
                    DamageArea(
                        state,
                        TurretPosition,
                        profile.ScorchAuraRadius,
                        _combat.defaults.damage
                            * profile.ScorchAuraDamageRatio,
                        -1,
                        0f,
                        profile.ScorchAuraSlowRatio,
                        profile.ScorchAuraSlowDuration);
                    state.ScorchAuraTickRemaining +=
                        profile.ScorchAuraTickInterval;
                }
            }

            ApplySanctumAura(state, profile);
            ApplySanctumPulse(state, profile, deltaTime);
            ApplyFrostAura(state, profile);
            ApplyBeamPulse(state, profile, deltaTime);
            ApplyChainPulse(state, profile, deltaTime);
            ApplyFrostNova(state, profile, deltaTime);
            ApplyDecoyAura(state, profile);
            ApplyMirrorTurret(state, profile, deltaTime);
            ApplyHarvestMergePulse(state, profile);
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
                    ApplyOnHitStun(state, enemy, bullet);
                    ApplyImpactAndSplitEffects(
                        state,
                        bullet,
                        hitPosition,
                        enemy.Id);
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
                    else if (TryRicochet(
                        state,
                        bullet,
                        hitPosition))
                    {
                        consumed = false;
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
            CardCombatProfile profile = CardEffectResolver.Resolve(state);
            for (int index = state.Enemies.Count - 1; index >= 0; index--)
            {
                if (index >= state.Enemies.Count)
                {
                    continue;
                }

                EnemyState enemy = state.Enemies[index];
                if (!UpdateStatuses(state, enemy, deltaTime))
                {
                    continue;
                }

                if (enemy.FrozenRemaining > 0f
                    || enemy.StunnedRemaining > 0f)
                {
                    continue;
                }

                if (enemy.SpawnKind == EnemySpawnKind.WaveBoss)
                {
                    StepBoss(state, enemy, profile, deltaTime);
                    continue;
                }

                float primaryDistance = state.DecoyActive
                    ? Float2.Distance(
                        enemy.Position,
                        state.DecoyPosition)
                    : float.MaxValue;
                float secondaryDistance = state.SecondaryDecoyActive
                    ? Float2.Distance(
                        enemy.Position,
                        state.SecondaryDecoyPosition)
                    : float.MaxValue;
                bool primaryInRange =
                    primaryDistance <= state.DecoyTauntRadius;
                bool secondaryInRange =
                    secondaryDistance <= state.DecoyTauntRadius;
                bool targetingSecondary = secondaryInRange
                    && (!primaryInRange
                        || secondaryDistance < primaryDistance);
                bool targetingDecoy =
                    primaryInRange || secondaryInRange;
                Float2 destination = targetingDecoy
                    ? targetingSecondary
                        ? state.SecondaryDecoyPosition
                        : state.DecoyPosition
                    : turret;
                Float2 toDestination = destination - enemy.Position;
                enemy.Position += toDestination.Normalized()
                    * enemy.Speed
                    * (1f - enemy.SlowRatio)
                    * deltaTime;

                if (targetingDecoy
                    && Float2.Distance(
                        enemy.Position,
                        destination) < enemy.Radius + 12f)
                {
                    state.Enemies.RemoveAt(index);
                    DamageDecoy(
                        state,
                        profile,
                        enemy.Damage,
                        targetingSecondary);
                    continue;
                }

                if (Float2.Distance(enemy.Position, turret)
                    >= _combat.breakthroughDist)
                {
                    continue;
                }

                state.Enemies.RemoveAt(index);
                HandleBreach(state, profile, enemy.Damage);
            }
        }

        private void DamageEnemy(
            GameState state,
            EnemyState enemy,
            float damage)
        {
            bool killedWhileFrozen = enemy.FrozenRemaining > 0f;
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
                _drops?.TrySpawnOnKill(state, enemy);
                state.GrantReward(enemy.Reward);
                CardCombatProfile profile =
                    CardEffectResolver.Resolve(state);
                state.AddExperience(profile.XpMultiplier);
                if (enemy.Reward != null)
                {
                    state.RestoreHp(profile.PickupRestore);
                }

                if (killedWhileFrozen
                    && profile.FrozenKillSplashRadius > 0f)
                {
                    DamageArea(
                        state,
                        enemy.Position,
                        profile.FrozenKillSplashRadius,
                        _combat.defaults.damage
                            * profile.FrozenKillSplashDamageRatio,
                        enemy.Id,
                        0f,
                        profile.FrozenKillSlowRatio,
                        profile.FrozenKillSlowDuration);
                }
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

            bool hadDot = enemy.DotRemaining > 0f
                || enemy.SecondaryDotRemaining > 0f;
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

            if (enemy.FrozenRemaining > 0f
                && bullet.FrozenHitVulnerableRatio > 0f)
            {
                enemy.VulnerableRatio = Math.Max(
                    enemy.VulnerableRatio,
                    bullet.FrozenHitVulnerableRatio);
                enemy.VulnerableRemaining = Math.Max(
                    enemy.VulnerableRemaining,
                    bullet.FrozenHitVulnerableDuration);
            }

            if (bullet.DotAreaVulnerableRatio > 0f)
            {
                enemy.VulnerableRatio = Math.Max(
                    enemy.VulnerableRatio,
                    bullet.DotAreaVulnerableRatio);
                enemy.VulnerableRemaining = Math.Max(
                    enemy.VulnerableRemaining,
                    bullet.DotAreaVulnerableDuration);
            }

            if (hadDot && bullet.DotHitVulnerableRatio > 0f)
            {
                enemy.VulnerableRatio = Math.Max(
                    enemy.VulnerableRatio,
                    bullet.DotHitVulnerableRatio);
                enemy.VulnerableRemaining = Math.Max(
                    enemy.VulnerableRemaining,
                    bullet.DotHitVulnerableDuration);
            }

            if (bullet.DotDamageRatio > 0f)
            {
                enemy.DotDamagePerTick = Math.Max(
                    enemy.DotDamagePerTick,
                    bullet.Damage * bullet.DotDamageRatio);
                enemy.DotTickInterval = bullet.DotTickInterval;
                enemy.DotTickRemaining = bullet.DotTickInterval;
                enemy.DotRemaining = Math.Max(
                    enemy.DotRemaining,
                    bullet.DotDuration);
            }

            if (bullet.SecondaryDotDamageRatio > 0f)
            {
                enemy.SecondaryDotDamagePerTick = Math.Max(
                    enemy.SecondaryDotDamagePerTick,
                    bullet.Damage * bullet.SecondaryDotDamageRatio);
                enemy.SecondaryDotTickInterval =
                    bullet.SecondaryDotTickInterval;
                enemy.SecondaryDotTickRemaining =
                    bullet.SecondaryDotTickInterval;
                enemy.SecondaryDotRemaining = Math.Max(
                    enemy.SecondaryDotRemaining,
                    bullet.SecondaryDotDuration);
            }
        }

        private void ApplyImpactAndSplitEffects(
            GameState state,
            BulletState bullet,
            Float2 hitPosition,
            int primaryEnemyId)
        {
            EnemyState primary = FindEnemyById(state, primaryEnemyId);
            if (primary != null && bullet.KnockbackDistance > 0f)
            {
                Float2 direction =
                    (primary.Position - TurretPosition).Normalized();
                primary.Position += direction * bullet.KnockbackDistance;
                ApplyKnockbackCollision(
                    state,
                    primary,
                    bullet);
            }

            if (bullet.SplashRadius > 0f
                && bullet.SplashDamageRatio > 0f)
            {
                DamageArea(
                    state,
                    hitPosition,
                    bullet.SplashRadius,
                    bullet.Damage * bullet.SplashDamageRatio,
                    primaryEnemyId,
                    0f,
                    0f,
                    0f,
                    bullet.SplashFalloff);
            }

            if (bullet.SecondarySplashRadius > 0f
                && bullet.SecondarySplashDamageRatio > 0f)
            {
                DamageArea(
                    state,
                    hitPosition,
                    bullet.SecondarySplashRadius,
                    bullet.Damage
                        * bullet.SecondarySplashDamageRatio,
                    primaryEnemyId,
                    0f,
                    0f);
            }

            ApplyDotArea(
                state,
                bullet,
                hitPosition,
                primaryEnemyId);
            if (bullet.HitAreaKnockbackRadius > 0f)
            {
                ApplyAreaKnockback(
                    state,
                    hitPosition,
                    bullet.HitAreaKnockbackRadius,
                    bullet.HitAreaKnockbackDistance,
                    0f);
            }

            if (bullet.SplitCount <= 0 || bullet.SplitDamageRatio <= 0f)
            {
                return;
            }

            var excluded = new System.Collections.Generic.HashSet<int>
            {
                primaryEnemyId
            };
            for (int i = 0; i < bullet.SplitCount; i++)
            {
                EnemyState target = FindClosestChainTarget(
                    state,
                    hitPosition,
                    140f,
                    excluded);
                if (target == null)
                {
                    break;
                }

                excluded.Add(target.Id);
                Float2 splitOrigin = target.Position;
                DamageEnemy(
                    state,
                    target,
                    bullet.Damage * bullet.SplitDamageRatio);
                ApplyRecursiveSplits(
                    state,
                    bullet,
                    splitOrigin,
                    excluded);
            }
        }

        private void ApplyRecursiveSplits(
            GameState state,
            BulletState bullet,
            Float2 origin,
            System.Collections.Generic.HashSet<int> excludedIds)
        {
            if (bullet.RecursiveSplitCount <= 0
                || bullet.RecursiveSplitDamageRatio <= 0f)
            {
                return;
            }

            for (int index = 0;
                index < bullet.RecursiveSplitCount;
                index++)
            {
                EnemyState target = FindClosestChainTarget(
                    state,
                    origin,
                    140f,
                    excludedIds);
                if (target == null)
                {
                    break;
                }

                excludedIds.Add(target.Id);
                DamageEnemy(
                    state,
                    target,
                    bullet.Damage
                        * bullet.SplitDamageRatio
                        * bullet.RecursiveSplitDamageRatio);
            }
        }

        private void ApplyDotArea(
            GameState state,
            BulletState bullet,
            Float2 center,
            int primaryEnemyId)
        {
            if (bullet.DotAreaRadius <= 0f)
            {
                return;
            }

            foreach (EnemyState enemy in state.Enemies)
            {
                if (enemy.Id == primaryEnemyId
                    || Float2.Distance(
                        center,
                        enemy.Position) > bullet.DotAreaRadius)
                {
                    continue;
                }

                if (bullet.DotDamageRatio > 0f)
                {
                    enemy.DotDamagePerTick = Math.Max(
                        enemy.DotDamagePerTick,
                        bullet.Damage * bullet.DotDamageRatio);
                    enemy.DotTickInterval = bullet.DotTickInterval;
                    enemy.DotTickRemaining = bullet.DotTickInterval;
                    enemy.DotRemaining = Math.Max(
                        enemy.DotRemaining,
                        bullet.DotDuration);
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

                if (bullet.DotAreaVulnerableRatio > 0f)
                {
                    enemy.VulnerableRatio = Math.Max(
                        enemy.VulnerableRatio,
                        bullet.DotAreaVulnerableRatio);
                    enemy.VulnerableRemaining = Math.Max(
                        enemy.VulnerableRemaining,
                        bullet.DotAreaVulnerableDuration);
                }
            }
        }

        private void ApplyKnockbackCollision(
            GameState state,
            EnemyState primary,
            BulletState bullet)
        {
            if (bullet.KnockbackCollisionDamageRatio <= 0f)
            {
                return;
            }

            EnemyState collided = null;
            float closestDistance = float.MaxValue;
            foreach (EnemyState enemy in state.Enemies)
            {
                if (enemy.Id == primary.Id)
                {
                    continue;
                }

                float distance = Float2.Distance(
                    primary.Position,
                    enemy.Position);
                if (distance <= primary.Radius + enemy.Radius
                    && distance < closestDistance)
                {
                    collided = enemy;
                    closestDistance = distance;
                }
            }

            if (collided != null)
            {
                DamageEnemy(
                    state,
                    collided,
                    bullet.Damage
                        * bullet.KnockbackCollisionDamageRatio);
            }
        }

        private static void ApplyOnHitStun(
            GameState state,
            EnemyState enemy,
            BulletState bullet)
        {
            if (enemy.Hp <= 0f
                || bullet.OnHitStunDuration <= 0f
                || state.ImpactHitCooldownRemaining > 0f)
            {
                return;
            }

            enemy.StunnedRemaining = Math.Max(
                enemy.StunnedRemaining,
                bullet.OnHitStunDuration);
            state.ImpactHitCooldownRemaining =
                bullet.OnHitStunCooldown;
        }

        private static EnemyState FindEnemyById(
            GameState state,
            int enemyId)
        {
            foreach (EnemyState enemy in state.Enemies)
            {
                if (enemy.Id == enemyId)
                {
                    return enemy;
                }
            }

            return null;
        }

        private void ApplyChainLightning(
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
                bool killedByChain = !state.Enemies.Contains(next);
                ApplyStatusEffects(next, bullet);
                if (killedByChain)
                {
                    ApplyChainKillArc(
                        state,
                        bullet,
                        currentOrigin,
                        new System.Collections.Generic.HashSet<int>(
                            chainedIds));
                }
            }
        }

        private void ApplyChainKillArc(
            GameState state,
            BulletState bullet,
            Float2 origin,
            System.Collections.Generic.HashSet<int> excludedIds)
        {
            if (bullet.ChainKillBounces <= 0
                || bullet.ChainKillSearchRange <= 0f)
            {
                return;
            }

            float damage = bullet.Damage;
            Float2 currentOrigin = origin;
            for (int bounce = 0;
                bounce < bullet.ChainKillBounces;
                bounce++)
            {
                EnemyState target = FindClosestChainTarget(
                    state,
                    currentOrigin,
                    bullet.ChainKillSearchRange,
                    excludedIds);
                if (target == null)
                {
                    break;
                }

                excludedIds.Add(target.Id);
                bullet.HitEnemyIds.Add(target.Id);
                currentOrigin = target.Position;
                damage *= bullet.ChainKillDamageRetention;
                DamageEnemy(state, target, damage);
            }
        }

        private bool TryRicochet(
            GameState state,
            BulletState bullet,
            Float2 origin)
        {
            if (bullet.RicochetRemaining <= 0)
            {
                return false;
            }

            EnemyState target = FindClosestChainTarget(
                state,
                origin,
                140f,
                bullet.HitEnemyIds);
            if (target == null)
            {
                return false;
            }

            float speed = bullet.Velocity.Length;
            if (speed <= 0.000001f)
            {
                speed = _combat.bullet.speed;
            }

            bullet.Velocity =
                (target.Position - origin).Normalized() * speed;
            bullet.RicochetRemaining--;
            return true;
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

        private bool UpdateStatuses(
            GameState state,
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
            enemy.StunnedRemaining = Math.Max(
                0f,
                enemy.StunnedRemaining - deltaTime);
            enemy.VulnerableRemaining = Math.Max(
                0f,
                enemy.VulnerableRemaining - deltaTime);
            if (enemy.VulnerableRemaining <= 0f)
            {
                enemy.VulnerableRatio = 0f;
            }

            if (enemy.DotRemaining > 0f)
            {
                enemy.DotRemaining = Math.Max(
                    0f,
                    enemy.DotRemaining - deltaTime);
                enemy.DotTickRemaining -= deltaTime;
                while (enemy.DotTickRemaining <= 0f
                    && enemy.DotRemaining > 0f
                    && enemy.Hp > 0f)
                {
                    enemy.DotTickRemaining += Math.Max(
                        0.01f,
                        enemy.DotTickInterval);
                    DamageEnemy(state, enemy, enemy.DotDamagePerTick);
                }
            }

            if (enemy.SecondaryDotRemaining > 0f)
            {
                enemy.SecondaryDotRemaining = Math.Max(
                    0f,
                    enemy.SecondaryDotRemaining - deltaTime);
                enemy.SecondaryDotTickRemaining -= deltaTime;
                while (enemy.SecondaryDotTickRemaining <= 0f
                    && enemy.SecondaryDotRemaining > 0f
                    && enemy.Hp > 0f)
                {
                    enemy.SecondaryDotTickRemaining += Math.Max(
                        0.01f,
                        enemy.SecondaryDotTickInterval);
                    DamageEnemy(
                        state,
                        enemy,
                        enemy.SecondaryDotDamagePerTick);
                }
            }

            return state.Enemies.Contains(enemy);
        }

        private void InitializeWaveEffects(
            GameState state,
            CardCombatProfile profile)
        {
            state.EquipmentEffectWave = state.Wave;
            state.ShieldMaxHits = profile.ShieldHits;
            state.ShieldHits = profile.ShieldHits;
            state.ShieldRegenRemaining = 0f;
            state.FireRateMultiplier =
                profile.WaveStartFireRateMultiplier;
            state.FireRateBuffRemaining =
                profile.WaveStartFireRateDuration;
            state.ImpactBreachCooldownRemaining = 0f;
            state.ImpactHitCooldownRemaining = 0f;
            state.ImpactPulseRemaining =
                profile.ImpactPulseInterval;
            state.ThornsAuraTickRemaining =
                profile.ThornsAuraTickInterval;
            state.BeamPulseRemaining = profile.BeamInterval;
            state.ChainPulseRemaining =
                profile.ChainPulseInterval;
            state.FrostNovaRemaining =
                profile.FrostNovaInterval;
            state.ScorchAuraTickRemaining =
                profile.ScorchAuraTickInterval;
            state.SanctumPulseRemaining =
                profile.SanctumPulseInterval;
            state.BeamVisualRemaining = 0f;

            state.DecoyActive = profile.DecoyHp > 0f;
            state.DecoyMaxHp = profile.DecoyHp;
            state.DecoyHp = profile.DecoyHp;
            state.DecoyTauntRadius = profile.DecoyTauntRadius;
            state.DecoyExplodeDamageMultiplier =
                profile.DecoyExplodeDamageMultiplier;
            state.DecoyExplodeKnockback =
                profile.DecoyExplodeKnockback;
            state.DecoyRespawnsRemaining =
                profile.DecoyRespawns;
            state.DecoyIsMirrorTurret =
                profile.DecoyMirrorTurret;
            state.DecoyFireCooldown = 0f;
            state.DecoyPosition = TurretPosition
                + new Float2(profile.DecoyDistance, 0f);
            state.SecondaryDecoyActive =
                profile.DecoyHp > 0f && profile.DecoyCount > 1;
            state.SecondaryDecoyHp = profile.DecoyHp;
            state.SecondaryDecoyPosition = TurretPosition
                + new Float2(profile.SecondaryDecoyDistance, 0f);

            for (int index = 0;
                index < profile.HarvestWaveStartDrops;
                index++)
            {
                float offset = (
                    index
                    - (profile.HarvestWaveStartDrops - 1) / 2f)
                    * 36f;
                _drops?.SpawnTestDrop(
                    state,
                    TurretPosition + new Float2(offset, -55f));
            }
        }

        private void ApplySanctumAura(
            GameState state,
            CardCombatProfile profile)
        {
            if (profile.AuraRadiusRatio <= 0f)
            {
                return;
            }

            float radius =
                _combat.defaults.range * profile.AuraRadiusRatio;
            foreach (EnemyState enemy in state.Enemies)
            {
                if (Float2.Distance(TurretPosition, enemy.Position) > radius)
                {
                    continue;
                }

                enemy.SlowRatio = Math.Max(
                    enemy.SlowRatio,
                    profile.AuraSlowRatio);
                enemy.SlowRemaining = Math.Max(
                    enemy.SlowRemaining,
                    0.6f);
                enemy.VulnerableRatio = Math.Max(
                    enemy.VulnerableRatio,
                    profile.AuraVulnerableRatio);
                enemy.VulnerableRemaining = Math.Max(
                    enemy.VulnerableRemaining,
                    0.6f);
            }
        }

        private void ApplySanctumPulse(
            GameState state,
            CardCombatProfile profile,
            float deltaTime)
        {
            if (profile.SanctumPulseInterval <= 0f)
            {
                return;
            }

            state.SanctumPulseRemaining -= deltaTime;
            if (state.SanctumPulseRemaining > 0f)
            {
                return;
            }

            foreach (EnemyState enemy in state.Enemies)
            {
                if (Float2.Distance(
                    TurretPosition,
                    enemy.Position) > profile.SanctumPulseRadius)
                {
                    continue;
                }

                enemy.VulnerableRatio = Math.Max(
                    enemy.VulnerableRatio,
                    profile.SanctumPulseVulnerableRatio);
                enemy.VulnerableRemaining = Math.Max(
                    enemy.VulnerableRemaining,
                    profile.SanctumPulseVulnerableDuration);
            }

            state.SanctumPulseRemaining +=
                profile.SanctumPulseInterval;
        }

        private void ExecuteLowHealthEnemies(
            GameState state,
            Float2 center,
            float radius,
            float thresholdRatio)
        {
            if (thresholdRatio <= 0f)
            {
                return;
            }

            var targets =
                new System.Collections.Generic.List<EnemyState>();
            foreach (EnemyState enemy in state.Enemies)
            {
                if (Float2.Distance(center, enemy.Position) <= radius
                    && enemy.Hp / enemy.MaxHp <= thresholdRatio)
                {
                    targets.Add(enemy);
                }
            }

            foreach (EnemyState enemy in targets)
            {
                DamageEnemy(state, enemy, enemy.Hp);
            }
        }

        private void ApplyFrostAura(
            GameState state,
            CardCombatProfile profile)
        {
            if (profile.FrostAuraRadiusRatio <= 0f)
            {
                return;
            }

            float radius =
                _combat.defaults.range
                * profile.FrostAuraRadiusRatio;
            foreach (EnemyState enemy in state.Enemies)
            {
                if (Float2.Distance(
                    TurretPosition,
                    enemy.Position) > radius)
                {
                    continue;
                }

                enemy.SlowRatio = Math.Max(
                    enemy.SlowRatio,
                    profile.FrostAuraSlowRatio);
                enemy.SlowRemaining = Math.Max(
                    enemy.SlowRemaining,
                    profile.FrostAuraSlowDuration);
            }
        }

        private void ApplyBeamPulse(
            GameState state,
            CardCombatProfile profile,
            float deltaTime)
        {
            if (profile.BeamInterval <= 0f)
            {
                return;
            }

            state.BeamPulseRemaining -= deltaTime;
            if (state.BeamPulseRemaining > 0f)
            {
                return;
            }

            EnemyState target = FindTarget(state);
            if (target == null)
            {
                return;
            }

            Float2 direction =
                (target.Position - TurretPosition).Normalized();
            state.TurretAngleRadians = (float)Math.Atan2(
                direction.Y,
                direction.X);
            Float2 beamEnd = TurretPosition
                + direction * _combat.defaults.range;
            float damage = _combat.defaults.damage
                * _combat.defaults.fireRate
                * profile.BeamInterval
                * profile.BeamDamageRatio;
            var targets =
                new System.Collections.Generic.List<EnemyState>();
            foreach (EnemyState enemy in state.Enemies)
            {
                Float2 relative =
                    enemy.Position - TurretPosition;
                float along = relative.X * direction.X
                    + relative.Y * direction.Y;
                float perpendicular = Math.Abs(
                    relative.X * direction.Y
                    - relative.Y * direction.X);
                if (along >= 0f
                    && along <= _combat.defaults.range
                    && perpendicular
                        <= profile.BeamWidth / 2f
                            + enemy.Radius)
                {
                    targets.Add(enemy);
                }
            }

            foreach (EnemyState enemy in targets)
            {
                DamageEnemy(state, enemy, damage);
            }

            state.BeamVisualStart = TurretPosition;
            state.BeamVisualEnd = beamEnd;
            state.BeamVisualWidth = profile.BeamWidth;
            state.BeamVisualRemaining = 0.14f;
            state.BeamPulseRemaining +=
                profile.BeamInterval;
        }

        private void ApplyChainPulse(
            GameState state,
            CardCombatProfile profile,
            float deltaTime)
        {
            if (profile.ChainPulseInterval <= 0f)
            {
                return;
            }

            state.ChainPulseRemaining -= deltaTime;
            if (state.ChainPulseRemaining > 0f)
            {
                return;
            }

            var pickedStarts =
                new System.Collections.Generic.HashSet<int>();
            for (int startIndex = 0;
                startIndex < profile.ChainPulseTargets;
                startIndex++)
            {
                EnemyState start = FindClosestChainTarget(
                    state,
                    TurretPosition,
                    _combat.defaults.range,
                    pickedStarts);
                if (start == null)
                {
                    break;
                }

                pickedStarts.Add(start.Id);
                Float2 currentOrigin = start.Position;
                float damage = _combat.defaults.damage;
                var visited =
                    new System.Collections.Generic.HashSet<int>
                    {
                        start.Id
                    };
                DamageEnemy(state, start, damage);
                for (int bounce = 0;
                    bounce < profile.ChainPulseBounces;
                    bounce++)
                {
                    EnemyState next = FindClosestChainTarget(
                        state,
                        currentOrigin,
                        profile.ChainPulseSearchRange,
                        visited);
                    if (next == null)
                    {
                        break;
                    }

                    visited.Add(next.Id);
                    currentOrigin = next.Position;
                    damage *=
                        profile.ChainPulseDamageRetention;
                    DamageEnemy(state, next, damage);
                }
            }

            state.ChainPulseRemaining +=
                profile.ChainPulseInterval;
        }

        private void ApplyFrostNova(
            GameState state,
            CardCombatProfile profile,
            float deltaTime)
        {
            if (profile.FrostNovaInterval <= 0f)
            {
                return;
            }

            state.FrostNovaRemaining -= deltaTime;
            if (state.FrostNovaRemaining > 0f)
            {
                return;
            }

            foreach (EnemyState enemy in state.Enemies)
            {
                if (Float2.Distance(
                    TurretPosition,
                    enemy.Position) <= profile.FrostNovaRadius)
                {
                    enemy.FrozenRemaining = Math.Max(
                        enemy.FrozenRemaining,
                        profile.FrostNovaDuration);
                }
            }

            state.FrostNovaRemaining +=
                profile.FrostNovaInterval;
        }

        private void HandleBreach(
            GameState state,
            CardCombatProfile profile,
            float incomingDamage)
        {
            if (state.ShieldHits > 0)
            {
                state.ShieldHits--;
                if (state.ShieldHits <= 0)
                {
                    state.ShieldRegenRemaining =
                        profile.ShieldRegenSeconds;
                    if (profile.ShieldBreakDamage > 0f)
                    {
                        DamageArea(
                            state,
                            TurretPosition,
                            120f,
                            profile.ShieldBreakDamage,
                            -1,
                            profile.ShieldBreakKnockback,
                            0f);
                    }
                }

                return;
            }

            state.ApplyDamage(
                incomingDamage
                * (1f - profile.BreachReductionRatio));
            ApplyBreachReaction(state, profile);
            ApplyImpactBreachReaction(state, profile);
            ApplyThornsAdvancedBreachEffects(state, profile);
        }

        private void ApplyThornsAdvancedBreachEffects(
            GameState state,
            CardCombatProfile profile)
        {
            if (profile.BreachVulnerableRadius > 0f)
            {
                foreach (EnemyState enemy in state.Enemies)
                {
                    if (Float2.Distance(
                        TurretPosition,
                        enemy.Position) > profile.BreachVulnerableRadius)
                    {
                        continue;
                    }

                    enemy.VulnerableRatio = Math.Max(
                        enemy.VulnerableRatio,
                        profile.BreachVulnerableRatio);
                    enemy.VulnerableRemaining = Math.Max(
                        enemy.VulnerableRemaining,
                        profile.BreachVulnerableDuration);
                }
            }

            if (profile.BreachExecuteRadius <= 0f)
            {
                return;
            }

            var executions =
                new System.Collections.Generic.List<EnemyState>();
            foreach (EnemyState enemy in state.Enemies)
            {
                if (Float2.Distance(
                    TurretPosition,
                    enemy.Position) <= profile.BreachExecuteRadius
                    && enemy.Hp / enemy.MaxHp
                        <= profile.BreachExecuteThresholdRatio)
                {
                    executions.Add(enemy);
                }
            }

            foreach (EnemyState enemy in executions)
            {
                DamageEnemy(state, enemy, enemy.Hp);
            }
        }

        private void ApplyImpactBreachReaction(
            GameState state,
            CardCombatProfile profile)
        {
            if (profile.ImpactBreachRadius <= 0f
                || state.ImpactBreachCooldownRemaining > 0f)
            {
                return;
            }

            ApplyAreaKnockback(
                state,
                TurretPosition,
                profile.ImpactBreachRadius,
                profile.ImpactBreachKnockback,
                profile.ImpactBreachStunDuration);
            state.ImpactBreachCooldownRemaining =
                profile.ImpactBreachCooldown;
        }

        private void ApplyBreachReaction(
            GameState state,
            CardCombatProfile profile)
        {
            if (profile.BreachBurstRadius <= 0f)
            {
                return;
            }

            float damage = _combat.defaults.damage
                * profile.BreachBurstDamageMultiplier;
            DamageArea(
                state,
                TurretPosition,
                profile.BreachBurstRadius,
                damage,
                -1,
                profile.BreachKnockback,
                profile.BreachSlowRatio);
            if (profile.BreachSlowRatio > 0f)
            {
                foreach (EnemyState enemy in state.Enemies)
                {
                    if (Float2.Distance(
                        TurretPosition,
                        enemy.Position) <= profile.BreachBurstRadius)
                    {
                        enemy.SlowRemaining = Math.Max(
                            enemy.SlowRemaining,
                            profile.BreachSlowDuration);
                    }
                }
            }
        }

        private void DamageDecoy(
            GameState state,
            CardCombatProfile profile,
            float damage,
            bool secondary)
        {
            float remainingHp = (secondary
                    ? state.SecondaryDecoyHp
                    : state.DecoyHp)
                - Math.Max(0f, damage);
            if (secondary)
            {
                state.SecondaryDecoyHp = remainingHp;
            }
            else
            {
                state.DecoyHp = remainingHp;
            }

            if (remainingHp > 0f)
            {
                return;
            }

            Float2 destroyedPosition = secondary
                ? state.SecondaryDecoyPosition
                : state.DecoyPosition;
            if (secondary)
            {
                state.SecondaryDecoyActive = false;
            }
            else
            {
                state.DecoyActive = false;
            }

            if (state.DecoyExplodeDamageMultiplier > 0f)
            {
                DamageArea(
                    state,
                    destroyedPosition,
                    state.DecoyTauntRadius,
                    _combat.defaults.damage
                        * state.DecoyExplodeDamageMultiplier,
                    -1,
                    state.DecoyExplodeKnockback,
                    0f);
            }

            if (!secondary && state.DecoyRespawnsRemaining > 0)
            {
                state.DecoyRespawnsRemaining--;
                state.DecoyActive = true;
                state.DecoyHp = state.DecoyMaxHp;
                state.DecoyPosition = TurretPosition
                    - new Float2(profile.DecoyDistance, 0f);
            }
        }

        private void ApplyDecoyAura(
            GameState state,
            CardCombatProfile profile)
        {
            if (profile.DecoyAuraRadius <= 0f)
            {
                return;
            }

            foreach (EnemyState enemy in state.Enemies)
            {
                bool insidePrimary = state.DecoyActive
                    && Float2.Distance(
                        enemy.Position,
                        state.DecoyPosition) <= profile.DecoyAuraRadius;
                bool insideSecondary = state.SecondaryDecoyActive
                    && Float2.Distance(
                        enemy.Position,
                        state.SecondaryDecoyPosition) <= profile.DecoyAuraRadius;
                if (!insidePrimary && !insideSecondary)
                {
                    continue;
                }

                enemy.SlowRatio = Math.Max(
                    enemy.SlowRatio,
                    profile.DecoyAuraSlowRatio);
                enemy.SlowRemaining = Math.Max(
                    enemy.SlowRemaining,
                    profile.DecoyAuraSlowDuration);
            }
        }

        private void ApplyMirrorTurret(
            GameState state,
            CardCombatProfile profile,
            float deltaTime)
        {
            if (!state.DecoyActive
                || !profile.DecoyMirrorTurret
                || profile.DecoyFireInterval <= 0f)
            {
                return;
            }

            state.DecoyFireCooldown -= deltaTime;
            if (state.DecoyFireCooldown > 0f)
            {
                return;
            }

            EnemyState target = FindClosestChainTarget(
                state,
                state.DecoyPosition,
                _combat.defaults.range
                    * profile.DecoyFireRangeRatio,
                new System.Collections.Generic.HashSet<int>());
            if (target == null)
            {
                return;
            }

            Float2 direction =
                (target.Position - state.DecoyPosition).Normalized();
            state.Bullets.Add(new BulletState(
                state.TakeNextBulletId(),
                state.DecoyPosition,
                direction * _combat.bullet.speed,
                _combat.bullet.radius,
                _combat.bullet.life,
                _combat.defaults.damage
                    * profile.DecoyDamageRatio));
            state.DecoyFireCooldown +=
                profile.DecoyFireInterval;
        }

        private void ApplyHarvestMergePulse(
            GameState state,
            CardCombatProfile profile)
        {
            int pendingMergeStars =
                state.MergeResultStarTotal
                - state.HarvestProcessedMergeStars;
            if (profile.MergePulseDamagePerStar > 0f
                && pendingMergeStars > 0)
            {
                DamageArea(
                    state,
                    TurretPosition,
                    float.MaxValue,
                    profile.MergePulseDamagePerStar
                        * pendingMergeStars,
                    -1,
                    0f,
                    0f);
            }

            state.HarvestProcessedMergeStars =
                state.MergeResultStarTotal;
        }

        private void DamageArea(
            GameState state,
            Float2 center,
            float radius,
            float damage,
            int excludedEnemyId,
            float knockback,
            float slowRatio,
            float slowDuration = 0f,
            float falloff = 0f)
        {
            var targets = new System.Collections.Generic.List<EnemyState>();
            foreach (EnemyState enemy in state.Enemies)
            {
                if (enemy.Id != excludedEnemyId
                    && Float2.Distance(center, enemy.Position) <= radius)
                {
                    targets.Add(enemy);
                }
            }

            foreach (EnemyState enemy in targets)
            {
                float distance =
                    Float2.Distance(center, enemy.Position);
                float damageMultiplier = radius > 0f
                    ? 1f - falloff
                        * Math.Min(1f, distance / radius)
                    : 1f;
                DamageEnemy(
                    state,
                    enemy,
                    damage * damageMultiplier);
                if (!state.Enemies.Contains(enemy))
                {
                    continue;
                }

                if (knockback > 0f)
                {
                    enemy.Position +=
                        (enemy.Position - center).Normalized() * knockback;
                }

                if (slowRatio > 0f)
                {
                    enemy.SlowRatio = Math.Max(
                        enemy.SlowRatio,
                        slowRatio);
                    enemy.SlowRemaining = Math.Max(
                        enemy.SlowRemaining,
                        slowDuration);
                }
            }
        }

        private static void ApplyAreaKnockback(
            GameState state,
            Float2 center,
            float radius,
            float distance,
            float stunDuration)
        {
            foreach (EnemyState enemy in state.Enemies)
            {
                if (Float2.Distance(center, enemy.Position) > radius)
                {
                    continue;
                }

                Float2 direction =
                    (enemy.Position - center).Normalized();
                enemy.Position += direction * distance;
                enemy.StunnedRemaining = Math.Max(
                    enemy.StunnedRemaining,
                    stunDuration);
            }
        }

        private void StepBoss(
            GameState state,
            EnemyState boss,
            CardCombatProfile profile,
            float deltaTime)
        {
            if (boss.BossPhase == BossPhase.Contact)
            {
                StepBossContact(state, boss, profile, deltaTime);
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

        private void StepBossContact(
            GameState state,
            EnemyState boss,
            CardCombatProfile profile,
            float deltaTime)
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
                float damage =
                    boss.ContactDps * behavior.contactTickInterval;
                HandleBreach(state, profile, damage);
                if (profile.ThornsRatio > 0f)
                {
                    DamageEnemy(
                        state,
                        boss,
                        damage * profile.ThornsRatio);
                    if (!state.Enemies.Contains(boss))
                    {
                        break;
                    }
                }
            }
        }

        public EnemyState FindTarget(GameState state)
        {
            Float2 turret = TurretPosition;
            EnemyState closest = null;
            float closestScore = float.MaxValue;
            CardCombatProfile profile =
                CardEffectResolver.Resolve(state);
            float auraRadius =
                _combat.defaults.range * profile.AuraRadiusRatio;

            foreach (EnemyState enemy in state.Enemies)
            {
                float distance = Float2.Distance(turret, enemy.Position);
                float priority = 1f;
                if (profile.AuraFocusPriorityWeight > 1f
                    && distance <= auraRadius
                    && enemy.Hp / enemy.MaxHp
                        <= profile.AuraFocusHpThresholdRatio)
                {
                    priority = profile.AuraFocusPriorityWeight;
                }

                float score = distance / priority;
                if (distance <= _combat.defaults.range
                    && score < closestScore)
                {
                    closest = enemy;
                    closestScore = score;
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
