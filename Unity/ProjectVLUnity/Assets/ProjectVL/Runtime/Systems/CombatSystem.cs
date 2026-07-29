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
        private readonly ProgressionSystem _progression;
        private readonly BountySystem _bounties;

        public CombatSystem(
            CombatConfig combat,
            EnemiesConfig enemies,
            DropSystem drops = null,
            ProgressionSystem progression = null,
            BountySystem bounties = null)
        {
            _combat = combat;
            _enemies = enemies;
            _drops = drops;
            _progression = progression;
            _bounties = bounties;
        }

        public bool CastConsumable(
            GameState state,
            CardState card,
            Float2 point)
        {
            if (state == null || card == null || card.Provisional)
            {
                return false;
            }

            switch (card.Type)
            {
                case "pierce":
                    CastPierce(state, card.Star, point);
                    return true;
                case "chainLightning":
                    return CastChainLightning(
                        state,
                        card.Star,
                        point);
                case "frost":
                    CastFrost(state, card.Star, point);
                    return true;
                case "scorch":
                    CastScorch(state, card.Star, point);
                    return true;
                case "splitBlast":
                    CastSplitBlast(state, card.Star, point);
                    return true;
                case "impact":
                    CastImpact(state, card.Star, point);
                    return true;
                case "sanctum":
                    CastSanctum(state, card.Star, point);
                    return true;
                case "aegis":
                    CastAegis(state, card.Star, point);
                    return true;
                case "thorns":
                    CastThorns(state, card.Star, point);
                    return true;
                case "decoy":
                    CastDecoy(state, card.Star, point);
                    return true;
                case "harvest":
                    CastHarvest(state, card.Star, point);
                    return true;
                case "frozenThunder":
                    return CastFrozenThunder(state, point);
                case "solarLance":
                    CastSolarLance(state, point);
                    return true;
                case "avalanche":
                    CastAvalanche(state, point);
                    return true;
                case "pyrestorm":
                    CastPyrestorm(state, point);
                    return true;
                case "crownOfThorns":
                    CastCrownOfThorns(state, point);
                    return true;
                case "goldenIdol":
                    CastGoldenIdol(state, point);
                    return true;
                case "staticSurge":
                    CastStaticSurge(state, card.Star, point);
                    return true;
                case "stormcall":
                    CastStormcall(state, card.Star, point);
                    return true;
                case "arcSplitter":
                    CastArcSplitter(state, card.Star, point);
                    return true;
                case "galvanicWard":
                    CastGalvanicWard(state, card.Star, point);
                    return true;
                case "overcharge":
                    CastOvercharge(state, card.Star);
                    return true;
                case "glacialSpike":
                    CastGlacialSpike(state, card.Star, point);
                    return true;
                case "permafrost":
                    CastPermafrost(state, card.Star, point);
                    return true;
                case "iceTomb":
                    CastIceTomb(state, card.Star, point);
                    return true;
                case "frozenBulwark":
                    CastFrozenBulwark(state, card.Star, point);
                    return true;
                case "hoarfrostTithe":
                    CastHoarfrostTithe(state, card.Star);
                    return true;
                case "meteor":
                    CastMeteor(state, card.Star, point);
                    return true;
                case "magmaPool":
                    CastMagmaPool(state, card.Star, point);
                    return true;
                case "flashfire":
                    CastFlashfire(state, card.Star, point);
                    return true;
                case "cinderheart":
                    CastCinderheart(state, card.Star, point);
                    return true;
                case "ashHarvest":
                    CastAshHarvest(state, card.Star);
                    return true;
                case "sentinel":
                    CastSentinel(state, card.Star, point);
                    return true;
                case "retribution":
                    CastRetribution(state, card.Star, point);
                    return true;
                case "ironvine":
                    CastIronvine(state, card.Star);
                    return true;
                case "fateLoom":
                    CastFateLoom(state, card.Star, point);
                    return true;
                case "goldenVolley":
                    CastGoldenVolley(state, card.Star, point);
                    return true;
                case "bountyCall":
                    CastBountyCall(state, card.Star, point);
                    return true;
                case "overgrowth":
                    CastOvergrowth(state, card.Star, point);
                    return true;
                case "springOfLife":
                    CastSpringOfLife(state, card.Star);
                    return true;
                case "luckyStar":
                    CastLuckyStar(state, card.Star);
                    return true;
                default:
                    return false;
            }
        }

        public static bool SupportsConsumable(CardState card)
        {
            return card != null
                && (card.Type == "pierce"
                    || card.Type == "chainLightning"
                    || card.Type == "frost"
                    || card.Type == "scorch"
                    || card.Type == "splitBlast"
                    || card.Type == "impact"
                    || card.Type == "sanctum"
                    || card.Type == "aegis"
                    || card.Type == "thorns"
                    || card.Type == "decoy"
                    || card.Type == "harvest"
                    || card.Type == "frozenThunder"
                    || card.Type == "solarLance"
                    || card.Type == "avalanche"
                    || card.Type == "pyrestorm"
                    || card.Type == "crownOfThorns"
                    || card.Type == "goldenIdol"
                    || card.Type == "staticSurge"
                    || card.Type == "stormcall"
                    || card.Type == "arcSplitter"
                    || card.Type == "galvanicWard"
                    || card.Type == "overcharge"
                    || card.Type == "glacialSpike"
                    || card.Type == "permafrost"
                    || card.Type == "iceTomb"
                    || card.Type == "frozenBulwark"
                    || card.Type == "hoarfrostTithe"
                    || card.Type == "meteor"
                    || card.Type == "magmaPool"
                    || card.Type == "flashfire"
                    || card.Type == "cinderheart"
                    || card.Type == "ashHarvest"
                    || card.Type == "sentinel"
                    || card.Type == "retribution"
                    || card.Type == "ironvine"
                    || card.Type == "fateLoom"
                    || card.Type == "goldenVolley"
                    || card.Type == "bountyCall"
                    || card.Type == "overgrowth"
                    || card.Type == "springOfLife"
                    || card.Type == "luckyStar");
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
                BaseDamage(state)
                    * profile.ProjectileDamageMultiplier,
                profile));
            state.ShotCooldown = 1f
                / (BaseFireRate(state) * state.FireRateMultiplier);
        }

        private void CastPierce(
            GameState state,
            int star,
            Float2 point)
        {
            float width = StarValue(star, 10f, 16f, 24f);
            float damageMultiplier =
                StarValue(star, 3f, 5f, 8f)
                * RelicMultiplier(state, "pierce", "effectDamageMul");
            float knockback =
                star >= 6 ? 40f : 0f;
            Float2 direction =
                (point - TurretPosition).Normalized();
            if (direction.Length <= 0.000001f)
            {
                direction = new Float2(1f, 0f);
            }

            var targets =
                new System.Collections.Generic.List<EnemyState>();
            foreach (EnemyState enemy in state.Enemies)
            {
                Float2 relative = enemy.Position - TurretPosition;
                float along = relative.X * direction.X
                    + relative.Y * direction.Y;
                float perpendicular = Math.Abs(
                    relative.X * direction.Y
                    - relative.Y * direction.X);
                if (along >= 0f
                    && along <= AttackRange(state)
                    && perpendicular <= width / 2f + enemy.Radius)
                {
                    targets.Add(enemy);
                }
            }

            foreach (EnemyState enemy in targets)
            {
                DamageEnemy(
                    state,
                    enemy,
                    BaseDamage(state) * damageMultiplier);
                if (knockback > 0f && state.Enemies.Contains(enemy))
                {
                    enemy.Position += direction * knockback;
                }
            }

            state.BeamVisualStart = TurretPosition;
            state.BeamVisualEnd = TurretPosition
                + direction * AttackRange(state);
            state.BeamVisualWidth = width;
            state.BeamVisualRemaining = 0.2f;
        }

        private bool CastChainLightning(
            GameState state,
            int star,
            Float2 point)
        {
            float radius = StarValue(star, 120f, 140f, 160f);
            EnemyState first = null;
            float closest = radius;
            foreach (EnemyState enemy in state.Enemies)
            {
                float distance = Float2.Distance(point, enemy.Position);
                if (distance <= closest)
                {
                    closest = distance;
                    first = enemy;
                }
            }

            if (first == null)
            {
                return false;
            }

            int bounces = (int)Math.Round(
                StarValue(star, 4f, 7f, 12f))
                + RelicQuantity(state, "chainLightning");
            float retention =
                Math.Min(
                    1f,
                    StarValue(star, 0.8f, 0.8f, 0.85f)
                    * RelicMultiplier(
                        state,
                        "chainLightning",
                        "effectDamageMul"));
            float searchRange =
                StarValue(star, 140f, 140f, 160f);
            float slowRatio =
                (star >= 3 && star < 6 ? 0.25f : 0f)
                * RelicMultiplier(
                    state,
                    "chainLightning",
                    "controlPotencyMul");
            float slowDuration =
                (star >= 3 && star < 6 ? 1.5f : 0f)
                * RelicMultiplier(
                    state,
                    "chainLightning",
                    "controlPotencyMul");
            float stunDuration = (star >= 6 ? 0.5f : 0f)
                * RelicMultiplier(
                    state,
                    "chainLightning",
                    "controlPotencyMul");
            float damage = BaseDamage(state);
            Float2 origin = first.Position;
            var visited =
                new System.Collections.Generic.HashSet<int>();
            EnemyState target = first;
            for (int hit = 0;
                hit <= bounces && target != null;
                hit++)
            {
                visited.Add(target.Id);
                Float2 nextOrigin = target.Position;
                DamageEnemy(state, target, damage);
                if (state.Enemies.Contains(target))
                {
                    target.SlowRatio = Math.Max(
                        target.SlowRatio,
                        slowRatio);
                    target.SlowRemaining = Math.Max(
                        target.SlowRemaining,
                        slowDuration);
                    target.StunnedRemaining = Math.Max(
                        target.StunnedRemaining,
                        stunDuration);
                }

                origin = nextOrigin;
                damage *= retention;
                target = FindClosestChainTarget(
                    state,
                    origin,
                    searchRange,
                    visited);
            }

            return true;
        }

        private void CastFrost(
            GameState state,
            int star,
            Float2 point)
        {
            float radius = StarValue(star, 90f, 130f, 170f)
                * RelicMultiplier(state, "frost", "areaScaleMul");
            float freezeDuration =
                StarValue(star, 3f, 3f, 3.5f)
                * RelicMultiplier(
                    state,
                    "frost",
                    "controlPotencyMul");
            float slowRatio =
                (star >= 3 && star < 6 ? 0.4f : 0f)
                * RelicMultiplier(
                    state,
                    "frost",
                    "controlPotencyMul");
            float slowDuration =
                (star >= 3 && star < 6 ? 2f : 0f)
                * RelicMultiplier(
                    state,
                    "frost",
                    "controlPotencyMul");
            float vulnerableRatio = (star >= 6 ? 0.3f : 0f)
                * RelicMultiplier(
                    state,
                    "frost",
                    "controlPotencyMul");
            foreach (EnemyState enemy in state.Enemies)
            {
                if (Float2.Distance(point, enemy.Position) > radius)
                {
                    continue;
                }

                enemy.FrozenRemaining = Math.Max(
                    enemy.FrozenRemaining,
                    freezeDuration);
                enemy.SlowRatio = Math.Max(
                    enemy.SlowRatio,
                    slowRatio);
                enemy.SlowRemaining = Math.Max(
                    enemy.SlowRemaining,
                    slowDuration);
                enemy.VulnerableRatio = Math.Max(
                    enemy.VulnerableRatio,
                    vulnerableRatio);
                enemy.VulnerableRemaining = Math.Max(
                    enemy.VulnerableRemaining,
                    star >= 6 ? 3.5f : 0f);
            }
        }

        private void CastScorch(
            GameState state,
            int star,
            Float2 point)
        {
            float areaScale = RelicMultiplier(
                state,
                "scorch",
                "areaScaleMul");
            float radius = StarValue(star, 110f, 140f, 180f)
                * areaScale;
            float duration = StarValue(star, 3f, 4f, 5f)
                * areaScale;
            float damageRatio =
                StarValue(star, 0.2f, 0.2f, 0.25f)
                * RelicMultiplier(state, "scorch", "dotDamageMul");
            float vulnerableRatio = star >= 3 ? 0.15f : 0f;
            state.GroundZones.Add(new GroundZoneState(
                point,
                radius,
                duration,
                0.5f,
                BaseDamage(state) * damageRatio,
                vulnerableRatio,
                vulnerableRatio > 0f ? 0.6f : 0f));
        }

        private void CastSplitBlast(
            GameState state,
            int star,
            Float2 point)
        {
            float radius = StarValue(star, 110f, 140f, 180f)
                * RelicMultiplier(
                    state,
                    "splitBlast",
                    "areaScaleMul");
            float damageMultiplier =
                StarValue(star, 4f, 6f, 9f)
                * RelicMultiplier(
                    state,
                    "splitBlast",
                    "effectDamageMul");
            float damage =
                BaseDamage(state) * damageMultiplier;
            DamageArea(
                state,
                point,
                radius,
                damage,
                -1,
                0f,
                0f);
            if (star < 3)
            {
                return;
            }

            var hit = new System.Collections.Generic.HashSet<int>();
            int splitTargets = 4
                + RelicQuantity(state, "splitBlast");
            for (int index = 0; index < splitTargets; index++)
            {
                EnemyState target = FindClosestChainTarget(
                    state,
                    point,
                    radius * 1.5f,
                    hit);
                if (target == null)
                {
                    break;
                }

                hit.Add(target.Id);
                DamageEnemy(state, target, damage * 0.5f);
            }
        }

        private void CastImpact(
            GameState state,
            int star,
            Float2 point)
        {
            float radius = StarValue(star, 100f, 140f, 180f)
                * RelicMultiplier(state, "impact", "areaScaleMul");
            float controlScale = RelicMultiplier(
                state,
                "impact",
                "controlPotencyMul");
            float knockback = StarValue(star, 80f, 120f, 180f)
                * controlScale;
            float stunDuration =
                (star >= 6 ? 1f : star >= 3 ? 0.5f : 0f)
                * controlScale;
            var targets =
                new System.Collections.Generic.List<EnemyState>();
            foreach (EnemyState enemy in state.Enemies)
            {
                if (Float2.Distance(point, enemy.Position) <= radius)
                {
                    targets.Add(enemy);
                }
            }

            foreach (EnemyState enemy in targets)
            {
                enemy.Position +=
                    (enemy.Position - point).Normalized() * knockback;
                enemy.StunnedRemaining = Math.Max(
                    enemy.StunnedRemaining,
                    stunDuration);
                if (star < 6)
                {
                    continue;
                }

                EnemyState collision = null;
                foreach (EnemyState other in state.Enemies)
                {
                    if (other.Id != enemy.Id
                        && Float2.Distance(
                            enemy.Position,
                            other.Position)
                            <= enemy.Radius + other.Radius)
                    {
                        collision = other;
                        break;
                    }
                }

                if (collision != null)
                {
                    DamageEnemy(
                        state,
                        collision,
                        BaseDamage(state)
                            * 0.5f
                            * RelicMultiplier(
                                state,
                                "impact",
                                "effectDamageMul"));
                }
            }
        }

        private void CastSanctum(
            GameState state,
            int star,
            Float2 point)
        {
            float areaScale = RelicMultiplier(
                state,
                "sanctum",
                "areaScaleMul");
            float radius = StarValue(star, 110f, 140f, 170f)
                * areaScale;
            float ratio = StarValue(star, 0.3f, 0.4f, 0.5f)
                * RelicMultiplier(
                    state,
                    "sanctum",
                    "controlPotencyMul");
            float duration = StarValue(star, 4f, 5f, 5f)
                * areaScale;
            foreach (EnemyState enemy in state.Enemies)
            {
                if (Float2.Distance(point, enemy.Position) > radius)
                {
                    continue;
                }

                enemy.VulnerableRatio = Math.Max(
                    enemy.VulnerableRatio,
                    ratio);
                enemy.VulnerableRemaining = Math.Max(
                    enemy.VulnerableRemaining,
                    duration);
            }
        }

        private void CastAegis(
            GameState state,
            int star,
            Float2 point)
        {
            int shieldHits = (int)Math.Ceiling(
                StarValue(star, 4f, 6f, 8f)
                * RelicMultiplier(
                    state,
                    "aegis",
                    "defenseDurabilityMul"));
            state.ShieldMaxHits += shieldHits;
            state.ShieldHits += shieldHits;
            float radius = StarValue(star, 90f, 120f, 150f);
            float knockback = StarValue(star, 70f, 100f, 140f);
            if (star >= 6)
            {
                DamageArea(
                    state,
                    point,
                    radius,
                    BaseDamage(state) * 5f,
                    -1,
                    knockback,
                    0f);
                return;
            }

            ApplyAreaKnockback(
                state,
                point,
                radius,
                knockback,
                0f);
        }

        private void CastThorns(
            GameState state,
            int star,
            Float2 point)
        {
            float areaScale = RelicMultiplier(
                state,
                "thorns",
                "areaScaleMul");
            float radius = StarValue(star, 90f, 120f, 150f)
                * areaScale;
            float duration = StarValue(star, 4f, 4f, 5f)
                * areaScale;
            float damageRatio =
                StarValue(star, 0.15f, 0.2f, 0.25f)
                * RelicMultiplier(
                    state,
                    "thorns",
                    "retaliationMul");
            state.GroundZones.Add(new GroundZoneState(
                point,
                radius,
                duration,
                0.5f,
                BaseDamage(state) * damageRatio,
                0f,
                0f,
                star < 3 ? 0.3f : 0f,
                star < 3 ? 0.6f : 0f,
                star >= 6 ? 0.15f : 0f,
                star >= 3 && star < 6 ? 2f : 1f));
        }

        private void CastDecoy(
            GameState state,
            int star,
            Float2 point)
        {
            state.DecoyActive = true;
            state.DecoyPosition = point;
            state.DecoyLifeRemaining =
                StarValue(star, 4f, 5f, 5f);
            state.DecoyHp =
                StarValue(star, 30f, 50f, 9999f)
                * RelicMultiplier(
                    state,
                    "decoy",
                    "defenseDurabilityMul");
            state.DecoyMaxHp = state.DecoyHp;
            state.DecoyTauntRadius =
                star >= 6 ? 160f
                    : StarValue(star, 120f, 160f, 160f);
            state.DecoyExplodeDamageMultiplier =
                (star >= 3 && star < 6 ? 1.5f : 0f)
                * RelicMultiplier(
                    state,
                    "decoy",
                    "effectDamageMul");
            state.DecoyExplodeKnockback =
                star >= 3 && star < 6 ? 90f : 0f;
            state.DecoyIsMirrorTurret = star >= 6;
            state.DecoyDamageRatio = star >= 6 ? 0.6f : 0f;
            state.DecoyFireInterval = star >= 6
                ? 1f / BaseFireRate(state)
                : 0f;
            state.DecoyFireRangeRatio = star >= 6 ? 1f : 0f;
            state.DecoyFireCooldown = 0f;
        }

        private void CastHarvest(
            GameState state,
            int star,
            Float2 point)
        {
            if (_drops == null)
            {
                return;
            }

            if (star >= 6)
            {
                SpawnHarvestDrops(state, point, 1, 2);
                SpawnHarvestDrops(state, point, 3, 1);
                return;
            }

            int count = star >= 3 ? 3 : 2;
            if (star >= 3)
            {
                for (int index = 0; index < count; index++)
                {
                    float offset =
                        (index - (count - 1) / 2f) * 28f;
                    _drops.SpawnWeightedBonusDrop(
                        state,
                        point + new Float2(offset, 0f),
                        4f,
                        1f);
                }

                return;
            }

            SpawnHarvestDrops(
                state,
                point,
                count,
                1);
        }

        private void SpawnHarvestDrops(
            GameState state,
            Float2 point,
            int count,
            int baseStar)
        {
            for (int index = 0; index < count; index++)
            {
                float offset =
                    (index - (count - 1) / 2f) * 28f;
                _drops.SpawnBonusDrop(
                    state,
                    point + new Float2(offset, 0f),
                    baseStar);
            }
        }

        private bool CastFrozenThunder(
            GameState state,
            Float2 point)
        {
            EnemyState first = null;
            float closest = 190f;
            foreach (EnemyState enemy in state.Enemies)
            {
                float distance = Float2.Distance(point, enemy.Position);
                if (distance <= closest)
                {
                    closest = distance;
                    first = enemy;
                }
            }

            if (first == null)
            {
                return false;
            }

            var visited =
                new System.Collections.Generic.HashSet<int>();
            EnemyState target = first;
            Float2 origin = first.Position;
            int bounces = 14
                + RelicQuantity(state, "frozenThunder");
            float controlScale = RelicMultiplier(
                state,
                "frozenThunder",
                "controlPotencyMul");
            float effectScale = RelicMultiplier(
                state,
                "frozenThunder",
                "effectDamageMul");
            float damage = BaseDamage(state) * effectScale;
            for (int hit = 0;
                hit <= bounces && target != null;
                hit++)
            {
                visited.Add(target.Id);
                Float2 nextOrigin = target.Position;
                DamageEnemy(state, target, damage);
                if (state.Enemies.Contains(target))
                {
                    target.FrozenRemaining = Math.Max(
                        target.FrozenRemaining,
                        2.5f * controlScale);
                }

                origin = nextOrigin;
                damage *= 0.9f;
                target = FindClosestChainTarget(
                    state,
                    origin,
                    190f,
                    visited);
            }

            DamageArea(
                state,
                point,
                120f,
                BaseDamage(state) * 3.5f,
                -1,
                0f,
                0f);
            return true;
        }

        private void CastSolarLance(
            GameState state,
            Float2 point)
        {
            Float2 direction =
                (point - TurretPosition).Normalized();
            if (direction.Length <= 0.000001f)
            {
                direction = new Float2(1f, 0f);
            }

            float effectScale = RelicMultiplier(
                state,
                "solarLance",
                "effectDamageMul");
            float damage = BaseDamage(state) * 7f * effectScale;
            var targets =
                new System.Collections.Generic.List<EnemyState>();
            foreach (EnemyState enemy in state.Enemies)
            {
                Float2 relative = enemy.Position - TurretPosition;
                float along = relative.X * direction.X
                    + relative.Y * direction.Y;
                float perpendicular = Math.Abs(
                    relative.X * direction.Y
                    - relative.Y * direction.X);
                if (along >= 0f
                    && along <= AttackRange(state)
                    && perpendicular <= 19f + enemy.Radius)
                {
                    targets.Add(enemy);
                }
            }

            foreach (EnemyState enemy in targets)
            {
                DamageEnemy(state, enemy, damage);
                if (!state.Enemies.Contains(enemy))
                {
                    continue;
                }

                enemy.DotDamagePerTick = Math.Max(
                    enemy.DotDamagePerTick,
                    damage * 0.35f);
                enemy.DotTickInterval = 0.5f;
                enemy.DotTickRemaining = 0.5f;
                enemy.DotRemaining = Math.Max(
                    enemy.DotRemaining,
                    5f);
                enemy.VulnerableRatio = Math.Max(
                    enemy.VulnerableRatio,
                    0.2f);
                enemy.VulnerableRemaining = Math.Max(
                    enemy.VulnerableRemaining,
                    3f);
            }

            state.BeamVisualStart = TurretPosition;
            state.BeamVisualEnd = TurretPosition
                + direction * AttackRange(state);
            state.BeamVisualWidth = 38f;
            state.BeamVisualRemaining = 0.25f;
        }

        private void CastAvalanche(
            GameState state,
            Float2 point)
        {
            var targets =
                new System.Collections.Generic.List<EnemyState>();
            foreach (EnemyState enemy in state.Enemies)
            {
                if (Float2.Distance(point, enemy.Position)
                    <= 210f
                        * RelicMultiplier(
                            state,
                            "avalanche",
                            "areaScaleMul"))
                {
                    targets.Add(enemy);
                }
            }

            foreach (EnemyState enemy in targets)
            {
                DamageEnemy(
                    state,
                    enemy,
                    BaseDamage(state)
                        * 5.5f
                        * RelicMultiplier(
                            state,
                            "avalanche",
                            "effectDamageMul"));
                if (!state.Enemies.Contains(enemy))
                {
                    continue;
                }

                enemy.FrozenRemaining = Math.Max(
                    enemy.FrozenRemaining,
                    2f * RelicMultiplier(
                        state,
                        "avalanche",
                        "controlPotencyMul"));
                enemy.Position +=
                    (enemy.Position - point).Normalized()
                    * 200f
                    * RelicMultiplier(
                        state,
                        "avalanche",
                        "controlPotencyMul");
            }
        }

        private void CastPyrestorm(
            GameState state,
            Float2 point)
        {
            float areaScale = RelicMultiplier(
                state,
                "pyrestorm",
                "areaScaleMul");
            float effectScale = RelicMultiplier(
                state,
                "pyrestorm",
                "effectDamageMul");
            int strikes = 3 + RelicQuantity(state, "pyrestorm");
            for (int strike = 0; strike < strikes; strike++)
            {
                DamageArea(
                    state,
                    point,
                    160f * areaScale,
                    BaseDamage(state) * 5f * effectScale,
                    -1,
                    0f,
                    0f,
                    0f,
                    0.3f);
            }

            state.GroundZones.Add(new GroundZoneState(
                point,
                210f * areaScale,
                5f * areaScale,
                0.5f,
                BaseDamage(state)
                    * 0.45f
                    * RelicMultiplier(
                        state,
                        "pyrestorm",
                        "dotDamageMul"),
                0.18f,
                0.6f));
        }

        private void CastCrownOfThorns(
            GameState state,
            Float2 point)
        {
            int shieldHits = (int)Math.Ceiling(
                10f * RelicMultiplier(
                    state,
                    "crownOfThorns",
                    "defenseDurabilityMul"));
            state.ShieldMaxHits += shieldHits;
            state.ShieldHits += shieldHits;
            float areaScale = RelicMultiplier(
                state,
                "crownOfThorns",
                "areaScaleMul");
            float retaliationScale = RelicMultiplier(
                state,
                "crownOfThorns",
                "retaliationMul");
            DamageArea(
                state,
                point,
                200f * areaScale,
                BaseDamage(state) * 5f * retaliationScale,
                -1,
                140f,
                0f);
            state.GroundZones.Add(new GroundZoneState(
                point,
                200f * areaScale,
                5f * areaScale,
                0.5f,
                BaseDamage(state) * 0.4f * retaliationScale,
                0f,
                0f,
                0f,
                0f,
                0.16f));
        }

        private void CastGoldenIdol(
            GameState state,
            Float2 point)
        {
            state.DecoyActive = true;
            state.DecoyPosition = point;
            state.DecoyLifeRemaining = 5f;
            float durability = RelicMultiplier(
                state,
                "goldenIdol",
                "defenseDurabilityMul");
            state.DecoyHp = 180f * durability;
            state.DecoyMaxHp = state.DecoyHp;
            state.DecoyTauntRadius = 230f;
            state.DecoyExplodeDamageMultiplier = 3f
                * RelicMultiplier(
                    state,
                    "goldenIdol",
                    "effectDamageMul");
            state.DecoyExplodeKnockback = 0f;
            state.DecoyIsMirrorTurret = false;
            state.KillXpBuffMultiplier = 1.6f;
            state.KillXpBuffRemaining = 5f;
            state.KillXpBuffStacks = 1;
            if (_drops == null)
            {
                return;
            }

            for (int index = 0; index < 4; index++)
            {
                float offset = (index - 1.5f) * 28f;
                _drops.SpawnWeightedBonusDrop(
                    state,
                    point + new Float2(offset, 0f),
                    4f,
                    1f);
            }
        }

        private void CastStaticSurge(
            GameState state,
            int star,
            Float2 point)
        {
            float radius = StarValue(star, 90f, 130f, 175f);
            float ratio = StarValue(star, 0.12f, 0.2f, 0.3f)
                * RelicMultiplier(
                    state,
                    "staticSurge",
                    "controlPotencyMul");
            float duration = StarValue(star, 3f, 4f, 5f);
            float stun = star >= 6 ? 0.4f : 0f;
            foreach (EnemyState enemy in state.Enemies)
            {
                if (Float2.Distance(point, enemy.Position) > radius)
                {
                    continue;
                }

                enemy.VulnerableRatio = Math.Max(
                    enemy.VulnerableRatio,
                    ratio);
                enemy.VulnerableRemaining = Math.Max(
                    enemy.VulnerableRemaining,
                    duration);
                enemy.StunnedRemaining = Math.Max(
                    enemy.StunnedRemaining,
                    stun);
            }
        }

        private void CastStormcall(
            GameState state,
            int star,
            Float2 point)
        {
            int strikes = star >= 6 ? 3 : star >= 3 ? 2 : 1;
            float radius = StarValue(star, 80f, 100f, 130f)
                * RelicMultiplier(
                    state,
                    "stormcall",
                    "areaScaleMul");
            float damageRatio = StarValue(star, 2f, 2.5f, 3f)
                * RelicMultiplier(
                    state,
                    "stormcall",
                    "effectDamageMul");
            float falloff = star >= 6 ? 0.3f : 0.4f;
            for (int index = 0; index < strikes; index++)
            {
                DamageArea(
                    state,
                    point,
                    radius,
                    BaseDamage(state) * damageRatio,
                    -1,
                    0f,
                    0f,
                    0f,
                    falloff);
            }
        }

        private void CastArcSplitter(
            GameState state,
            int star,
            Float2 point)
        {
            int count = (int)Math.Round(
                StarValue(star, 6f, 10f, 16f))
                + RelicQuantity(state, "arcSplitter");
            float damageRatio = StarValue(star, 0.6f, 0.7f, 0.8f)
                * RelicMultiplier(
                    state,
                    "arcSplitter",
                    "effectDamageMul");
            for (int index = 0; index < count; index++)
            {
                float angle = index * (float)Math.PI * 2f / count;
                var direction = new Float2(
                    (float)Math.Cos(angle),
                    (float)Math.Sin(angle));
                state.Bullets.Add(new BulletState(
                    state.TakeNextBulletId(),
                    point,
                    direction * _combat.bullet.speed,
                    _combat.bullet.radius,
                    0.8f,
                    BaseDamage(state) * damageRatio));
            }

            if (star >= 3)
            {
                DamageArea(
                    state,
                    point,
                    star >= 6 ? 130f : 90f,
                    BaseDamage(state)
                        * (star >= 6 ? 2.5f : 1.5f),
                    -1,
                    0f,
                    0f);
            }
        }

        private void CastGalvanicWard(
            GameState state,
            int star,
            Float2 point)
        {
            int hits = (int)Math.Round(
                StarValue(star, 3f, 5f, 8f)
                * RelicMultiplier(
                    state,
                    "galvanicWard",
                    "defenseDurabilityMul"));
            state.ShieldMaxHits += hits;
            state.ShieldHits += hits;
            float radius = StarValue(star, 90f, 130f, 175f);
            float damageRatio = StarValue(star, 1f, 2f, 3.5f)
                * RelicMultiplier(
                    state,
                    "galvanicWard",
                    "effectDamageMul");
            DamageArea(
                state,
                point,
                radius,
                BaseDamage(state) * damageRatio,
                -1,
                0f,
                0f);
            float stun = star >= 6 ? 0.5f : star >= 3 ? 0.3f : 0f;
            if (stun <= 0f)
            {
                return;
            }

            foreach (EnemyState enemy in state.Enemies)
            {
                if (Float2.Distance(point, enemy.Position) <= radius)
                {
                    enemy.StunnedRemaining = Math.Max(
                        enemy.StunnedRemaining,
                        stun);
                }
            }
        }

        private void CastOvercharge(GameState state, int star)
        {
            float multiplier = StarValue(star, 1.2f, 1.35f, 1.55f);
            state.FireRateMultiplier = Math.Max(
                state.FireRateMultiplier,
                multiplier);
            state.FireRateBuffRemaining = Math.Max(
                state.FireRateBuffRemaining,
                StarValue(star, 3f, 4f, 5f));
        }

        private void CastGlacialSpike(
            GameState state,
            int star,
            Float2 point)
        {
            Float2 direction = (point - TurretPosition).Normalized();
            if (direction.Length <= 0.000001f)
            {
                direction = new Float2(1f, 0f);
            }

            float width = StarValue(star, 10f, 16f, 24f);
            float damage = BaseDamage(state)
                * StarValue(star, 2.5f, 4f, 6.5f)
                * RelicMultiplier(
                    state,
                    "glacialSpike",
                    "effectDamageMul");
            float freeze = StarValue(star, 0.7f, 1.2f, 2f)
                * RelicMultiplier(
                    state,
                    "glacialSpike",
                    "controlPotencyMul");
            var targets =
                new System.Collections.Generic.List<EnemyState>();
            foreach (EnemyState enemy in state.Enemies)
            {
                Float2 relative = enemy.Position - TurretPosition;
                float along = relative.X * direction.X
                    + relative.Y * direction.Y;
                float perpendicular = Math.Abs(
                    relative.X * direction.Y
                    - relative.Y * direction.X);
                if (along >= 0f
                    && along <= AttackRange(state)
                    && perpendicular <= width / 2f + enemy.Radius)
                {
                    targets.Add(enemy);
                }
            }

            foreach (EnemyState enemy in targets)
            {
                Float2 hit = enemy.Position;
                DamageEnemy(state, enemy, damage);
                if (state.Enemies.Contains(enemy))
                {
                    enemy.FrozenRemaining = Math.Max(
                        enemy.FrozenRemaining,
                        freeze);
                }

                if (star >= 6)
                {
                    DamageArea(
                        state,
                        hit,
                        100f,
                        damage,
                        enemy.Id,
                        0f,
                        0f);
                }
            }
        }

        private void CastPermafrost(
            GameState state,
            int star,
            Float2 point)
        {
            float radius = StarValue(star, 90f, 130f, 180f)
                * RelicMultiplier(
                    state,
                    "permafrost",
                    "areaScaleMul");
            float duration = StarValue(star, 3f, 4f, 5f);
            float slow = StarValue(star, 0.3f, 0.4f, 0.55f)
                * RelicMultiplier(
                    state,
                    "permafrost",
                    "controlPotencyMul");
            state.GroundZones.Add(new GroundZoneState(
                point,
                radius,
                duration,
                0.5f,
                0f,
                0f,
                0f,
                slow,
                0.8f));
            if (star < 3)
            {
                return;
            }

            float freeze = star >= 6 ? 0.8f : 0.6f;
            foreach (EnemyState enemy in state.Enemies)
            {
                if (Float2.Distance(point, enemy.Position) <= radius)
                {
                    enemy.FreezeStacks++;
                    int threshold = star >= 6 ? 3 : 4;
                    if (enemy.FreezeStacks >= threshold)
                    {
                        enemy.FreezeStacks = 0;
                        enemy.FrozenRemaining = Math.Max(
                            enemy.FrozenRemaining,
                            freeze);
                    }
                }
            }
        }

        private void CastIceTomb(
            GameState state,
            int star,
            Float2 point)
        {
            float radius = StarValue(star, 80f, 125f, 180f)
                * RelicMultiplier(
                    state,
                    "iceTomb",
                    "areaScaleMul");
            float duration = StarValue(star, 0.8f, 1.4f, 2.2f)
                * RelicMultiplier(
                    state,
                    "iceTomb",
                    "controlPotencyMul");
            foreach (EnemyState enemy in state.Enemies)
            {
                if (Float2.Distance(point, enemy.Position) > radius)
                {
                    continue;
                }

                enemy.FrozenRemaining = Math.Max(
                    enemy.FrozenRemaining,
                    duration);
                if (star >= 6)
                {
                    enemy.VulnerableRatio = Math.Max(
                        enemy.VulnerableRatio,
                        0.2f);
                    enemy.VulnerableRemaining = Math.Max(
                        enemy.VulnerableRemaining,
                        2.2f);
                }
            }
        }

        private void CastFrozenBulwark(
            GameState state,
            int star,
            Float2 point)
        {
            int hits = (int)Math.Round(
                StarValue(star, 3f, 5f, 8f)
                * RelicMultiplier(
                    state,
                    "frozenBulwark",
                    "defenseDurabilityMul"));
            state.ShieldMaxHits += hits;
            state.ShieldHits += hits;
            float radius = StarValue(star, 90f, 130f, 180f);
            float freeze = StarValue(star, 0.6f, 1.1f, 1.8f);
            foreach (EnemyState enemy in state.Enemies)
            {
                if (Float2.Distance(point, enemy.Position) <= radius)
                {
                    enemy.FrozenRemaining = Math.Max(
                        enemy.FrozenRemaining,
                        freeze);
                }
            }

            if (star >= 6)
            {
                DamageArea(
                    state,
                    point,
                    radius,
                    BaseDamage(state) * 2f,
                    -1,
                    0f,
                    0f);
            }
        }

        private void CastHoarfrostTithe(GameState state, int star)
        {
            state.EconomyXpMultiplier = StarValue(
                star,
                1.15f,
                1.3f,
                1.5f);
            state.EconomyDropRateMultiplier =
                state.EconomyXpMultiplier;
            state.EconomyBuffRemaining = Math.Max(
                state.EconomyBuffRemaining,
                StarValue(star, 3f, 4f, 5f));
        }

        private void CastMeteor(
            GameState state,
            int star,
            Float2 point)
        {
            int count = star >= 6 ? 3 : star >= 3 ? 2 : 1;
            float radius = StarValue(star, 90f, 110f, 140f);
            float damage = BaseDamage(state)
                * StarValue(star, 3f, 3.5f, 4f)
                * RelicMultiplier(state, "meteor", "effectDamageMul");
            for (int index = 0; index < count; index++)
            {
                float offset = (index - (count - 1) / 2f) * radius * 0.45f;
                DamageArea(
                    state,
                    point + new Float2(offset, 0f),
                    radius,
                    damage,
                    -1,
                    0f,
                    0f,
                    0f,
                    star >= 6 ? 0.3f : 0.4f);
            }
        }

        private void CastMagmaPool(
            GameState state,
            int star,
            Float2 point)
        {
            float radius = StarValue(star, 90f, 135f, 185f);
            float duration = StarValue(star, 3f, 4f, 5f);
            state.GroundZones.Add(new GroundZoneState(
                point,
                radius,
                duration,
                0.5f,
                BaseDamage(state)
                    * StarValue(star, 0.2f, 0.28f, 0.4f)
                    * RelicMultiplier(state, "magmaPool", "dotDamageMul"),
                star >= 3 ? StarValue(star, 0f, 0.1f, 0.18f) : 0f,
                0.6f));
        }

        private void CastFlashfire(
            GameState state,
            int star,
            Float2 point)
        {
            float radius = StarValue(star, 90f, 135f, 185f);
            ApplyAreaDot(
                state,
                point,
                radius,
                BaseDamage(state)
                    * StarValue(star, 0.12f, 0.2f, 0.3f),
                0.5f,
                StarValue(star, 2f, 3f, 4f));
            ApplyAreaKnockback(
                state,
                point,
                radius,
                StarValue(star, 70f, 110f, 160f),
                StarValue(star, 0f, 0.3f, 0.6f));
        }

        private void CastCinderheart(
            GameState state,
            int star,
            Float2 point)
        {
            state.DefenseDurabilityMultiplier =
                StarValue(star, 1.2f, 1.35f, 1.55f);
            state.DefenseBuffRemaining = Math.Max(
                state.DefenseBuffRemaining,
                StarValue(star, 3f, 4f, 5f));
            state.GroundZones.Add(new GroundZoneState(
                point,
                StarValue(star, 90f, 135f, 185f),
                StarValue(star, 3f, 4f, 5f),
                0.5f,
                BaseDamage(state)
                    * StarValue(star, 0.15f, 0.22f, 0.32f),
                0f,
                0f));
        }

        private void CastAshHarvest(GameState state, int star)
        {
            state.EconomyXpMultiplier =
                StarValue(star, 1.15f, 1.3f, 1.5f);
            state.EconomyDropRateMultiplier =
                state.EconomyXpMultiplier;
            state.EconomyBuffRemaining = Math.Max(
                state.EconomyBuffRemaining,
                StarValue(star, 3f, 4f, 5f));
        }

        private void CastSentinel(
            GameState state,
            int star,
            Float2 point)
        {
            state.DecoyActive = true;
            state.DecoyIsMirrorTurret = true;
            state.DecoyPosition = point;
            state.DecoyHp = StarValue(star, 40f, 70f, 110f);
            state.DecoyMaxHp = state.DecoyHp;
            state.DecoyTauntRadius = StarValue(
                star,
                80f,
                120f,
                170f);
            state.DecoyDamageRatio = StarValue(
                star,
                0.35f,
                0.5f,
                0.7f);
            state.DecoyFireInterval = 0.5f;
            state.DecoyFireRangeRatio = 1f;
            state.DecoyFireCooldown = 0f;
            state.DecoyLifeRemaining = StarValue(
                star,
                3f,
                4f,
                5f);
            state.SecondaryDecoyActive = star >= 6;
            state.SecondaryDecoyHp = state.DecoyHp;
            state.SecondaryDecoyPosition =
                point + new Float2(55f, 0f);
        }

        private void CastRetribution(
            GameState state,
            int star,
            Float2 point)
        {
            float radius = StarValue(star, 90f, 135f, 185f);
            DamageArea(
                state,
                point,
                radius,
                BaseDamage(state)
                    * StarValue(star, 2f, 3.5f, 5.5f),
                -1,
                0f,
                0f);
            ApplyAreaKnockback(
                state,
                point,
                radius,
                StarValue(star, 0f, 70f, 120f),
                StarValue(star, 0.35f, 0.6f, 1f));
        }

        private void CastIronvine(GameState state, int star)
        {
            state.EconomyDropRateMultiplier =
                StarValue(star, 1.15f, 1.3f, 1.5f);
            state.EconomyDropLifetimeMultiplier =
                state.EconomyDropRateMultiplier;
            state.EconomyBuffRemaining = Math.Max(
                state.EconomyBuffRemaining,
                StarValue(star, 3f, 4f, 5f));
        }

        private void CastFateLoom(
            GameState state,
            int star,
            Float2 point)
        {
            float radius = StarValue(star, 90f, 140f, 190f);
            DamageArea(
                state,
                point,
                radius,
                BaseDamage(state)
                    * StarValue(star, 2f, 4f, 7f),
                -1,
                0f,
                star >= 3 ? 0.25f : 0f,
                1.5f);
            if (star >= 6)
            {
                MarkArea(
                    state,
                    point,
                    radius,
                    0.2f,
                    2f,
                    1f,
                    0f,
                    0f);
                state.DamageMultiplier = Math.Max(
                    state.DamageMultiplier,
                    1.25f);
                state.DamageBuffRemaining = Math.Max(
                    state.DamageBuffRemaining,
                    5f);
            }
        }

        private void CastGoldenVolley(
            GameState state,
            int star,
            Float2 point)
        {
            float radius = StarValue(star, 90f, 140f, 190f);
            DamageArea(
                state,
                point,
                radius,
                BaseDamage(state)
                    * StarValue(star, 2.5f, 4f, 6.5f),
                -1,
                0f,
                0f);
            MarkArea(
                state,
                point,
                radius,
                0f,
                0f,
                StarValue(star, 2f, 3f, 5f),
                StarValue(star, 3f, 4f, 5f),
                0f);
        }

        private void CastBountyCall(
            GameState state,
            int star,
            Float2 point)
        {
            MarkArea(
                state,
                point,
                StarValue(star, 90f, 140f, 190f),
                StarValue(star, 0f, 0.12f, 0.25f),
                StarValue(star, 3f, 4f, 5f),
                StarValue(star, 3f, 5f, 8f),
                StarValue(star, 3f, 4f, 5f),
                star >= 6 ? 0.3f : 0f);
        }

        private void CastOvergrowth(
            GameState state,
            int star,
            Float2 point)
        {
            state.GroundZones.Add(new GroundZoneState(
                point,
                StarValue(star, 90f, 140f, 190f),
                StarValue(star, 3f, 4f, 5f),
                0.5f,
                0f,
                StarValue(star, 0.08f, 0.14f, 0.24f),
                0.8f,
                StarValue(star, 0.25f, 0.4f, 0.55f),
                0.8f));
            if (star >= 6)
            {
                ApplyAreaKnockback(
                    state,
                    point,
                    190f,
                    0f,
                    0.3f);
            }
        }

        private static void CastSpringOfLife(
            GameState state,
            int star)
        {
            state.RestoreHp(
                state.MaxHp
                    * StarValue(star, 0.18f, 0.35f, 0.6f));
            if (star >= 6)
            {
                state.ShieldHits += 2;
                state.ShieldMaxHits = Math.Max(
                    state.ShieldMaxHits,
                    state.ShieldHits);
            }
        }

        private void CastLuckyStar(GameState state, int star)
        {
            state.EconomyXpMultiplier =
                StarValue(star, 1.2f, 1.4f, 1.7f);
            state.EconomyDropRateMultiplier =
                state.EconomyXpMultiplier;
            state.EconomyBuffRemaining = Math.Max(
                state.EconomyBuffRemaining,
                StarValue(star, 3f, 4f, 5f));
        }

        private float BaseDamage(GameState state)
        {
            return Math.Max(
                0f,
                (_combat.defaults.damage + state.RunDamageAdd)
                    * state.DamageMultiplier);
        }

        private float BaseFireRate(GameState state)
        {
            return Math.Max(
                0.01f,
                _combat.defaults.fireRate + state.RunFireRateAdd);
        }

        private float AttackRange(GameState state)
        {
            return Math.Max(
                0f,
                _combat.defaults.range + state.RunRangeAdd);
        }

        private static float RelicMultiplier(
            GameState state,
            string cardType,
            string axis)
        {
            return 1f + RelicScalingSystem.ForCard(
                state,
                cardType,
                axis);
        }

        private static int RelicQuantity(
            GameState state,
            string cardType)
        {
            float value = RelicScalingSystem.ForCard(
                state,
                cardType,
                "quantityAdd");
            return value > 0f ? (int)Math.Ceiling(value) : 0;
        }

        private static float StarValue(
            int star,
            float oneStar,
            float threeStar,
            float sixStar)
        {
            int clamped = Math.Max(1, Math.Min(6, star));
            if (clamped <= 3)
            {
                return oneStar
                    + (threeStar - oneStar)
                    * ((clamped - 1) / 2f);
            }

            return threeStar
                + (sixStar - threeStar)
                * ((clamped - 3) / 3f);
        }

        public void StepPassives(GameState state, float deltaTime)
        {
            CardCombatProfile profile = CardEffectResolver.Resolve(state);
            if (state.EconomyBuffRemaining > 0f)
            {
                state.EconomyBuffRemaining = Math.Max(
                    0f,
                    state.EconomyBuffRemaining - deltaTime);
                if (state.EconomyBuffRemaining <= 0f)
                {
                    state.EconomyXpMultiplier = 1f;
                    state.EconomyDropRateMultiplier = 1f;
                    state.EconomyDropLifetimeMultiplier = 1f;
                }
            }

            if (state.DefenseBuffRemaining > 0f)
            {
                state.DefenseBuffRemaining = Math.Max(
                    0f,
                    state.DefenseBuffRemaining - deltaTime);
                if (state.DefenseBuffRemaining <= 0f)
                {
                    state.DefenseDurabilityMultiplier = 1f;
                }
            }

            if (state.DamageBuffRemaining > 0f)
            {
                state.DamageBuffRemaining = Math.Max(
                    0f,
                    state.DamageBuffRemaining - deltaTime);
                if (state.DamageBuffRemaining <= 0f)
                {
                    state.DamageMultiplier = 1f;
                    state.DamageBuffStacks = 0;
                }
            }

            state.DropRateMultiplier = profile.DropRateMultiplier
                * state.EconomyDropRateMultiplier;
            state.DropLifetimeMultiplier = profile.DropLifetimeMultiplier
                * state.EconomyDropLifetimeMultiplier;
            state.ExpiryConvertRatio = profile.ExpiryConvertRatio;
            state.XpMultiplier = profile.XpMultiplier
                * state.EconomyXpMultiplier;
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
                    state.KillFireRateStacks = 0;
                }
            }

            if (state.KillXpBuffRemaining > 0f)
            {
                state.KillXpBuffRemaining = Math.Max(
                    0f,
                    state.KillXpBuffRemaining - deltaTime);
                if (state.KillXpBuffRemaining <= 0f)
                {
                    state.KillXpBuffMultiplier = 1f;
                    state.KillXpBuffStacks = 0;
                }
            }

            if (state.DecoyActive && state.DecoyLifeRemaining > 0f)
            {
                state.DecoyLifeRemaining = Math.Max(
                    0f,
                    state.DecoyLifeRemaining - deltaTime);
                if (state.DecoyLifeRemaining <= 0f)
                {
                    state.DecoyActive = false;
                    state.DecoyIsMirrorTurret = false;
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
                        BaseDamage(state)
                            * profile.ThornsAuraDamageRatio,
                        -1,
                        0f,
                        profile.ThornsAuraSlowRatio,
                        profile.ThornsAuraSlowDuration);
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
                        BaseDamage(state)
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
            ApplyAvalanchePulse(state, profile, deltaTime);
            ApplyPyrestorm(state, profile, deltaTime);
            ApplyStormcall(state, profile, deltaTime);
            ApplyPermafrost(state, profile, deltaTime);
            ApplyMeteor(state, profile, deltaTime);
            ApplyMagmaPool(state, profile, deltaTime);
            ApplyFlashfire(state, profile, deltaTime);
            ApplyCinderheart(state, profile, deltaTime);
            ApplyBountyCall(state, profile, deltaTime);
            ApplyOvergrowth(state, profile, deltaTime);
            ApplySpringOfLife(state, profile, deltaTime);
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
                    bool wasFrozen = enemy.FrozenRemaining > 0f;
                    DamageEnemy(state, enemy, bullet.Damage);
                    ApplyStatusEffects(enemy, bullet);
                    if (wasFrozen
                        && state.Enemies.Contains(enemy)
                        && bullet.FrozenHitExecuteThresholdRatio > 0f
                        && enemy.Hp / enemy.MaxHp
                            <= bullet.FrozenHitExecuteThresholdRatio)
                    {
                        DamageEnemy(state, enemy, enemy.Hp);
                    }
                    ApplyOnHitStun(state, enemy, bullet);
                    ApplyOnHitFireRate(state, bullet);
                    ApplyImpactAndSplitEffects(
                        state,
                        bullet,
                        hitPosition,
                        enemy.Id);
                    ApplyMeteorHit(
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
                _bounties?.NotifyBreached(state, enemy);
                HandleBreach(state, profile, enemy.Damage);
            }
        }

        private void DamageEnemy(
            GameState state,
            EnemyState enemy,
            float damage)
        {
            bool killedWhileFrozen = enemy.FrozenRemaining > 0f;
            bool killedWhileDot = enemy.DotRemaining > 0f
                || enemy.SecondaryDotRemaining > 0f;
            bool killedWhileControlled =
                enemy.FrozenRemaining > 0f
                || enemy.StunnedRemaining > 0f
                || enemy.SlowRemaining > 0f;
            CardCombatProfile profile =
                CardEffectResolver.Resolve(state);
            float vulnerability = enemy.VulnerableRemaining > 0f
                ? enemy.VulnerableRatio
                : 0f;
            float controlledBonus = killedWhileControlled
                ? profile.ControlledDamageTakenBonus
                : 0f;
            enemy.Hp -= damage
                * (1f + vulnerability)
                * (1f + controlledBonus);
            if (enemy.Hp > 0f)
            {
                return;
            }

            if (state.Enemies.Remove(enemy))
            {
                _bounties?.NotifyKilled(state, enemy);
                state.Kills++;
                _drops?.TrySpawnOnKill(state, enemy);
                state.GrantReward(enemy.Reward);
                float experience = enemy.XpReward
                    * profile.XpMultiplier
                    * state.KillXpBuffMultiplier;
                if (killedWhileDot)
                {
                    experience *= profile.DotKillXpMultiplier;
                }
                if (_progression != null)
                {
                    _progression.AddExperience(state, experience);
                }
                else
                {
                    state.AddExperience(experience);
                }
                if (enemy.Reward != null)
                {
                    state.RestoreHp(profile.PickupRestore);
                }

                ApplyKillCardEffects(
                    state,
                    profile,
                    enemy.Position);
                if (profile.KillExtraDropChance > 0f)
                {
                    _drops?.TrySpawnBonus(
                        state,
                        enemy.Position,
                        profile.KillExtraDropChance);
                }
                if (killedWhileDot)
                {
                    ApplyDotKillCardEffects(
                        state,
                        profile,
                        enemy.Position);
                }
                if (killedWhileFrozen
                    && profile.FrozenKillRestore > 0f)
                {
                    state.RestoreHp(profile.FrozenKillRestore);
                }

                if (killedWhileFrozen
                    && profile.FrozenKillSplashRadius > 0f)
                {
                    DamageArea(
                        state,
                        enemy.Position,
                        profile.FrozenKillSplashRadius,
                        BaseDamage(state)
                            * profile.FrozenKillSplashDamageRatio,
                        enemy.Id,
                        0f,
                        profile.FrozenKillSlowRatio,
                        profile.FrozenKillSlowDuration);
                    if (profile.FrozenKillFreezeDuration > 0f)
                    {
                        foreach (EnemyState nearby in state.Enemies)
                        {
                            if (Float2.Distance(
                                enemy.Position,
                                nearby.Position)
                                <= profile.FrozenKillSplashRadius)
                            {
                                nearby.FrozenRemaining = Math.Max(
                                    nearby.FrozenRemaining,
                                    profile.FrozenKillFreezeDuration);
                            }
                        }
                    }
                }

                if (killedWhileControlled)
                {
                    if (profile.ControlledKillExtraDropChance > 0f)
                    {
                        _drops?.TrySpawnBonus(
                            state,
                            enemy.Position,
                            profile.ControlledKillExtraDropChance);
                    }
                    if (profile.ControlledKillXpMaxStacks > 0)
                    {
                        state.KillXpBuffStacks = Math.Min(
                            profile.ControlledKillXpMaxStacks,
                            state.KillXpBuffStacks + 1);
                        state.KillXpBuffMultiplier =
                            (float)Math.Pow(
                                profile.ControlledKillXpMultiplier,
                                state.KillXpBuffStacks);
                        state.KillXpBuffRemaining =
                            profile.ControlledKillXpDuration;
                    }
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

        private static void ApplyOnHitFireRate(
            GameState state,
            BulletState bullet)
        {
            if (bullet.OnHitFireRateMultiplier <= 1f
                || bullet.OnHitFireRateMaxStacks <= 0)
            {
                return;
            }

            state.KillFireRateStacks = Math.Min(
                bullet.OnHitFireRateMaxStacks,
                state.KillFireRateStacks + 1);
            state.FireRateMultiplier = Math.Max(
                state.FireRateMultiplier,
                (float)Math.Pow(
                    bullet.OnHitFireRateMultiplier,
                    state.KillFireRateStacks));
            state.FireRateBuffRemaining = Math.Max(
                state.FireRateBuffRemaining,
                bullet.OnHitFireRateDuration);
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
            enemy.FocusPriorityRemaining = Math.Max(
                0f,
                enemy.FocusPriorityRemaining - deltaTime);
            if (enemy.FocusPriorityRemaining <= 0f)
            {
                enemy.FocusPriorityWeight = 1f;
            }
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
            state.AvalanchePulseRemaining =
                profile.AvalancheInterval;
            state.PyrestormPulseRemaining =
                profile.PyrestormInterval;
            state.StormcallPulseRemaining =
                profile.StormcallInterval;
            state.PermafrostPulseRemaining =
                profile.PermafrostInterval;
            state.MeteorPulseRemaining =
                profile.MeteorInterval;
            state.MagmaPulseRemaining =
                profile.MagmaInterval > 0f
                    ? profile.MagmaInterval
                    : profile.MagmaTickInterval;
            state.FlashfirePulseRemaining =
                profile.FlashfireInterval;
            state.CinderheartPulseRemaining =
                profile.CinderheartRestoreInterval;
            state.BountyPulseRemaining =
                profile.BountyInterval;
            state.OvergrowthPulseRemaining =
                profile.OvergrowthInterval;
            state.SpringPulseRemaining =
                profile.SpringRestoreInterval;
            state.GroundZones.Clear();
            state.ScorchAuraTickRemaining =
                profile.ScorchAuraTickInterval;
            state.SanctumPulseRemaining =
                profile.SanctumPulseInterval;
            state.BeamVisualRemaining = 0f;
            if (profile.WaveStartDamageMultiplier > 1f)
            {
                state.DamageMultiplier =
                    profile.WaveStartDamageMultiplier;
                state.DamageBuffRemaining =
                    profile.WaveStartDamageDuration;
                state.DamageBuffStacks = 1;
            }
            if (profile.WaveStartDefenseMultiplier > 1f)
            {
                state.DefenseDurabilityMultiplier =
                    profile.WaveStartDefenseMultiplier;
                state.DefenseBuffRemaining =
                    profile.WaveStartDefenseDuration;
            }
            if (profile.WaveStartRestoreRatio > 0f)
            {
                state.RestoreHp(
                    state.MaxHp * profile.WaveStartRestoreRatio);
            }

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
            state.DecoyLifeRemaining = 0f;
            state.DecoyDamageRatio = profile.DecoyDamageRatio;
            state.DecoyFireInterval = profile.DecoyFireInterval;
            state.DecoyFireRangeRatio =
                profile.DecoyFireRangeRatio;
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
                AttackRange(state) * profile.AuraRadiusRatio;
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
                AttackRange(state)
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
                + direction * AttackRange(state);
            float damage = BaseDamage(state)
                * BaseFireRate(state)
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
                    && along <= AttackRange(state)
                    && perpendicular
                        <= profile.BeamWidth / 2f
                            + enemy.Radius)
                {
                    targets.Add(enemy);
                }
            }

            foreach (EnemyState enemy in targets)
            {
                bool hadDot = enemy.DotRemaining > 0f
                    || enemy.SecondaryDotRemaining > 0f;
                DamageEnemy(state, enemy, damage);
                if (!state.Enemies.Contains(enemy))
                {
                    continue;
                }

                if (profile.DotDamageRatio > 0f)
                {
                    enemy.DotDamagePerTick = Math.Max(
                        enemy.DotDamagePerTick,
                        damage * profile.DotDamageRatio);
                    enemy.DotTickInterval =
                        profile.DotTickInterval;
                    enemy.DotTickRemaining =
                        profile.DotTickInterval;
                    enemy.DotRemaining = Math.Max(
                        enemy.DotRemaining,
                        profile.DotDuration);
                }

                if (hadDot
                    && profile.DotHitBurstDamageMultiplier > 0f)
                {
                    DamageArea(
                        state,
                        enemy.Position,
                        profile.DotHitBurstRadius,
                        BaseDamage(state)
                            * profile.DotHitBurstDamageMultiplier,
                        enemy.Id,
                        0f,
                        0f);
                }
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
                    AttackRange(state),
                    pickedStarts);
                if (start == null)
                {
                    break;
                }

                pickedStarts.Add(start.Id);
                Float2 currentOrigin = start.Position;
                float damage = BaseDamage(state);
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

        private void ApplyAvalanchePulse(
            GameState state,
            CardCombatProfile profile,
            float deltaTime)
        {
            if (profile.AvalancheInterval <= 0f)
            {
                return;
            }

            state.AvalanchePulseRemaining -= deltaTime;
            if (state.AvalanchePulseRemaining > 0f)
            {
                return;
            }

            var targets =
                new System.Collections.Generic.List<EnemyState>();
            foreach (EnemyState enemy in state.Enemies)
            {
                if (Float2.Distance(
                    TurretPosition,
                    enemy.Position) <= profile.AvalancheRadius)
                {
                    targets.Add(enemy);
                }
            }

            foreach (EnemyState enemy in targets)
            {
                DamageEnemy(
                    state,
                    enemy,
                    BaseDamage(state)
                        * profile.AvalancheDamageMultiplier);
                if (!state.Enemies.Contains(enemy))
                {
                    continue;
                }

                enemy.FrozenRemaining = Math.Max(
                    enemy.FrozenRemaining,
                    profile.AvalancheFreezeDuration);
                enemy.Position +=
                    (enemy.Position - TurretPosition).Normalized()
                    * profile.AvalancheKnockback;
            }

            state.AvalanchePulseRemaining +=
                profile.AvalancheInterval;
        }

        private void ApplyPermafrost(
            GameState state,
            CardCombatProfile profile,
            float deltaTime)
        {
            if (profile.PermafrostInterval <= 0f)
            {
                return;
            }

            state.PermafrostPulseRemaining -= deltaTime;
            if (state.PermafrostPulseRemaining > 0f)
            {
                return;
            }

            EnemyState target = FindTarget(state);
            if (target == null)
            {
                return;
            }

            int count = Math.Max(1, profile.PermafrostZoneCount);
            for (int index = 0; index < count; index++)
            {
                float offset = (index - (count - 1) / 2f)
                    * profile.PermafrostRadius;
                Float2 center = target.Position
                    + new Float2(offset, 0f);
                state.GroundZones.Add(new GroundZoneState(
                    center,
                    profile.PermafrostRadius,
                    profile.PermafrostDuration,
                    0.5f,
                    0f,
                    profile.PermafrostVulnerableRatio,
                    0.8f,
                    profile.PermafrostSlowRatio,
                    0.8f));
                if (profile.PermafrostFreezeDuration <= 0f)
                {
                    continue;
                }

                foreach (EnemyState enemy in state.Enemies)
                {
                    if (Float2.Distance(center, enemy.Position)
                        <= profile.PermafrostRadius)
                    {
                        enemy.FrozenRemaining = Math.Max(
                            enemy.FrozenRemaining,
                            profile.PermafrostFreezeDuration);
                    }
                }
            }

            state.PermafrostPulseRemaining +=
                profile.PermafrostInterval;
        }

        private void ApplyStormcall(
            GameState state,
            CardCombatProfile profile,
            float deltaTime)
        {
            if (profile.StormcallInterval <= 0f)
            {
                return;
            }

            state.StormcallPulseRemaining -= deltaTime;
            if (state.StormcallPulseRemaining > 0f)
            {
                return;
            }

            EnemyState target = FindTarget(state);
            if (target == null)
            {
                return;
            }

            Float2 center = target.Position;
            int strikes = Math.Max(1, profile.StormcallStrikeCount);
            for (int index = 0; index < strikes; index++)
            {
                if (profile.StormcallDamageRatio > 0f)
                {
                    DamageArea(
                        state,
                        center,
                        profile.StormcallRadius,
                        BaseDamage(state)
                            * profile.StormcallDamageRatio,
                        -1,
                        0f,
                        0f,
                        0f,
                        profile.StormcallFalloff);
                }
            }

            if (profile.StormcallZoneDuration > 0f)
            {
                state.GroundZones.Add(new GroundZoneState(
                    center,
                    profile.StormcallRadius,
                    profile.StormcallZoneDuration,
                    Math.Max(
                        0.1f,
                        profile.StormcallZoneTickInterval),
                    BaseDamage(state)
                        * profile.StormcallZoneDamageRatio,
                    profile.StormcallZoneVulnerableRatio,
                    0.7f));
            }

            state.StormcallPulseRemaining +=
                profile.StormcallInterval;
        }

        private void ApplyKillCardEffects(
            GameState state,
            CardCombatProfile profile,
            Float2 deathPosition)
        {
            if (profile.KillFireRateMultiplier > 1f
                && profile.KillFireRateMaxStacks > 0)
            {
                state.KillFireRateStacks = Math.Min(
                    profile.KillFireRateMaxStacks,
                    state.KillFireRateStacks + 1);
                state.FireRateMultiplier = Math.Max(
                    state.FireRateMultiplier,
                    (float)Math.Pow(
                        profile.KillFireRateMultiplier,
                        state.KillFireRateStacks));
                state.FireRateBuffRemaining = Math.Max(
                    state.FireRateBuffRemaining,
                    profile.KillFireRateDuration);
            }

            if (profile.KillRestore > 0f)
            {
                state.RestoreHp(profile.KillRestore);
            }

            if (profile.KillVulnerableRadius > 0f)
            {
                foreach (EnemyState nearby in state.Enemies)
                {
                    if (Float2.Distance(
                        deathPosition,
                        nearby.Position)
                        > profile.KillVulnerableRadius)
                    {
                        continue;
                    }

                    nearby.VulnerableRatio = Math.Max(
                        nearby.VulnerableRatio,
                        profile.KillVulnerableRatio);
                    nearby.VulnerableRemaining = Math.Max(
                        nearby.VulnerableRemaining,
                        profile.KillVulnerableDuration);
                }
            }

            if (profile.KillBurstRadius > 0f
                && profile.KillBurstDamageMultiplier > 0f)
            {
                DamageArea(
                    state,
                    deathPosition,
                    profile.KillBurstRadius,
                    BaseDamage(state)
                        * profile.KillBurstDamageMultiplier,
                    -1,
                    0f,
                    0f);
            }
        }

        private void ApplyDotKillCardEffects(
            GameState state,
            CardCombatProfile profile,
            Float2 deathPosition)
        {
            if (profile.DotKillExtraDropChance > 0f)
            {
                _drops?.TrySpawnBonus(
                    state,
                    deathPosition,
                    profile.DotKillExtraDropChance);
            }

            if (profile.DotKillRestore > 0f)
            {
                state.RestoreHp(profile.DotKillRestore);
            }

            if (profile.DotKillDamageMultiplier > 1f
                && profile.DotKillDamageMaxStacks > 0)
            {
                state.DamageBuffStacks = Math.Min(
                    profile.DotKillDamageMaxStacks,
                    state.DamageBuffStacks + 1);
                state.DamageMultiplier = (float)Math.Pow(
                    profile.DotKillDamageMultiplier,
                    state.DamageBuffStacks);
                state.DamageBuffRemaining = Math.Max(
                    state.DamageBuffRemaining,
                    3f);
            }

            if (profile.DotKillXpMultiplier > 1f)
            {
                state.KillXpBuffMultiplier = Math.Max(
                    state.KillXpBuffMultiplier,
                    profile.DotKillXpMultiplier);
                state.KillXpBuffRemaining = Math.Max(
                    state.KillXpBuffRemaining,
                    profile.DotKillXpDuration);
            }
        }

        private void ApplyMeteorHit(
            GameState state,
            BulletState bullet,
            Float2 hitPosition,
            int excludedEnemyId)
        {
            CardCombatProfile profile = CardEffectResolver.Resolve(state);
            if (profile.MeteorChance <= 0f)
            {
                return;
            }

            float roll = ((bullet.Id * 37) % 100) / 100f;
            if (roll >= profile.MeteorChance)
            {
                return;
            }

            for (int index = 0;
                index < Math.Max(1, profile.MeteorCount);
                index++)
            {
                float offset = (
                    index - (profile.MeteorCount - 1) / 2f)
                    * profile.MeteorRadius * 0.45f;
                Float2 center =
                    hitPosition + new Float2(offset, 0f);
                DamageArea(
                    state,
                    center,
                    profile.MeteorRadius,
                    BaseDamage(state) * profile.MeteorDamageRatio,
                    excludedEnemyId,
                    0f,
                    0f,
                    0f,
                    profile.MeteorFalloff);
                if (profile.MeteorZoneDuration > 0f)
                {
                    state.GroundZones.Add(new GroundZoneState(
                        center,
                        profile.MeteorRadius,
                        profile.MeteorZoneDuration,
                        0.5f,
                        BaseDamage(state)
                            * profile.MeteorZoneDamageRatio,
                        0f,
                        0f));
                }
            }
        }

        private void ApplyMeteor(
            GameState state,
            CardCombatProfile profile,
            float deltaTime)
        {
            if (profile.MeteorInterval <= 0f)
            {
                return;
            }

            state.MeteorPulseRemaining -= deltaTime;
            if (state.MeteorPulseRemaining > 0f)
            {
                return;
            }

            EnemyState target = FindTarget(state);
            if (target == null)
            {
                return;
            }

            for (int index = 0; index < profile.MeteorCount; index++)
            {
                float offset = (
                    index - (profile.MeteorCount - 1) / 2f)
                    * profile.MeteorRadius * 0.45f;
                DamageArea(
                    state,
                    target.Position + new Float2(offset, 0f),
                    profile.MeteorRadius,
                    BaseDamage(state) * profile.MeteorDamageRatio,
                    -1,
                    0f,
                    0f,
                    0f,
                    profile.MeteorFalloff);
            }

            state.MeteorPulseRemaining += profile.MeteorInterval;
        }

        private void ApplyMagmaPool(
            GameState state,
            CardCombatProfile profile,
            float deltaTime)
        {
            if (profile.MagmaInterval <= 0f
                && profile.MagmaAuraRadius <= 0f)
            {
                return;
            }

            state.MagmaPulseRemaining -= deltaTime;
            if (state.MagmaPulseRemaining > 0f)
            {
                return;
            }

            if (profile.MagmaAuraRadius > 0f)
            {
                DamageArea(
                    state,
                    TurretPosition,
                    profile.MagmaAuraRadius,
                    BaseDamage(state)
                        * profile.MagmaDamageRatio
                        * profile.DotDamageMultiplier,
                    -1,
                    0f,
                    0f);
                foreach (EnemyState enemy in state.Enemies)
                {
                    if (Float2.Distance(
                        TurretPosition,
                        enemy.Position) <= profile.MagmaAuraRadius)
                    {
                        enemy.VulnerableRatio = Math.Max(
                            enemy.VulnerableRatio,
                            profile.MagmaVulnerableRatio);
                        enemy.VulnerableRemaining = Math.Max(
                            enemy.VulnerableRemaining,
                            0.6f);
                    }
                }
                state.MagmaPulseRemaining +=
                    profile.MagmaTickInterval;
                return;
            }

            EnemyState target = FindTarget(state);
            if (target == null)
            {
                return;
            }

            for (int index = 0;
                index < Math.Max(1, profile.MagmaZoneCount);
                index++)
            {
                float offset = (
                    index - (profile.MagmaZoneCount - 1) / 2f)
                    * profile.MagmaRadius;
                state.GroundZones.Add(new GroundZoneState(
                    target.Position + new Float2(offset, 0f),
                    profile.MagmaRadius,
                    profile.MagmaDuration,
                    profile.MagmaTickInterval,
                    BaseDamage(state)
                        * profile.MagmaDamageRatio
                        * profile.DotDamageMultiplier,
                    profile.MagmaVulnerableRatio,
                    0.6f,
                    profile.MagmaSlowRatio,
                    0.7f));
            }

            state.MagmaPulseRemaining += profile.MagmaInterval;
        }

        private void ApplyFlashfire(
            GameState state,
            CardCombatProfile profile,
            float deltaTime)
        {
            if (profile.FlashfireInterval <= 0f)
            {
                return;
            }

            state.FlashfirePulseRemaining -= deltaTime;
            if (state.FlashfirePulseRemaining > 0f)
            {
                return;
            }

            ApplyAreaKnockback(
                state,
                TurretPosition,
                profile.FlashfireRadius,
                profile.FlashfireKnockback,
                0f);
            ApplyAreaDot(
                state,
                TurretPosition,
                profile.FlashfireRadius,
                BaseDamage(state)
                    * profile.FlashfireDotRatio
                    * profile.DotDamageMultiplier,
                0.5f,
                profile.FlashfireDotDuration);
            state.FlashfirePulseRemaining +=
                profile.FlashfireInterval;
        }

        private void ApplyCinderheart(
            GameState state,
            CardCombatProfile profile,
            float deltaTime)
        {
            if (profile.CinderheartRestoreInterval <= 0f)
            {
                return;
            }

            state.CinderheartPulseRemaining -= deltaTime;
            if (state.CinderheartPulseRemaining > 0f)
            {
                return;
            }

            state.RestoreHp(
                state.MaxHp * profile.CinderheartRestoreRatio);
            state.CinderheartPulseRemaining +=
                profile.CinderheartRestoreInterval;
        }

        private static void ApplyAreaDot(
            GameState state,
            Float2 center,
            float radius,
            float damagePerTick,
            float tickInterval,
            float duration)
        {
            foreach (EnemyState enemy in state.Enemies)
            {
                if (Float2.Distance(center, enemy.Position) > radius)
                {
                    continue;
                }

                enemy.DotDamagePerTick = Math.Max(
                    enemy.DotDamagePerTick,
                    damagePerTick);
                enemy.DotTickInterval = tickInterval;
                enemy.DotTickRemaining = tickInterval;
                enemy.DotRemaining = Math.Max(
                    enemy.DotRemaining,
                    duration);
            }
        }

        private static void MarkArea(
            GameState state,
            Float2 center,
            float radius,
            float vulnerableRatio,
            float duration,
            float focusWeight,
            float focusDuration,
            float slowRatio)
        {
            foreach (EnemyState enemy in state.Enemies)
            {
                if (Float2.Distance(center, enemy.Position) > radius)
                {
                    continue;
                }

                if (vulnerableRatio > 0f)
                {
                    enemy.VulnerableRatio = Math.Max(
                        enemy.VulnerableRatio,
                        vulnerableRatio);
                    enemy.VulnerableRemaining = Math.Max(
                        enemy.VulnerableRemaining,
                        duration);
                }
                if (focusWeight > 1f)
                {
                    enemy.FocusPriorityWeight = Math.Max(
                        enemy.FocusPriorityWeight,
                        focusWeight);
                    enemy.FocusPriorityRemaining = Math.Max(
                        enemy.FocusPriorityRemaining,
                        focusDuration);
                }
                if (slowRatio > 0f)
                {
                    enemy.SlowRatio = Math.Max(
                        enemy.SlowRatio,
                        slowRatio);
                    enemy.SlowRemaining = Math.Max(
                        enemy.SlowRemaining,
                        duration);
                }
            }
        }

        private void ApplyBountyCall(
            GameState state,
            CardCombatProfile profile,
            float deltaTime)
        {
            if (profile.BountyInterval <= 0f)
            {
                return;
            }

            state.BountyPulseRemaining -= deltaTime;
            if (state.BountyPulseRemaining > 0f)
            {
                return;
            }

            MarkArea(
                state,
                TurretPosition,
                float.MaxValue,
                profile.BountyVulnerableRatio,
                profile.BountyInterval + 0.1f,
                profile.BountyFocusWeight,
                profile.BountyInterval + 0.1f,
                profile.BountySlowRatio);
            state.BountyPulseRemaining += profile.BountyInterval;
        }

        private void ApplyOvergrowth(
            GameState state,
            CardCombatProfile profile,
            float deltaTime)
        {
            if (profile.OvergrowthInterval <= 0f)
            {
                return;
            }

            state.OvergrowthPulseRemaining -= deltaTime;
            if (state.OvergrowthPulseRemaining > 0f)
            {
                return;
            }

            EnemyState target = FindTarget(state);
            if (target == null)
            {
                return;
            }

            for (int index = 0;
                index < Math.Max(1, profile.OvergrowthZoneCount);
                index++)
            {
                float offset = (
                    index - (profile.OvergrowthZoneCount - 1) / 2f)
                    * profile.OvergrowthRadius;
                Float2 center =
                    target.Position + new Float2(offset, 0f);
                state.GroundZones.Add(new GroundZoneState(
                    center,
                    profile.OvergrowthRadius,
                    profile.OvergrowthDuration,
                    0.5f,
                    0f,
                    profile.OvergrowthVulnerableRatio,
                    0.8f,
                    profile.OvergrowthSlowRatio,
                    0.8f));
                if (profile.OvergrowthStunDuration > 0f)
                {
                    ApplyAreaKnockback(
                        state,
                        center,
                        profile.OvergrowthRadius,
                        0f,
                        profile.OvergrowthStunDuration);
                }
            }

            state.OvergrowthPulseRemaining +=
                profile.OvergrowthInterval;
        }

        private static void ApplySpringOfLife(
            GameState state,
            CardCombatProfile profile,
            float deltaTime)
        {
            if (profile.SpringRestoreInterval <= 0f)
            {
                return;
            }

            state.SpringPulseRemaining -= deltaTime;
            if (state.SpringPulseRemaining > 0f)
            {
                return;
            }

            state.RestoreHp(state.MaxHp * profile.SpringRestoreRatio);
            state.SpringPulseRemaining +=
                profile.SpringRestoreInterval;
        }

        private void ApplyPyrestorm(
            GameState state,
            CardCombatProfile profile,
            float deltaTime)
        {
            for (int index = state.GroundZones.Count - 1;
                index >= 0;
                index--)
            {
                GroundZoneState zone = state.GroundZones[index];
                zone.LifeRemaining -= deltaTime;
                zone.TickRemaining -= deltaTime;
                while (zone.TickRemaining <= 0f
                    && zone.LifeRemaining > 0f)
                {
                    zone.TickRemaining += zone.TickInterval;
                    var targets =
                        new System.Collections.Generic.List<EnemyState>();
                    foreach (EnemyState enemy in state.Enemies)
                    {
                        if (Float2.Distance(
                            zone.Position,
                            enemy.Position) <= zone.Radius)
                        {
                            targets.Add(enemy);
                        }
                    }

                    foreach (EnemyState enemy in targets)
                    {
                        DamageEnemy(
                            state,
                            enemy,
                            zone.DamagePerTick);
                        if (!state.Enemies.Contains(enemy))
                        {
                            continue;
                        }

                        enemy.VulnerableRatio = Math.Max(
                            enemy.VulnerableRatio,
                            zone.VulnerableRatio);
                        enemy.VulnerableRemaining = Math.Max(
                            enemy.VulnerableRemaining,
                            zone.VulnerableDuration);
                        enemy.SlowRatio = Math.Max(
                            enemy.SlowRatio,
                            zone.SlowRatio);
                        enemy.SlowRemaining = Math.Max(
                            enemy.SlowRemaining,
                            zone.SlowDuration);
                        enemy.FocusPriorityWeight = Math.Max(
                            enemy.FocusPriorityWeight,
                            zone.FocusPriorityWeight);
                        enemy.FocusPriorityRemaining = Math.Max(
                            enemy.FocusPriorityRemaining,
                            zone.LifeRemaining);
                        if (zone.ExecuteThresholdRatio > 0f
                            && enemy.Hp / enemy.MaxHp
                                <= zone.ExecuteThresholdRatio)
                        {
                            DamageEnemy(state, enemy, enemy.Hp);
                        }
                    }
                }

                if (zone.LifeRemaining <= 0f)
                {
                    state.GroundZones.RemoveAt(index);
                }
            }

            if (profile.PyrestormInterval <= 0f)
            {
                return;
            }

            state.PyrestormPulseRemaining -= deltaTime;
            if (state.PyrestormPulseRemaining > 0f)
            {
                return;
            }

            EnemyState target = FindTarget(state);
            if (target == null)
            {
                return;
            }

            Float2 center = target.Position;
            DamageArea(
                state,
                center,
                profile.PyrestormRadius,
                BaseDamage(state)
                    * profile.PyrestormDamageRatio,
                -1,
                0f,
                0f,
                0f,
                profile.PyrestormFalloff);
            state.GroundZones.Add(new GroundZoneState(
                center,
                profile.PyrestormRadius,
                profile.PyrestormZoneDuration,
                profile.PyrestormZoneTickInterval,
                BaseDamage(state)
                    * profile.PyrestormZoneDamageRatio,
                profile.PyrestormZoneVulnerableRatio,
                profile.PyrestormZoneVulnerableDuration));
            state.PyrestormPulseRemaining +=
                profile.PyrestormInterval;
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
                * (1f - profile.BreachReductionRatio)
                / Math.Max(1f, state.DefenseDurabilityMultiplier));
            ApplyBreachReaction(state, profile);
            ApplyImpactBreachReaction(state, profile);
            ApplyThornsAdvancedBreachEffects(state, profile);
            if (profile.BreachRestoreRatio > 0f)
            {
                state.RestoreHp(
                    state.MaxHp * profile.BreachRestoreRatio);
            }
            if (profile.BreachDotDamageRatio > 0f)
            {
                ApplyAreaDot(
                    state,
                    TurretPosition,
                    Math.Max(100f, profile.BreachBurstRadius),
                    BaseDamage(state)
                        * profile.BreachDotDamageRatio
                        * profile.DotDamageMultiplier,
                    0.5f,
                    profile.BreachDotDuration);
            }
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

            float damage = BaseDamage(state)
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
                    BaseDamage(state)
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
                || !state.DecoyIsMirrorTurret
                || state.DecoyFireInterval <= 0f)
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
                AttackRange(state)
                    * state.DecoyFireRangeRatio,
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
                BaseDamage(state)
                    * state.DecoyDamageRatio));
            state.DecoyFireCooldown +=
                state.DecoyFireInterval;
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

            if (pendingMergeStars > 0)
            {
                if (profile.MergeVulnerableRatio > 0f
                    || profile.MergeSlowRatio > 0f)
                {
                    MarkArea(
                        state,
                        TurretPosition,
                        float.MaxValue,
                        profile.MergeVulnerableRatio,
                        Math.Max(
                            profile.MergeVulnerableDuration,
                            profile.MergeSlowDuration),
                        1f,
                        0f,
                        profile.MergeSlowRatio);
                }
                if (profile.MergeRestoreRatio > 0f)
                {
                    state.RestoreHp(
                        state.MaxHp * profile.MergeRestoreRatio);
                }
                if (profile.MergeDamageMultiplier > 1f)
                {
                    state.DamageMultiplier = Math.Max(
                        state.DamageMultiplier,
                        profile.MergeDamageMultiplier);
                    state.DamageBuffRemaining = Math.Max(
                        state.DamageBuffRemaining,
                        profile.MergeDamageDuration);
                }
                if (profile.MergeFireRateMultiplier > 1f)
                {
                    state.FireRateMultiplier = Math.Max(
                        state.FireRateMultiplier,
                        profile.MergeFireRateMultiplier);
                    state.FireRateBuffRemaining = Math.Max(
                        state.FireRateBuffRemaining,
                        profile.MergeFireRateDuration);
                }
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
                AttackRange(state) * behavior.orbitStartRangeRatio,
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
            EnemyState bountyClosest = null;
            EnemyState emergencyClosest = null;
            float closestScore = float.MaxValue;
            float bountyDistance = float.MaxValue;
            float emergencyDistance = float.MaxValue;
            CardCombatProfile profile =
                CardEffectResolver.Resolve(state);
            float auraRadius =
                AttackRange(state) * profile.AuraRadiusRatio;

            foreach (EnemyState enemy in state.Enemies)
            {
                float distance = Float2.Distance(turret, enemy.Position);
                if (distance > AttackRange(state))
                {
                    continue;
                }

                if (_bounties != null
                    && distance <= _bounties.EmergencyOverrideDistance
                    && distance < emergencyDistance)
                {
                    emergencyClosest = enemy;
                    emergencyDistance = distance;
                }

                if (enemy.BountyEncounterId.HasValue
                    && distance < bountyDistance)
                {
                    bountyClosest = enemy;
                    bountyDistance = distance;
                }

                float priority = enemy.FocusPriorityRemaining > 0f
                    ? enemy.FocusPriorityWeight
                    : 1f;
                if (profile.AuraFocusPriorityWeight > 1f
                    && distance <= auraRadius
                    && enemy.Hp / enemy.MaxHp
                        <= profile.AuraFocusHpThresholdRatio)
                {
                    priority = profile.AuraFocusPriorityWeight;
                }

                float score = distance / priority;
                if (score < closestScore)
                {
                    closest = enemy;
                    closestScore = score;
                }
            }

            return emergencyClosest ?? bountyClosest ?? closest;
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
