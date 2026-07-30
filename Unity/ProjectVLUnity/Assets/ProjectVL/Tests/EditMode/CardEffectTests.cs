using NUnit.Framework;
using ProjectVL.Config;
using ProjectVL.Core;
using ProjectVL.Systems;

namespace ProjectVL.Tests
{
    public sealed class CardEffectTests
    {
        private CombatConfig _combat;
        private EnemiesConfig _enemies;
        private GameState _state;
        private CombatSystem _system;
        private int _nextEnemyId;
        private int _nextBulletId;

        [SetUp]
        public void SetUp()
        {
            _combat = CombatConfigLoader.LoadDefault();
            _enemies = GameConfigLoader.LoadEnemies();
            _state = GameStateFactory.Create(_combat);
            _system = new CombatSystem(_combat, _enemies);
            _nextEnemyId = 1;
            _nextBulletId = 1;
        }

        [Test]
        public void PierceRouteUsesWebParameters()
        {
            EquipResolved("pierce", 3, "3:pierceB");

            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            Assert.That(profile.PierceCount, Is.EqualTo(1));
            Assert.That(profile.PierceDamageRetention, Is.EqualTo(0.9f));
            Assert.That(profile.RampPerPierce, Is.EqualTo(0.3f));
        }

        [Test]
        public void ChainRouteUsesWebParameters()
        {
            EquipResolved(
                "chainLightning",
                3,
                "3:chainLightningA");

            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            Assert.That(profile.ChainBounces, Is.EqualTo(2));
            Assert.That(profile.ChainDamageRetention, Is.EqualTo(0.7f));
            Assert.That(profile.ChainSearchRange, Is.EqualTo(120f));
            Assert.That(profile.SlowRatio, Is.EqualTo(0.2f));
            Assert.That(profile.SlowDuration, Is.EqualTo(1.2f));
        }

        [Test]
        public void FrostFocusRouteFreezesOnSecondHit()
        {
            EquipResolved("frost", 3, "3:frostB");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            EnemyState enemy = AddEnemy(new Float2(200f, 200f), 100f);

            HitWithProfile(enemy.Position, profile);
            HitWithProfile(enemy.Position, profile);

            Assert.That(enemy.SlowRatio, Is.EqualTo(0.3f));
            Assert.That(enemy.FrozenRemaining, Is.EqualTo(0.8f));
            Assert.That(enemy.FreezeStacks, Is.Zero);
        }

        [Test]
        public void FrostDomainRouteCreatesSlowZoneOnHit()
        {
            EquipResolved("frost", 3, "3:frostC");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            EnemyState enemy = AddEnemy(new Float2(200f, 200f), 100f);

            HitWithProfile(enemy.Position, profile);

            Assert.That(_state.GroundZones, Has.Count.EqualTo(1));
            GroundZoneState zone = _state.GroundZones[0];
            Assert.That(zone.Radius, Is.EqualTo(45f));
            Assert.That(zone.LifeRemaining, Is.EqualTo(1.5f));
            Assert.That(zone.SlowRatio, Is.EqualTo(0.25f));
            Assert.That(zone.SlowDuration, Is.EqualTo(0.7f));
        }

        [Test]
        public void ChainLightningDamagesNearbyTargets()
        {
            EquipResolved(
                "chainLightning",
                3,
                "3:chainLightningA");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            EnemyState primary = AddEnemy(new Float2(200f, 200f), 100f);
            EnemyState secondary = AddEnemy(new Float2(250f, 200f), 100f);

            HitWithProfile(primary.Position, profile);

            Assert.That(primary.Hp, Is.EqualTo(90f));
            Assert.That(secondary.Hp, Is.EqualTo(93f).Within(0.001f));
            Assert.That(secondary.SlowRemaining, Is.EqualTo(1.2f));
        }

        [Test]
        public void PierceBulletSurvivesItsFirstHit()
        {
            EquipResolved("pierce", 3, "3:pierceA");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            EnemyState enemy = AddEnemy(new Float2(200f, 200f), 100f);

            HitWithProfile(enemy.Position, profile);

            Assert.That(enemy.Hp, Is.EqualTo(90f));
            Assert.That(_state.Bullets, Has.Count.EqualTo(1));
            Assert.That(_state.Bullets[0].PierceRemaining, Is.EqualTo(1));
            Assert.That(_state.Bullets[0].Damage, Is.EqualTo(8.8f).Within(0.001f));
        }

        [Test]
        public void PierceFiveStarRoutesExposeWebParameters()
        {
            EquipResolved(
                "pierce",
                5,
                "3:pierceA",
                "5:pierceA2");
            CardCombatProfile ricochet =
                CardEffectResolver.Resolve(_state);

            Assert.That(ricochet.PierceCount, Is.EqualTo(3));
            Assert.That(
                ricochet.PierceDamageRetention,
                Is.EqualTo(0.9f).Within(0.001f));
            Assert.That(ricochet.RicochetBounces, Is.EqualTo(1));

            EquipResolved(
                "pierce",
                5,
                "3:pierceB",
                "5:pierceB2");
            CardCombatProfile ramp =
                CardEffectResolver.Resolve(_state);

            Assert.That(ramp.PierceCount, Is.EqualTo(3));
            Assert.That(ramp.PierceDamageRetention, Is.EqualTo(1f));
            Assert.That(
                ramp.RampPerPierce,
                Is.EqualTo(0.55f).Within(0.001f));

            EquipResolved(
                "pierce",
                5,
                "3:pierceC",
                "5:pierceC2");
            CardCombatProfile split =
                CardEffectResolver.Resolve(_state);

            Assert.That(split.SplitCount, Is.EqualTo(2));
            Assert.That(split.SplitDamageRatio, Is.EqualTo(0.6f));
        }

        [Test]
        public void PierceRicochetRetargetsAfterFinalPenetration()
        {
            EquipResolved(
                "pierce",
                5,
                "3:pierceA",
                "5:pierceA2");
            CardCombatProfile profile =
                CardEffectResolver.Resolve(_state);
            EnemyState primary = AddEnemy(
                new Float2(200f, 200f),
                100f);
            EnemyState secondary = AddEnemy(
                new Float2(260f, 200f),
                100f);
            var bullet = new BulletState(
                _nextBulletId++,
                primary.Position,
                new Float2(100f, 0f),
                5f,
                2f,
                10f,
                profile);
            bullet.PierceRemaining = 0;
            _state.Bullets.Add(bullet);

            _system.StepBullets(_state, 0f);
            _system.StepBullets(_state, 0.6f);

            Assert.That(primary.Hp, Is.EqualTo(90f));
            Assert.That(secondary.Hp, Is.EqualTo(90f));
            Assert.That(bullet.RicochetRemaining, Is.Zero);
        }

        [Test]
        public void ChainFiveStarRoutesExposeWebParameters()
        {
            EquipResolved(
                "chainLightning",
                5,
                "3:chainLightningA",
                "5:chainLightningA2");
            CardCombatProfile killArc =
                CardEffectResolver.Resolve(_state);

            Assert.That(killArc.ChainBounces, Is.EqualTo(3));
            Assert.That(killArc.ChainSearchRange, Is.EqualTo(140f));
            Assert.That(killArc.ChainKillBounces, Is.EqualTo(2));
            Assert.That(
                killArc.ChainKillDamageRetention,
                Is.EqualTo(0.5f));

            EquipResolved(
                "chainLightning",
                5,
                "3:chainLightningB",
                "5:chainLightningB2");
            CardCombatProfile charged =
                CardEffectResolver.Resolve(_state);
            Assert.That(charged.DotDamageRatio, Is.EqualTo(0.08f));
            Assert.That(charged.DotDuration, Is.EqualTo(2f));

            EquipResolved(
                "chainLightning",
                5,
                "3:chainLightningC",
                "5:chainLightningC2");
            CardCombatProfile burst =
                CardEffectResolver.Resolve(_state);
            Assert.That(burst.SplashRadius, Is.EqualTo(65f));
            Assert.That(burst.SplashDamageRatio, Is.EqualTo(0.65f));
        }

        [Test]
        public void ChainKillArcDamagesTargetsBeyondOriginalChain()
        {
            var profile = new CardCombatProfile
            {
                ChainBounces = 1,
                ChainDamageRetention = 1f,
                ChainSearchRange = 120f,
                ChainKillBounces = 2,
                ChainKillDamageRetention = 0.5f,
                ChainKillSearchRange = 140f
            };
            EnemyState primary = AddEnemy(
                new Float2(200f, 200f),
                100f);
            AddEnemy(new Float2(240f, 200f), 5f);
            EnemyState extra = AddEnemy(
                new Float2(280f, 200f),
                100f);

            HitWithProfile(primary.Position, profile);

            Assert.That(extra.Hp, Is.EqualTo(95f).Within(0.001f));
        }

        [Test]
        public void FrostFiveStarRoutesExposeWebParameters()
        {
            EquipResolved(
                "frost",
                5,
                "3:frostA",
                "5:frostA2");
            CardCombatProfile shards =
                CardEffectResolver.Resolve(_state);

            Assert.That(shards.SlowRatio, Is.EqualTo(0.4f));
            Assert.That(shards.FreezeStacksToTrigger, Is.EqualTo(2));
            Assert.That(shards.FrozenKillSplashRadius, Is.EqualTo(80f));
            Assert.That(
                shards.FrozenKillSplashDamageRatio,
                Is.EqualTo(0.5f));
            Assert.That(shards.FrozenKillSlowRatio, Is.EqualTo(0.3f));

            EquipResolved(
                "frost",
                5,
                "3:frostB",
                "5:frostB2");
            CardCombatProfile burst =
                CardEffectResolver.Resolve(_state);

            Assert.That(burst.FreezeStacksToTrigger, Is.EqualTo(1));
            Assert.That(burst.FrozenKillSplashRadius, Is.EqualTo(90f));
            Assert.That(
                burst.FrozenKillSplashDamageRatio,
                Is.EqualTo(0.8f));

            EquipResolved(
                "frost",
                5,
                "3:frostC",
                "5:frostC2");
            CardCombatProfile brittle =
                CardEffectResolver.Resolve(_state);
            Assert.That(
                brittle.FrozenHitVulnerableRatio,
                Is.EqualTo(0.16f));
            Assert.That(
                brittle.FrozenHitVulnerableDuration,
                Is.EqualTo(2f));
        }

        [Test]
        public void FrozenKillShattersAndDamagesNearbyEnemies()
        {
            EquipResolved(
                "frost",
                5,
                "3:frostB",
                "5:frostB2");
            CardCombatProfile profile =
                CardEffectResolver.Resolve(_state);
            EnemyState frozen = AddEnemy(
                new Float2(200f, 200f),
                5f);
            frozen.FrozenRemaining = 1f;
            EnemyState nearby = AddEnemy(
                new Float2(250f, 200f),
                100f);

            HitWithProfile(frozen.Position, profile);

            Assert.That(_state.Enemies.Contains(frozen), Is.False);
            Assert.That(
                nearby.Hp,
                Is.EqualTo(
                    100f - _combat.defaults.damage * 0.8f)
                    .Within(0.001f));
        }

        [Test]
        public void FrostBrittleAppliesVulnerabilityOnlyAfterFreeze()
        {
            EquipResolved(
                "frost",
                5,
                "3:frostC",
                "5:frostC2");
            CardCombatProfile profile =
                CardEffectResolver.Resolve(_state);
            EnemyState enemy = AddEnemy(
                new Float2(200f, 200f),
                100f);

            HitWithProfile(enemy.Position, profile);
            Assert.That(enemy.VulnerableRatio, Is.Zero);

            HitWithProfile(enemy.Position, profile);
            Assert.That(enemy.FrozenRemaining, Is.EqualTo(0.8f));
            Assert.That(enemy.VulnerableRatio, Is.EqualTo(0.16f));
            Assert.That(enemy.VulnerableRemaining, Is.EqualTo(2f));
        }

        [Test]
        public void ScorchFiveStarRoutesExposeWebParameters()
        {
            EquipResolved(
                "scorch",
                5,
                "3:scorchA",
                "5:scorchA2");
            CardCombatProfile area =
                CardEffectResolver.Resolve(_state);

            Assert.That(area.DotAreaRadius, Is.EqualTo(50f));
            Assert.That(
                area.DotDamageRatio,
                Is.EqualTo(0.195f).Within(0.001f));
            Assert.That(
                area.DotAreaVulnerableRatio,
                Is.EqualTo(0.15f));

            EquipResolved(
                "scorch",
                5,
                "3:scorchB",
                "5:scorchB2");
            CardCombatProfile brittle =
                CardEffectResolver.Resolve(_state);
            Assert.That(
                brittle.DotHitVulnerableRatio,
                Is.EqualTo(0.16f));

            EquipResolved(
                "scorch",
                5,
                "3:scorchC",
                "5:scorchC2");
            CardCombatProfile fastBurn =
                CardEffectResolver.Resolve(_state);
            Assert.That(
                fastBurn.SecondaryDotDamageRatio,
                Is.EqualTo(0.075f));
            Assert.That(
                fastBurn.SecondaryDotTickInterval,
                Is.EqualTo(0.25f));
            Assert.That(fastBurn.SecondaryDotDuration, Is.EqualTo(2f));
        }

        [Test]
        public void ScorchBrittleRequiresAnExistingBurn()
        {
            EquipResolved(
                "scorch",
                5,
                "3:scorchB",
                "5:scorchB2");
            CardCombatProfile profile =
                CardEffectResolver.Resolve(_state);
            EnemyState enemy = AddEnemy(
                new Float2(200f, 200f),
                100f);

            HitWithProfile(enemy.Position, profile);
            Assert.That(enemy.VulnerableRatio, Is.Zero);

            HitWithProfile(enemy.Position, profile);
            Assert.That(enemy.VulnerableRatio, Is.EqualTo(0.16f));
            Assert.That(enemy.VulnerableRemaining, Is.EqualTo(2f));
        }

        [Test]
        public void ScorchFastBurnTicksIndependently()
        {
            EquipResolved(
                "scorch",
                5,
                "3:scorchC",
                "5:scorchC2");
            CardCombatProfile profile =
                CardEffectResolver.Resolve(_state);
            EnemyState enemy = AddEnemy(
                new Float2(200f, 200f),
                100f);

            HitWithProfile(enemy.Position, profile);
            _system.StepEnemies(_state, 0.25f);

            Assert.That(
                enemy.Hp,
                Is.EqualTo(89.25f).Within(0.001f));
            Assert.That(enemy.DotRemaining, Is.GreaterThan(0f));
            Assert.That(
                enemy.SecondaryDotRemaining,
                Is.GreaterThan(0f));
        }

        [Test]
        public void SplitBlastFiveStarRoutesExposeWebParameters()
        {
            EquipResolved(
                "splitBlast",
                5,
                "3:splitBlastA",
                "5:splitBlastA2");
            CardCombatProfile recursive =
                CardEffectResolver.Resolve(_state);

            Assert.That(recursive.SplitCount, Is.EqualTo(3));
            Assert.That(recursive.SplashRadius, Is.EqualTo(50f));
            Assert.That(recursive.RecursiveSplitCount, Is.EqualTo(2));
            Assert.That(
                recursive.RecursiveSplitDamageRatio,
                Is.EqualTo(0.5f));

            EquipResolved(
                "splitBlast",
                5,
                "3:splitBlastB",
                "5:splitBlastB2");
            CardCombatProfile doubleBlast =
                CardEffectResolver.Resolve(_state);
            Assert.That(doubleBlast.SecondarySplashRadius, Is.EqualTo(100f));
            Assert.That(
                doubleBlast.SecondarySplashDamageRatio,
                Is.EqualTo(0.65f));

            EquipResolved(
                "splitBlast",
                5,
                "3:splitBlastC",
                "5:splitBlastC2");
            CardCombatProfile shock =
                CardEffectResolver.Resolve(_state);
            Assert.That(shock.HitAreaKnockbackRadius, Is.EqualTo(87.5f));
            Assert.That(shock.HitAreaKnockbackDistance, Is.EqualTo(45f));
        }

        [Test]
        public void RecursiveSplitReachesASecondGeneration()
        {
            var profile = new CardCombatProfile
            {
                SplitCount = 1,
                SplitDamageRatio = 0.5f,
                RecursiveSplitCount = 1,
                RecursiveSplitDamageRatio = 0.5f
            };
            EnemyState primary = AddEnemy(
                new Float2(200f, 200f),
                100f);
            EnemyState child = AddEnemy(
                new Float2(240f, 200f),
                100f);
            EnemyState grandchild = AddEnemy(
                new Float2(280f, 200f),
                100f);

            HitWithProfile(primary.Position, profile);

            Assert.That(child.Hp, Is.EqualTo(95f));
            Assert.That(grandchild.Hp, Is.EqualTo(97.5f));
        }

        [Test]
        public void SecondaryBlastReachesOutsideBaseRadius()
        {
            var profile = new CardCombatProfile
            {
                SplashRadius = 50f,
                SplashDamageRatio = 1f,
                SecondarySplashRadius = 100f,
                SecondarySplashDamageRatio = 0.65f
            };
            EnemyState primary = AddEnemy(
                new Float2(200f, 200f),
                100f);
            EnemyState outer = AddEnemy(
                new Float2(270f, 200f),
                100f);

            HitWithProfile(primary.Position, profile);

            Assert.That(outer.Hp, Is.EqualTo(93.5f).Within(0.001f));
        }

        [Test]
        public void ImpactFiveStarRoutesExposeWebParameters()
        {
            EquipResolved(
                "impact",
                5,
                "3:impactA",
                "5:impactA2");
            CardCombatProfile counter =
                CardEffectResolver.Resolve(_state);

            Assert.That(
                counter.KnockbackDistance,
                Is.EqualTo(28.6f).Within(0.001f));
            Assert.That(
                counter.KnockbackCollisionDamageRatio,
                Is.EqualTo(0.45f).Within(0.001f));
            Assert.That(counter.ImpactBreachRadius, Is.EqualTo(150f));
            Assert.That(counter.ImpactBreachKnockback, Is.EqualTo(80f));
            Assert.That(counter.ImpactBreachStunDuration, Is.EqualTo(0.4f));
            Assert.That(counter.ImpactBreachCooldown, Is.EqualTo(6f));

            EquipResolved(
                "impact",
                5,
                "3:impactB",
                "5:impactB2");
            CardCombatProfile pulse =
                CardEffectResolver.Resolve(_state);
            Assert.That(pulse.ImpactPulseRadius, Is.EqualTo(140f));
            Assert.That(pulse.ImpactPulseKnockback, Is.EqualTo(75f));
            Assert.That(pulse.ImpactPulseInterval, Is.EqualTo(4f));

            EquipResolved(
                "impact",
                5,
                "3:impactC",
                "5:impactC2");
            CardCombatProfile stun =
                CardEffectResolver.Resolve(_state);
            Assert.That(
                stun.KnockbackCollisionDamageRatio,
                Is.EqualTo(0.9f).Within(0.001f));
            Assert.That(stun.OnHitStunDuration, Is.EqualTo(0.35f));
            Assert.That(stun.OnHitStunCooldown, Is.EqualTo(1.5f));
        }

        [Test]
        public void ImpactBreachCounterPushesAndStunsNearbyEnemies()
        {
            EquipResolved(
                "impact",
                5,
                "3:impactA",
                "5:impactA2");
            EnemyState nearby = AddEnemy(
                new Float2(
                    _combat.turret.x + 100f,
                    _combat.turret.y),
                100f);
            AddEnemy(
                new Float2(
                    _combat.turret.x + 20f,
                    _combat.turret.y),
                100f,
                5f);
            Float2 before = nearby.Position;

            _system.StepEnemies(_state, 0f);

            Assert.That(
                Float2.Distance(before, nearby.Position),
                Is.EqualTo(80f).Within(0.001f));
            Assert.That(nearby.StunnedRemaining, Is.EqualTo(0.4f));
            Assert.That(
                _state.ImpactBreachCooldownRemaining,
                Is.EqualTo(6f));
        }

        [Test]
        public void ImpactOnHitStunHonorsSharedCooldown()
        {
            EquipResolved(
                "impact",
                5,
                "3:impactC",
                "5:impactC2");
            CardCombatProfile profile =
                CardEffectResolver.Resolve(_state);
            EnemyState first = AddEnemy(
                new Float2(200f, 200f),
                100f);
            EnemyState second = AddEnemy(
                new Float2(300f, 200f),
                100f);

            HitWithProfile(first.Position, profile);
            HitWithProfile(second.Position, profile);

            Assert.That(first.StunnedRemaining, Is.EqualTo(0.35f));
            Assert.That(second.StunnedRemaining, Is.Zero);
            _system.StepPassives(_state, 1.5f);
            HitWithProfile(second.Position, profile);
            Assert.That(second.StunnedRemaining, Is.EqualTo(0.35f));
        }

        [Test]
        public void SlowReducesEnemyMovementUntilItExpires()
        {
            EnemyState enemy = AddEnemy(new Float2(100f, 100f), 100f);
            enemy.SlowRatio = 0.3f;
            enemy.SlowRemaining = 1.5f;
            Float2 before = enemy.Position;

            _system.StepEnemies(_state, 0.1f);

            float moved = Float2.Distance(before, enemy.Position);
            Assert.That(
                moved,
                Is.EqualTo(enemy.Speed * 0.7f * 0.1f).Within(0.001f));
        }

        [Test]
        public void ScorchAppliesDamageOverTime()
        {
            EquipResolved("scorch", 3, "3:scorchA");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            EnemyState enemy = AddEnemy(new Float2(200f, 200f), 100f);

            HitWithProfile(enemy.Position, profile);
            _system.StepEnemies(_state, 0.5f);

            Assert.That(enemy.DotRemaining, Is.GreaterThan(0f));
            Assert.That(enemy.Hp, Is.EqualTo(88.5f).Within(0.001f));
        }

        [Test]
        public void SplitBlastDamagesNearbySecondaryTargets()
        {
            EquipResolved("splitBlast", 3, "3:splitBlastA");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            EnemyState primary = AddEnemy(new Float2(200f, 200f), 100f);
            EnemyState secondary = AddEnemy(new Float2(225f, 200f), 100f);

            HitWithProfile(primary.Position, profile);

            Assert.That(primary.Hp, Is.EqualTo(90f));
            Assert.That(secondary.Hp, Is.LessThan(90f));
        }

        [Test]
        public void ImpactKnocksTargetAwayFromTurret()
        {
            EquipResolved("impact", 3, "3:impactA");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            Float2 turret = new Float2(_combat.turret.x, _combat.turret.y);
            EnemyState enemy = AddEnemy(
                turret + new Float2(100f, 0f),
                100f);
            float before = Float2.Distance(turret, enemy.Position);

            HitWithProfile(enemy.Position, profile);

            Assert.That(
                Float2.Distance(turret, enemy.Position),
                Is.EqualTo(before + 22f).Within(0.001f));
        }

        [Test]
        public void SanctumAuraSlowsAndExposesNearbyEnemies()
        {
            EquipResolved("sanctum", 3, "3:sanctumB");
            _state.BeginWave(1);
            EnemyState enemy = AddEnemy(
                new Float2(_combat.turret.x + 40f, _combat.turret.y),
                100f);

            _system.StepPassives(_state, 0.1f);

            Assert.That(enemy.SlowRatio, Is.EqualTo(0.25f));
            Assert.That(enemy.VulnerableRatio, Is.EqualTo(0.2f));
        }

        [Test]
        public void SanctumFiveStarRoutesExposeWebParameters()
        {
            EquipResolved(
                "sanctum",
                5,
                "3:sanctumA",
                "5:sanctumA2");
            CardCombatProfile focus =
                CardEffectResolver.Resolve(_state);

            Assert.That(
                focus.AuraRadiusRatio,
                Is.EqualTo(0.575f).Within(0.001f));
            Assert.That(focus.AuraVulnerableRatio, Is.EqualTo(0.3f));
            Assert.That(focus.AuraSlowRatio, Is.EqualTo(0.2f));
            Assert.That(focus.AuraFocusPriorityWeight, Is.EqualTo(3f));
            Assert.That(
                focus.AuraFocusHpThresholdRatio,
                Is.EqualTo(0.3f));

            EquipResolved(
                "sanctum",
                5,
                "3:sanctumB",
                "5:sanctumB2");
            CardCombatProfile control =
                CardEffectResolver.Resolve(_state);
            Assert.That(control.AuraSlowRatio, Is.EqualTo(0.35f));
            Assert.That(control.AuraVulnerableRatio, Is.EqualTo(0.3f));

            EquipResolved(
                "sanctum",
                5,
                "3:sanctumC",
                "5:sanctumC2");
            CardCombatProfile tempo =
                CardEffectResolver.Resolve(_state);
            Assert.That(
                tempo.WaveStartFireRateMultiplier,
                Is.EqualTo(1.15f));
            Assert.That(tempo.WaveStartFireRateDuration, Is.EqualTo(5f));
        }

        [Test]
        public void SanctumFocusPrioritizesLowHealthAuraTarget()
        {
            EquipResolved(
                "sanctum",
                5,
                "3:sanctumA",
                "5:sanctumA2");
            Float2 turret =
                new Float2(_combat.turret.x, _combat.turret.y);
            EnemyState nearHealthy = AddEnemy(
                turret + new Float2(50f, 0f),
                100f);
            EnemyState farLow = AddEnemy(
                turret + new Float2(80f, 0f),
                100f);
            farLow.Hp = 20f;

            EnemyState target = _system.FindTarget(_state);

            Assert.That(target, Is.EqualTo(farLow));
            Assert.That(target, Is.Not.EqualTo(nearHealthy));
        }

        [Test]
        public void AegisShieldAbsorbsConfiguredBreachHits()
        {
            EquipResolved("aegis", 3, "3:aegisA");
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            float hpBefore = _state.Hp;
            AddEnemy(
                new Float2(_combat.turret.x, _combat.turret.y),
                100f);

            _system.StepEnemies(_state, 0f);

            Assert.That(_state.Hp, Is.EqualTo(hpBefore));
            Assert.That(_state.ShieldHits, Is.EqualTo(1));
        }

        [Test]
        public void AegisFiveStarRoutesExposeWebParameters()
        {
            EquipResolved(
                "aegis",
                5,
                "3:aegisA",
                "5:aegisA2");
            CardCombatProfile nova =
                CardEffectResolver.Resolve(_state);

            Assert.That(nova.ShieldHits, Is.EqualTo(3));
            Assert.That(nova.ShieldRegenSeconds, Is.EqualTo(8f));
            Assert.That(nova.BreachReductionRatio, Is.EqualTo(0.2f));
            Assert.That(nova.ShieldBreakDamage, Is.EqualTo(30f));
            Assert.That(nova.ShieldBreakKnockback, Is.EqualTo(100f));

            EquipResolved(
                "aegis",
                5,
                "3:aegisB",
                "5:aegisB2");
            CardCombatProfile reduction =
                CardEffectResolver.Resolve(_state);
            Assert.That(reduction.ShieldHits, Is.EqualTo(3));
            Assert.That(reduction.ShieldRegenSeconds, Is.EqualTo(5f));
            Assert.That(
                reduction.BreachReductionRatio,
                Is.EqualTo(0.38f).Within(0.001f));

            EquipResolved(
                "aegis",
                5,
                "3:aegisC",
                "5:aegisC2");
            CardCombatProfile force =
                CardEffectResolver.Resolve(_state);
            Assert.That(force.ShieldBreakDamage, Is.EqualTo(30f));
            Assert.That(force.ShieldBreakKnockback, Is.EqualTo(135f));
        }

        [Test]
        public void ThornsRouteReducesBreachDamage()
        {
            EquipResolved("thorns", 3, "3:thornsA");
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            float hpBefore = _state.Hp;
            AddEnemy(
                new Float2(_combat.turret.x, _combat.turret.y),
                100f,
                10f);

            _system.StepEnemies(_state, 0f);

            Assert.That(
                _state.Hp,
                Is.EqualTo(hpBefore - 6.5f).Within(0.001f));
        }

        [Test]
        public void ThornsFiveStarRoutesExposeWebParameters()
        {
            EquipResolved(
                "thorns",
                5,
                "3:thornsA",
                "5:thornsA2");
            CardCombatProfile aura =
                CardEffectResolver.Resolve(_state);

            Assert.That(aura.BreachReductionRatio, Is.EqualTo(0.45f));
            Assert.That(
                aura.BreachBurstDamageMultiplier,
                Is.EqualTo(2f));
            Assert.That(aura.ThornsAuraRadius, Is.EqualTo(90f));
            Assert.That(aura.ThornsAuraTickInterval, Is.EqualTo(0.5f));
            Assert.That(aura.ThornsAuraDamageRatio, Is.EqualTo(0.1f));

            EquipResolved(
                "thorns",
                5,
                "3:thornsB",
                "5:thornsB2");
            CardCombatProfile expose =
                CardEffectResolver.Resolve(_state);
            Assert.That(expose.BreachReductionRatio, Is.EqualTo(0.4f));
            Assert.That(expose.ThornsRatio, Is.EqualTo(0.4f));
            Assert.That(
                expose.BreachBurstDamageMultiplier,
                Is.EqualTo(1.7f));
            Assert.That(expose.BreachVulnerableRatio, Is.EqualTo(0.28f));

            EquipResolved(
                "thorns",
                5,
                "3:thornsC",
                "5:thornsC2");
            CardCombatProfile execute =
                CardEffectResolver.Resolve(_state);
            Assert.That(execute.ThornsRatio, Is.EqualTo(0.35f));
            Assert.That(execute.BreachSlowRatio, Is.EqualTo(0.45f));
            Assert.That(
                execute.BreachExecuteThresholdRatio,
                Is.EqualTo(0.18f));
        }

        [Test]
        public void ThornsAuraDamagesEnemiesOnItsInterval()
        {
            EquipResolved(
                "thorns",
                5,
                "3:thornsA",
                "5:thornsA2");
            _state.BeginWave(1);
            EnemyState enemy = AddEnemy(
                new Float2(
                    _combat.turret.x + 50f,
                    _combat.turret.y),
                100f);
            _system.StepPassives(_state, 0f);

            _system.StepPassives(_state, 0.5f);

            Assert.That(
                enemy.Hp,
                Is.EqualTo(
                    100f - _combat.defaults.damage * 0.1f)
                    .Within(0.001f));
        }

        [Test]
        public void ThornsBreachAppliesVulnerability()
        {
            EquipResolved(
                "thorns",
                5,
                "3:thornsB",
                "5:thornsB2");
            EnemyState nearby = AddEnemy(
                new Float2(
                    _combat.turret.x + 80f,
                    _combat.turret.y),
                100f);
            AddEnemy(
                new Float2(
                    _combat.turret.x + 20f,
                    _combat.turret.y),
                100f,
                5f);

            _system.StepEnemies(_state, 0f);

            Assert.That(nearby.VulnerableRatio, Is.EqualTo(0.28f));
            Assert.That(nearby.VulnerableRemaining, Is.EqualTo(2f));
        }

        [Test]
        public void ThornsBreachExecutesLowHealthNearbyEnemy()
        {
            EquipResolved(
                "thorns",
                5,
                "3:thornsC",
                "5:thornsC2");
            EnemyState lowHealth = AddEnemy(
                new Float2(
                    _combat.turret.x + 80f,
                    _combat.turret.y),
                100f);
            lowHealth.Hp = 18f;
            AddEnemy(
                new Float2(
                    _combat.turret.x + 20f,
                    _combat.turret.y),
                100f,
                5f);

            _system.StepEnemies(_state, 0f);

            Assert.That(_state.Enemies.Contains(lowHealth), Is.False);
            Assert.That(_state.Kills, Is.EqualTo(1));
        }

        [Test]
        public void PierceSixStarReplacesProjectileWithBeamProfile()
        {
            EquipResolved(
                "pierce",
                6,
                "3:pierceA",
                "5:pierceA2");

            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            Assert.That(profile.BeamInterval, Is.EqualTo(0.9f));
            Assert.That(profile.BeamWidth, Is.EqualTo(32f));
            Assert.That(profile.BeamDamageRatio, Is.EqualTo(1f));
            Assert.That(profile.PierceCount, Is.Zero);
            Assert.That(profile.RicochetBounces, Is.Zero);
        }

        [Test]
        public void PierceSixStarBeamDamagesEveryEnemyOnItsLine()
        {
            EquipResolved(
                "pierce",
                6,
                "3:pierceA",
                "5:pierceA2");
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            Float2 turret = new Float2(
                _combat.turret.x,
                _combat.turret.y);
            EnemyState near = AddEnemy(
                turret + new Float2(70f, 0f),
                200f);
            EnemyState far = AddEnemy(
                turret + new Float2(130f, 0f),
                200f);
            EnemyState offLine = AddEnemy(
                turret + new Float2(70f, 60f),
                200f);

            _system.StepPassives(_state, 0.9f);
            _system.StepTurret(_state, 0f);

            Assert.That(near.Hp, Is.EqualTo(119f));
            Assert.That(far.Hp, Is.EqualTo(119f));
            Assert.That(offLine.Hp, Is.EqualTo(200f));
            Assert.That(_state.Bullets, Is.Empty);
            Assert.That(_state.BeamVisualRemaining, Is.GreaterThan(0f));
        }

        [Test]
        public void ChainLightningSixStarUsesAutomaticTripleArcProfile()
        {
            EquipResolved(
                "chainLightning",
                6,
                "3:chainLightningA",
                "5:chainLightningA2");

            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            Assert.That(profile.ChainPulseInterval, Is.EqualTo(1.2f));
            Assert.That(profile.ChainPulseTargets, Is.EqualTo(3));
            Assert.That(profile.ChainPulseBounces, Is.EqualTo(2));
            Assert.That(
                profile.ChainPulseDamageRetention,
                Is.EqualTo(0.8f));
            Assert.That(profile.ChainPulseSearchRange, Is.EqualTo(160f));
            Assert.That(profile.ChainBounces, Is.Zero);
        }

        [Test]
        public void ChainLightningSixStarFiresThreeAutomaticArcs()
        {
            EquipResolved(
                "chainLightning",
                6,
                "3:chainLightningA",
                "5:chainLightningA2");
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            Float2 turret = new Float2(
                _combat.turret.x,
                _combat.turret.y);
            EnemyState first = AddEnemy(
                turret + new Float2(20f, 0f),
                200f);
            EnemyState second = AddEnemy(
                turret + new Float2(60f, 0f),
                200f);
            EnemyState third = AddEnemy(
                turret + new Float2(100f, 0f),
                200f);

            _system.StepPassives(_state, 1.2f);

            float totalRemaining =
                first.Hp + second.Hp + third.Hp;
            Assert.That(
                totalRemaining,
                Is.EqualTo(468.24f).Within(0.01f));
        }

        [Test]
        public void FrostSixStarAppliesAuraAndPeriodicNova()
        {
            EquipResolved(
                "frost",
                6,
                "3:frostA",
                "5:frostA2");
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            Float2 turret = new Float2(
                _combat.turret.x,
                _combat.turret.y);
            EnemyState auraTarget = AddEnemy(
                turret + new Float2(80f, 0f),
                200f);
            EnemyState novaOnly = AddEnemy(
                turret + new Float2(120f, 0f),
                200f);
            EnemyState outside = AddEnemy(
                turret + new Float2(170f, 0f),
                200f);

            _system.StepPassives(_state, 0f);

            Assert.That(auraTarget.SlowRatio, Is.EqualTo(0.35f));
            Assert.That(auraTarget.SlowRemaining, Is.EqualTo(1.2f));
            Assert.That(novaOnly.SlowRatio, Is.Zero);

            _system.StepPassives(_state, 4f);

            Assert.That(auraTarget.FrozenRemaining, Is.EqualTo(0.6f));
            Assert.That(novaOnly.FrozenRemaining, Is.EqualTo(0.6f));
            Assert.That(outside.FrozenRemaining, Is.Zero);
        }

        [Test]
        public void ScorchSixStarBurnsAndSlowsInsideAura()
        {
            EquipResolved(
                "scorch",
                6,
                "3:scorchA",
                "5:scorchA2");
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            Float2 turret = new Float2(
                _combat.turret.x,
                _combat.turret.y);
            EnemyState inside = AddEnemy(
                turret + new Float2(100f, 0f),
                100f);
            EnemyState outside = AddEnemy(
                turret + new Float2(210f, 0f),
                100f);

            _system.StepPassives(_state, 0.5f);

            Assert.That(inside.Hp, Is.EqualTo(98.2f).Within(0.001f));
            Assert.That(inside.SlowRatio, Is.EqualTo(0.15f));
            Assert.That(inside.SlowRemaining, Is.EqualTo(0.6f));
            Assert.That(outside.Hp, Is.EqualTo(100f));
        }

        [Test]
        public void SplitBlastSixStarFiresFallingDamageMortar()
        {
            EquipResolved(
                "splitBlast",
                6,
                "3:splitBlastA",
                "5:splitBlastA2");
            Float2 turret = new Float2(
                _combat.turret.x,
                _combat.turret.y);
            EnemyState primary = AddEnemy(
                turret + new Float2(70f, 0f),
                200f);
            EnemyState nearby = AddEnemy(
                turret + new Float2(115f, 0f),
                200f);

            _system.StepTurret(_state, 0f);
            BulletState mortar = _state.Bullets[0];
            mortar.Position = primary.Position;
            mortar.Velocity = new Float2();
            _system.StepBullets(_state, 0f);

            Assert.That(mortar.Damage, Is.EqualTo(23.4f).Within(0.001f));
            Assert.That(primary.Hp, Is.EqualTo(176.6f).Within(0.001f));
            Assert.That(nearby.Hp, Is.EqualTo(182.45f).Within(0.001f));
        }

        [Test]
        public void ImpactSixStarPeriodicallyKnocksBackAndStuns()
        {
            EquipResolved(
                "impact",
                6,
                "3:impactA",
                "5:impactA2");
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            Float2 turret = new Float2(
                _combat.turret.x,
                _combat.turret.y);
            EnemyState inside = AddEnemy(
                turret + new Float2(100f, 0f),
                100f);
            EnemyState outside = AddEnemy(
                turret + new Float2(160f, 0f),
                100f);

            _system.StepPassives(_state, 4f);

            Assert.That(
                Float2.Distance(turret, inside.Position),
                Is.EqualTo(200f));
            Assert.That(inside.StunnedRemaining, Is.EqualTo(0.4f));
            Assert.That(
                Float2.Distance(turret, outside.Position),
                Is.EqualTo(160f));
            Assert.That(outside.StunnedRemaining, Is.Zero);
        }

        [Test]
        public void SanctumSixStarPeriodicallyMarksNearbyEnemies()
        {
            EquipResolved(
                "sanctum",
                6,
                "3:sanctumA",
                "5:sanctumA2");
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            Float2 turret = new Float2(
                _combat.turret.x,
                _combat.turret.y);
            EnemyState inside = AddEnemy(
                turret + new Float2(160f, 0f),
                100f);
            EnemyState outside = AddEnemy(
                turret + new Float2(180f, 0f),
                100f);

            _system.StepPassives(_state, 3f);

            Assert.That(inside.VulnerableRatio, Is.EqualTo(0.4f));
            Assert.That(inside.VulnerableRemaining, Is.EqualTo(2f));
            Assert.That(outside.VulnerableRatio, Is.Zero);
        }

        [Test]
        public void AegisSixStarBreaksIntoHeavyNova()
        {
            EquipResolved(
                "aegis",
                6,
                "3:aegisA",
                "5:aegisA2");
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            Float2 turret = new Float2(
                _combat.turret.x,
                _combat.turret.y);
            EnemyState spectator = AddEnemy(
                turret + new Float2(100f, 0f),
                100f);
            AddEnemy(turret, 100f);
            AddEnemy(turret, 100f);
            AddEnemy(turret, 100f);

            _system.StepEnemies(_state, 0f);

            Assert.That(_state.ShieldHits, Is.Zero);
            Assert.That(spectator.Hp, Is.EqualTo(50f));
            Assert.That(
                Float2.Distance(turret, spectator.Position),
                Is.EqualTo(220f));
        }

        [Test]
        public void ThornsSixStarAuraDamagesAndExecutes()
        {
            EquipResolved(
                "thorns",
                6,
                "3:thornsA",
                "5:thornsA2");
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            Float2 turret = new Float2(
                _combat.turret.x,
                _combat.turret.y);
            EnemyState low = AddEnemy(
                turret + new Float2(80f, 0f),
                100f);
            low.Hp = 20f;
            EnemyState healthy = AddEnemy(
                turret + new Float2(100f, 0f),
                100f);

            _system.StepPassives(_state, 0.4f);

            Assert.That(_state.Enemies.Contains(low), Is.False);
            Assert.That(healthy.Hp, Is.EqualTo(97.3f).Within(0.001f));
        }

        [Test]
        public void DecoySixStarBecomesFiringMirrorTurret()
        {
            EquipResolved(
                "decoy",
                6,
                "3:decoyA",
                "5:decoyA2");
            Float2 turret = new Float2(
                _combat.turret.x,
                _combat.turret.y);
            AddEnemy(
                turret + new Float2(100f, 0f),
                100f);
            _state.BeginWave(1);

            _system.StepPassives(_state, 0f);

            Assert.That(_state.DecoyActive, Is.True);
            Assert.That(_state.DecoyIsMirrorTurret, Is.True);
            Assert.That(_state.DecoyHp, Is.EqualTo(80f));
            Assert.That(_state.DecoyTauntRadius, Is.EqualTo(2000f));
            Assert.That(_state.Bullets, Has.Count.EqualTo(1));
            Assert.That(
                _state.Bullets[0].Position,
                Is.EqualTo(_state.DecoyPosition));
            Assert.That(_state.Bullets[0].Damage, Is.EqualTo(5.4f));
        }

        [Test]
        public void HarvestSixStarAirdropsAndConvertsEverything()
        {
            EquipResolved(
                "harvest",
                6,
                "3:harvestA",
                "5:harvestA2");
            var drops = new DropSystem(
                new EconomyConfig(),
                new ConstantRandomSource(0.75f));
            var system = new CombatSystem(
                _combat,
                _enemies,
                drops);
            _state.BeginWave(1);

            system.StepPassives(_state, 0f);

            Assert.That(_state.GroundDrops, Has.Count.EqualTo(2));
            Assert.That(_state.ExpiryConvertRatio, Is.EqualTo(1f));

            drops.Step(_state, 10f);

            Assert.That(_state.GroundDrops, Is.Empty);
            Assert.That(_state.ExpiredDropsConverted, Is.EqualTo(2));
            Assert.That(_state.Experience, Is.EqualTo(8f));
        }

        [Test]
        public void FrozenThunderUsesRecipeTerminalProfile()
        {
            EquipResolved("frozenThunder", 6);

            CardCombatProfile profile =
                CardEffectResolver.Resolve(_state);

            Assert.That(profile.ChainBounces, Is.EqualTo(7));
            Assert.That(
                profile.ChainDamageRetention,
                Is.EqualTo(0.85f));
            Assert.That(profile.ChainSearchRange, Is.EqualTo(190f));
            Assert.That(profile.FreezeStacksToTrigger, Is.EqualTo(2));
            Assert.That(profile.FreezeDuration, Is.EqualTo(1.2f));
            Assert.That(
                profile.FrozenKillSplashDamageRatio,
                Is.EqualTo(1.2f));
            Assert.That(
                profile.FrozenKillFreezeDuration,
                Is.EqualTo(0.7f));
        }

        [Test]
        public void PierceConsumableDamagesEveryEnemyOnAimedLine()
        {
            CardState card = _state.CreateCard("pierce", 3);
            Float2 turret = new Float2(
                _combat.turret.x,
                _combat.turret.y);
            EnemyState near = AddEnemy(
                turret + new Float2(80f, 0f),
                200f);
            EnemyState far = AddEnemy(
                turret + new Float2(150f, 0f),
                200f);
            EnemyState outside = AddEnemy(
                turret + new Float2(80f, 40f),
                200f);

            bool cast = _system.CastConsumable(
                _state,
                card,
                turret + new Float2(100f, 0f));

            Assert.That(cast, Is.True);
            Assert.That(near.Hp, Is.EqualTo(110f));
            Assert.That(far.Hp, Is.EqualTo(110f));
            Assert.That(outside.Hp, Is.EqualTo(200f));
            Assert.That(_state.BeamVisualRemaining, Is.GreaterThan(0f));
        }

        [Test]
        public void ChainConsumableJumpsAndSlowsAtThreeStars()
        {
            CardState card = _state.CreateCard(
                "chainLightning",
                3);
            EnemyState first = AddEnemy(
                new Float2(200f, 200f),
                100f);
            EnemyState second = AddEnemy(
                new Float2(250f, 200f),
                100f);
            EnemyState third = AddEnemy(
                new Float2(300f, 200f),
                100f);

            bool cast = _system.CastConsumable(
                _state,
                card,
                first.Position);

            Assert.That(cast, Is.True);
            Assert.That(first.Hp, Is.EqualTo(82f));
            Assert.That(second.Hp, Is.EqualTo(85.6f));
            Assert.That(
                third.Hp,
                Is.EqualTo(88.48f).Within(0.001f));
            Assert.That(first.SlowRatio, Is.EqualTo(0.25f));
            Assert.That(third.SlowRemaining, Is.EqualTo(1.5f));
        }

        [Test]
        public void FrostConsumableFreezesAndExposesAtSixStars()
        {
            CardState card = _state.CreateCard("frost", 6);
            EnemyState inside = AddEnemy(
                new Float2(200f, 200f),
                100f);
            EnemyState outside = AddEnemy(
                new Float2(380f, 200f),
                100f);

            bool cast = _system.CastConsumable(
                _state,
                card,
                new Float2(200f, 200f));

            Assert.That(cast, Is.True);
            Assert.That(inside.FrozenRemaining, Is.EqualTo(3.5f));
            Assert.That(inside.VulnerableRatio, Is.EqualTo(0.3f));
            Assert.That(inside.VulnerableRemaining, Is.EqualTo(3.5f));
            Assert.That(outside.FrozenRemaining, Is.Zero);
        }

        [Test]
        public void ScorchConsumableCreatesPersistentBurningGround()
        {
            CardState card = _state.CreateCard("scorch", 3);
            EnemyState inside = AddEnemy(
                new Float2(200f, 200f),
                100f);
            EnemyState outside = AddEnemy(
                new Float2(350f, 200f),
                100f);

            bool cast = _system.CastConsumable(
                _state,
                card,
                new Float2(200f, 200f));
            _system.StepPassives(_state, 0.5f);

            Assert.That(cast, Is.True);
            Assert.That(_state.GroundZones, Has.Count.EqualTo(1));
            Assert.That(inside.Hp, Is.EqualTo(96.4f));
            Assert.That(inside.VulnerableRatio, Is.EqualTo(0.15f));
            Assert.That(outside.Hp, Is.EqualTo(100f));
        }

        [Test]
        public void SplitBlastConsumableBurstsThenSplits()
        {
            CardState card = _state.CreateCard("splitBlast", 3);
            EnemyState first = AddEnemy(
                new Float2(200f, 200f),
                200f);
            EnemyState second = AddEnemy(
                new Float2(250f, 200f),
                200f);

            bool cast = _system.CastConsumable(
                _state,
                card,
                new Float2(200f, 200f));

            Assert.That(cast, Is.True);
            Assert.That(first.Hp, Is.EqualTo(38f));
            Assert.That(second.Hp, Is.EqualTo(38f));
        }

        [Test]
        public void ImpactConsumableKnocksBackAndStuns()
        {
            CardState card = _state.CreateCard("impact", 3);
            Float2 center = new Float2(200f, 200f);
            EnemyState inside = AddEnemy(
                center + new Float2(50f, 0f),
                100f);
            EnemyState outside = AddEnemy(
                center + new Float2(150f, 0f),
                100f);

            bool cast = _system.CastConsumable(
                _state,
                card,
                center);

            Assert.That(cast, Is.True);
            Assert.That(
                Float2.Distance(center, inside.Position),
                Is.EqualTo(170f));
            Assert.That(inside.StunnedRemaining, Is.EqualTo(0.5f));
            Assert.That(outside.StunnedRemaining, Is.Zero);
        }

        [Test]
        public void SanctumConsumableAppliesAreaVulnerability()
        {
            CardState card = _state.CreateCard("sanctum", 6);
            EnemyState inside = AddEnemy(
                new Float2(200f, 200f),
                100f);
            EnemyState outside = AddEnemy(
                new Float2(380f, 200f),
                100f);

            bool cast = _system.CastConsumable(
                _state,
                card,
                new Float2(200f, 200f));

            Assert.That(cast, Is.True);
            Assert.That(inside.VulnerableRatio, Is.EqualTo(0.5f));
            Assert.That(inside.VulnerableRemaining, Is.EqualTo(5f));
            Assert.That(outside.VulnerableRatio, Is.Zero);
        }

        [Test]
        public void AegisConsumableGrantsShieldAndExplodesAtSixStars()
        {
            CardState card = _state.CreateCard("aegis", 6);
            Float2 center = new Float2(200f, 200f);
            EnemyState inside = AddEnemy(
                center + new Float2(100f, 0f),
                200f);

            bool cast = _system.CastConsumable(
                _state,
                card,
                center);

            Assert.That(cast, Is.True);
            Assert.That(_state.ShieldHits, Is.EqualTo(8));
            Assert.That(_state.ShieldMaxHits, Is.EqualTo(8));
            Assert.That(inside.Hp, Is.EqualTo(110f));
            Assert.That(
                Float2.Distance(center, inside.Position),
                Is.EqualTo(220f));
        }

        [Test]
        public void ThornsConsumableExecutesInsideSixStarZone()
        {
            CardState card = _state.CreateCard("thorns", 6);
            EnemyState low = AddEnemy(
                new Float2(200f, 200f),
                200f);
            low.Hp = 30f;
            EnemyState healthy = AddEnemy(
                new Float2(250f, 200f),
                200f);

            bool cast = _system.CastConsumable(
                _state,
                card,
                new Float2(200f, 200f));
            _system.StepPassives(_state, 0.5f);

            Assert.That(cast, Is.True);
            Assert.That(_state.Enemies.Contains(low), Is.False);
            Assert.That(healthy.Hp, Is.EqualTo(195.5f));
        }

        [Test]
        public void DecoyConsumableBecomesTemporaryMirrorAtSixStars()
        {
            CardState card = _state.CreateCard("decoy", 6);
            Float2 point = new Float2(200f, 200f);
            AddEnemy(point + new Float2(50f, 0f), 100f);

            bool cast = _system.CastConsumable(
                _state,
                card,
                point);
            _system.StepPassives(_state, 0f);

            Assert.That(cast, Is.True);
            Assert.That(_state.DecoyActive, Is.True);
            Assert.That(_state.DecoyIsMirrorTurret, Is.True);
            Assert.That(_state.DecoyHp, Is.EqualTo(9999f));
            Assert.That(_state.DecoyLifeRemaining, Is.EqualTo(5f));
            Assert.That(_state.Bullets, Has.Count.EqualTo(1));
            Assert.That(_state.Bullets[0].Damage, Is.EqualTo(10.8f));

            _system.StepPassives(_state, 5f);

            Assert.That(_state.DecoyActive, Is.False);
        }

        [Test]
        public void HarvestConsumableSpawnsFourDropsAtSixStars()
        {
            CardState card = _state.CreateCard("harvest", 6);
            var drops = new DropSystem(
                new EconomyConfig(),
                new ConstantRandomSource(0.5f));
            var system = new CombatSystem(
                _combat,
                _enemies,
                drops);

            bool cast = system.CastConsumable(
                _state,
                card,
                new Float2(200f, 200f));

            Assert.That(cast, Is.True);
            Assert.That(_state.GroundDrops, Has.Count.EqualTo(4));
            Assert.That(
                _state.GroundDrops.FindAll(drop => drop.Star == 1),
                Has.Count.EqualTo(3));
            Assert.That(
                _state.GroundDrops.FindAll(drop => drop.Star == 2),
                Has.Count.EqualTo(1));
        }

        [Test]
        public void FrozenThunderConsumableChainsFreezesAndBursts()
        {
            CardState card = _state.CreateCard("frozenThunder", 6);
            EnemyState first = AddEnemy(
                new Float2(200f, 200f),
                500f);
            EnemyState second = AddEnemy(
                new Float2(250f, 200f),
                500f);

            bool cast = _system.CastConsumable(
                _state,
                card,
                first.Position);

            Assert.That(cast, Is.True);
            Assert.That(first.Hp, Is.EqualTo(419f));
            Assert.That(second.Hp, Is.EqualTo(420.8f).Within(0.001f));
            Assert.That(first.FrozenRemaining, Is.EqualTo(2.5f));
            Assert.That(second.FrozenRemaining, Is.EqualTo(2.5f));
        }

        [Test]
        public void SolarLanceConsumableBurnsItsBeamLine()
        {
            CardState card = _state.CreateCard("solarLance", 6);
            Float2 turret = new Float2(
                _combat.turret.x,
                _combat.turret.y);
            EnemyState inside = AddEnemy(
                turret + new Float2(100f, 0f),
                500f);
            EnemyState outside = AddEnemy(
                turret + new Float2(100f, 60f),
                500f);

            bool cast = _system.CastConsumable(
                _state,
                card,
                turret + new Float2(100f, 0f));

            Assert.That(cast, Is.True);
            Assert.That(inside.Hp, Is.EqualTo(374f));
            Assert.That(inside.DotDamagePerTick, Is.EqualTo(44.1f));
            Assert.That(inside.DotRemaining, Is.EqualTo(5f));
            Assert.That(inside.VulnerableRatio, Is.EqualTo(0.2f));
            Assert.That(outside.Hp, Is.EqualTo(500f));
        }

        [Test]
        public void AvalancheConsumableFreezeBlocksItsKnockback()
        {
            CardState card = _state.CreateCard("avalanche", 6);
            Float2 center = new Float2(200f, 200f);
            EnemyState inside = AddEnemy(
                center + new Float2(100f, 0f),
                500f);

            bool cast = _system.CastConsumable(
                _state,
                card,
                center);

            Assert.That(cast, Is.True);
            Assert.That(inside.Hp, Is.EqualTo(401f));
            Assert.That(inside.FrozenRemaining, Is.EqualTo(2f));
            Assert.That(
                Float2.Distance(center, inside.Position),
                Is.EqualTo(100f));
        }

        [Test]
        public void PyrestormConsumableBombardsThenBurns()
        {
            CardState card = _state.CreateCard("pyrestorm", 6);
            EnemyState inside = AddEnemy(
                new Float2(200f, 200f),
                500f);

            bool cast = _system.CastConsumable(
                _state,
                card,
                inside.Position);
            _system.StepPassives(_state, 0.5f);

            Assert.That(cast, Is.True);
            Assert.That(inside.Hp, Is.EqualTo(221.9f).Within(0.001f));
            Assert.That(inside.VulnerableRatio, Is.EqualTo(0.18f));
            Assert.That(_state.GroundZones, Has.Count.EqualTo(1));
        }

        [Test]
        public void CrownConsumableShieldsBurstsAndExecutes()
        {
            CardState card = _state.CreateCard(
                "crownOfThorns",
                6);
            Float2 center = new Float2(200f, 200f);
            EnemyState low = AddEnemy(center, 100f);

            bool cast = _system.CastConsumable(
                _state,
                card,
                center);
            _system.StepPassives(_state, 0.5f);

            Assert.That(cast, Is.True);
            Assert.That(_state.ShieldHits, Is.EqualTo(10));
            Assert.That(_state.Enemies.Contains(low), Is.False);
        }

        [Test]
        public void GoldenIdolConsumableCreatesRewardShrine()
        {
            CardState card = _state.CreateCard("goldenIdol", 6);
            var drops = new DropSystem(
                new EconomyConfig(),
                new ConstantRandomSource(0.1f));
            var system = new CombatSystem(
                _combat,
                _enemies,
                drops);

            bool cast = system.CastConsumable(
                _state,
                card,
                new Float2(200f, 200f));

            Assert.That(cast, Is.True);
            Assert.That(_state.DecoyActive, Is.True);
            Assert.That(_state.DecoyHp, Is.EqualTo(180f));
            Assert.That(_state.DecoyTauntRadius, Is.EqualTo(230f));
            Assert.That(_state.GroundDrops, Has.Count.EqualTo(4));
            Assert.That(_state.KillXpBuffMultiplier, Is.EqualTo(1.6f));
            Assert.That(_state.KillXpBuffRemaining, Is.EqualTo(5f));
        }

        [Test]
        public void FrozenThunderShatterFreezesNearbyEnemies()
        {
            EquipResolved("frozenThunder", 6);
            CardCombatProfile profile =
                CardEffectResolver.Resolve(_state);
            EnemyState frozen = AddEnemy(
                new Float2(200f, 200f),
                5f);
            frozen.FrozenRemaining = 1f;
            EnemyState nearby = AddEnemy(
                new Float2(250f, 200f),
                100f);

            HitWithProfile(frozen.Position, profile);

            Assert.That(_state.Enemies.Contains(frozen), Is.False);
            Assert.That(
                nearby.Hp,
                Is.EqualTo(69.9f).Within(0.001f));
            Assert.That(nearby.FrozenRemaining, Is.EqualTo(0.7f));
        }

        [Test]
        public void SolarLanceBurnsAndBurstsOnRepeatedBeamHit()
        {
            EquipResolved("solarLance", 6);
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            Float2 turret = new Float2(
                _combat.turret.x,
                _combat.turret.y);
            EnemyState target = AddEnemy(
                turret + new Float2(70f, 0f),
                300f);
            EnemyState nearby = AddEnemy(
                turret + new Float2(70f, 20f),
                300f);

            _system.StepPassives(_state, 0.85f);
            float nearbyAfterFirstBeam = nearby.Hp;
            _system.StepPassives(_state, 0.85f);

            Assert.That(target.DotRemaining, Is.EqualTo(3f));
            Assert.That(
                nearby.Hp,
                Is.LessThan(nearbyAfterFirstBeam - 8f));
        }

        [Test]
        public void AvalanchePulseFreezeBlocksItsKnockback()
        {
            EquipResolved("avalanche", 6);
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            Float2 turret = new Float2(
                _combat.turret.x,
                _combat.turret.y);
            EnemyState inside = AddEnemy(
                turret + new Float2(100f, 0f),
                100f);
            EnemyState outside = AddEnemy(
                turret + new Float2(230f, 0f),
                100f);

            _system.StepPassives(_state, 5f);

            Assert.That(inside.Hp, Is.EqualTo(55f));
            Assert.That(inside.FrozenRemaining, Is.EqualTo(1.2f));
            Assert.That(
                Float2.Distance(turret, inside.Position),
                Is.EqualTo(100f));
            Assert.That(outside.Hp, Is.EqualTo(100f));
        }

        [Test]
        public void PyrestormCreatesADamagingVulnerableGroundZone()
        {
            EquipResolved("pyrestorm", 6);
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            Float2 turret = new Float2(
                _combat.turret.x,
                _combat.turret.y);
            EnemyState center = AddEnemy(
                turret + new Float2(80f, 0f),
                200f);
            EnemyState edge = AddEnemy(
                turret + new Float2(135f, 0f),
                200f);

            _system.StepPassives(_state, 2.8f);

            Assert.That(center.Hp, Is.EqualTo(156.8f));
            Assert.That(edge.Hp, Is.EqualTo(164.36f).Within(0.001f));
            Assert.That(_state.GroundZones, Has.Count.EqualTo(1));

            _system.StepPassives(_state, 0.5f);

            Assert.That(center.Hp, Is.EqualTo(152.48f).Within(0.001f));
            Assert.That(center.VulnerableRatio, Is.EqualTo(0.12f));
            Assert.That(center.VulnerableRemaining, Is.EqualTo(0.6f));
        }

        [Test]
        public void CrownOfThornsCombinesShieldAuraAndRetaliation()
        {
            EquipResolved("crownOfThorns", 6);
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            Float2 turret = new Float2(
                _combat.turret.x,
                _combat.turret.y);
            EnemyState inside = AddEnemy(
                turret + new Float2(100f, 0f),
                200f);

            _system.StepPassives(_state, 0.5f);
            CardCombatProfile profile =
                CardEffectResolver.Resolve(_state);

            Assert.That(_state.ShieldHits, Is.EqualTo(6));
            Assert.That(_state.ShieldMaxHits, Is.EqualTo(6));
            Assert.That(profile.ThornsRatio, Is.EqualTo(0.5f));
            Assert.That(profile.ShieldBreakDamage, Is.EqualTo(75f));
            Assert.That(inside.Hp, Is.EqualTo(196.4f));
            Assert.That(inside.SlowRatio, Is.EqualTo(0.2f));
            Assert.That(inside.SlowRemaining, Is.EqualTo(0.6f));
        }

        [Test]
        public void GoldenIdolRewardsConsecutiveControlledKills()
        {
            EquipResolved("goldenIdol", 6);
            var drops = new DropSystem(
                new EconomyConfig(),
                new ConstantRandomSource(0.1f));
            var system = new CombatSystem(
                _combat,
                _enemies,
                drops);
            _state.BeginWave(1);
            system.StepPassives(_state, 0f);

            Assert.That(_state.DecoyActive, Is.True);
            Assert.That(_state.DecoyHp, Is.EqualTo(130f));
            Assert.That(_state.DecoyTauntRadius, Is.EqualTo(210f));

            EnemyState first = AddEnemy(
                new Float2(200f, 200f),
                5f);
            first.FrozenRemaining = 1f;
            HitWithSystem(
                system,
                first.Position,
                CardEffectResolver.Resolve(_state));
            EnemyState second = AddEnemy(
                new Float2(250f, 200f),
                5f);
            second.SlowRatio = 0.2f;
            second.SlowRemaining = 1f;
            HitWithSystem(
                system,
                second.Position,
                CardEffectResolver.Resolve(_state));

            Assert.That(_state.GroundDrops.Count, Is.GreaterThanOrEqualTo(2));
            Assert.That(_state.Experience, Is.EqualTo(2.25f));
            Assert.That(_state.KillXpBuffStacks, Is.EqualTo(2));
            Assert.That(
                _state.KillXpBuffMultiplier,
                Is.EqualTo(1.5625f));
            Assert.That(_state.KillXpBuffRemaining, Is.EqualTo(3f));
        }

        [Test]
        public void DecoySpawnsAtWaveStartAndTakesEnemyHit()
        {
            EquipResolved("decoy", 3, "3:decoyA");
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            EnemyState enemy = AddEnemy(
                _state.DecoyPosition + new Float2(5f, 0f),
                100f,
                12f);

            _system.StepEnemies(_state, 0f);

            Assert.That(_state.DecoyActive, Is.True);
            Assert.That(_state.DecoyHp, Is.EqualTo(48f));
            Assert.That(_state.Enemies.Contains(enemy), Is.False);
        }

        [Test]
        public void HarvestRouteExposesWebDropMultipliers()
        {
            EquipResolved("harvest", 3, "3:harvestA");

            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            _system.StepPassives(_state, 0f);

            Assert.That(profile.DropRateMultiplier, Is.EqualTo(1.25f));
            Assert.That(profile.DropLifetimeMultiplier, Is.EqualTo(1.25f));
            Assert.That(_state.DropRateMultiplier, Is.EqualTo(1.25f));
            Assert.That(_state.DropLifetimeMultiplier, Is.EqualTo(1.25f));
        }

        [Test]
        public void DecoyFourStarAmplifiesDurabilityAndTaunt()
        {
            EquipResolved("decoy", 4, "3:decoyB");

            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            Assert.That(profile.DecoyHp, Is.EqualTo(90f));
            Assert.That(profile.DecoyTauntRadius, Is.EqualTo(210f));
        }

        [Test]
        public void DecoyA2RespawnsOnceAfterBeingDestroyed()
        {
            EquipResolved(
                "decoy",
                5,
                "3:decoyA",
                "5:decoyA2");
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            Float2 firstPosition = _state.DecoyPosition;
            AddEnemy(firstPosition, 100f, 100f);

            _system.StepEnemies(_state, 0f);

            Assert.That(_state.DecoyActive, Is.True);
            Assert.That(_state.DecoyHp, Is.EqualTo(90f));
            Assert.That(_state.DecoyRespawnsRemaining, Is.Zero);
            Assert.That(_state.DecoyPosition, Is.Not.EqualTo(firstPosition));
        }

        [Test]
        public void DecoyB2CreatesTwoIndependentTargets()
        {
            EquipResolved(
                "decoy",
                5,
                "3:decoyB",
                "5:decoyB2");
            _state.BeginWave(1);

            _system.StepPassives(_state, 0f);

            Assert.That(_state.DecoyActive, Is.True);
            Assert.That(_state.SecondaryDecoyActive, Is.True);
            Assert.That(
                Float2.Distance(
                    _state.DecoyPosition,
                    _state.SecondaryDecoyPosition),
                Is.EqualTo(40f));
        }

        [Test]
        public void DecoyC2SlowsEnemiesInsideItsAura()
        {
            EquipResolved(
                "decoy",
                5,
                "3:decoyC",
                "5:decoyC2");
            _state.BeginWave(1);
            _system.StepPassives(_state, 0f);
            EnemyState enemy = AddEnemy(
                _state.DecoyPosition + new Float2(80f, 0f),
                100f);

            _system.StepPassives(_state, 0f);

            Assert.That(enemy.SlowRatio, Is.EqualTo(0.3f));
            Assert.That(enemy.SlowRemaining, Is.EqualTo(0.8f));
        }

        [Test]
        public void HarvestFourStarAmplifiesBothDropMultipliers()
        {
            EquipResolved(
                "harvest",
                5,
                "3:harvestA",
                "5:harvestA2");

            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            Assert.That(
                profile.DropRateMultiplier,
                Is.EqualTo(1.375f).Within(0.0001f));
            Assert.That(
                profile.DropLifetimeMultiplier,
                Is.EqualTo(1.375f).Within(0.0001f));
        }

        [Test]
        public void HarvestA2ConvertsExpiredDropIntoExperience()
        {
            EquipResolved(
                "harvest",
                5,
                "3:harvestA",
                "5:harvestA2");
            _system.StepPassives(_state, 0f);
            var drops = new DropSystem(
                new EconomyConfig(),
                new ConstantRandomSource(0.25f));
            drops.SpawnTestDrop(_state, new Float2(300f, 240f));

            drops.Step(_state, 10f);

            Assert.That(_state.GroundDrops, Is.Empty);
            Assert.That(_state.Experience, Is.EqualTo(4f));
            Assert.That(_state.ExpiredDropsConverted, Is.EqualTo(1));
        }

        [Test]
        public void HarvestB2MultipliesExperienceFromKills()
        {
            EquipResolved(
                "harvest",
                5,
                "3:harvestB",
                "5:harvestB2");
            EnemyState enemy = AddEnemy(
                new Float2(200f, 200f),
                5f);

            HitWithProfile(
                enemy.Position,
                CardEffectResolver.Resolve(_state));

            Assert.That(_state.Experience, Is.EqualTo(1.2f));
        }

        [Test]
        public void HarvestC2DamagesAllEnemiesAfterMerge()
        {
            EquipResolved(
                "harvest",
                5,
                "3:harvestC",
                "5:harvestC2");
            _system.StepPassives(_state, 0f);
            EnemyState first = AddEnemy(
                new Float2(200f, 200f),
                100f);
            EnemyState second = AddEnemy(
                new Float2(700f, 500f),
                100f);
            var inventory =
                new CardInventorySystem(new EconomyConfig());
            inventory.AddCard(_state, "impact", 1);
            inventory.AddCard(_state, "impact", 1);

            _system.StepPassives(_state, 0f);

            Assert.That(first.Hp, Is.EqualTo(86f));
            Assert.That(second.Hp, Is.EqualTo(86f));
        }

        [TestCase("staticSurge")]
        [TestCase("stormcall")]
        [TestCase("arcSplitter")]
        [TestCase("galvanicWard")]
        [TestCase("overcharge")]
        public void StormRosterCardsArePlayableAndCastable(string type)
        {
            CardState card = _state.CreateCard(type, 3);

            Assert.That(CardPoolSystem.IsPlayable(type), Is.True);
            Assert.That(CombatSystem.SupportsConsumable(card), Is.True);
        }

        [Test]
        public void StaticSurgeRouteAndConsumableApplyVulnerability()
        {
            EquipResolved(
                "staticSurge",
                3,
                "3:staticSurgeB");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            EnemyState enemy = AddEnemy(new Float2(250f, 250f), 100f);

            Assert.That(profile.VulnerableRatio, Is.EqualTo(0.08f));
            Assert.That(
                _system.CastConsumable(
                    _state,
                    _state.CreateCard("staticSurge", 3),
                    enemy.Position),
                Is.True);
            Assert.That(enemy.VulnerableRatio, Is.EqualTo(0.2f));
            Assert.That(enemy.VulnerableRemaining, Is.EqualTo(4f));
        }

        [Test]
        public void StaticSurgePropagationRequiresVulnerableKill()
        {
            EquipResolved(
                "staticSurge",
                5,
                "3:staticSurgeA",
                "5:staticSurgeA2");
            EnemyState victim = AddEnemy(
                new Float2(200f, 200f),
                1f);
            victim.VulnerableRatio = 0.05f;
            victim.VulnerableRemaining = 1f;
            EnemyState nearby = AddEnemy(
                new Float2(250f, 200f),
                100f);

            HitWithProfile(
                victim.Position,
                CardEffectResolver.Resolve(_state));

            Assert.That(nearby.VulnerableRatio, Is.EqualTo(0.1f));
            Assert.That(nearby.VulnerableRemaining, Is.EqualTo(3f));
        }

        [Test]
        public void StaticSurgePropagationSkipsOrdinaryKill()
        {
            EquipResolved(
                "staticSurge",
                5,
                "3:staticSurgeA",
                "5:staticSurgeA2");
            EnemyState victim = AddEnemy(
                new Float2(200f, 200f),
                1f);
            EnemyState nearby = AddEnemy(
                new Float2(250f, 200f),
                100f);

            HitWithProfile(
                victim.Position,
                CardEffectResolver.Resolve(_state));

            Assert.That(nearby.VulnerableRatio, Is.Zero);
        }

        [Test]
        public void StormcallEquipmentStrikesAtConfiguredInterval()
        {
            EquipResolved(
                "stormcall",
                3,
                "3:stormcallB");
            _state.BeginWave(1);
            EnemyState enemy = AddEnemy(
                new Float2(201f, 380f),
                100f);

            _system.StepPassives(_state, 0f);
            _system.StepPassives(_state, 3f);

            Assert.That(enemy.Hp, Is.LessThan(100f));
            Assert.That(
                CardEffectResolver.Resolve(_state).StormcallDamageRatio,
                Is.EqualTo(1.8f));
        }

        [Test]
        public void ArcSplitterRoutesFeedProjectileSplitPipeline()
        {
            EquipResolved(
                "arcSplitter",
                5,
                "3:arcSplitterB",
                "5:arcSplitterB2");

            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            Assert.That(profile.SplitCount, Is.EqualTo(4));
            Assert.That(
                profile.SplitDamageRatio,
                Is.EqualTo(0.875f).Within(0.001f));
            Assert.That(profile.RicochetBounces, Is.EqualTo(1));
        }

        [Test]
        public void ArcSplitterConsumableEmitsConfiguredRadialProjectiles()
        {
            CardState card = _state.CreateCard("arcSplitter", 3);

            _system.CastConsumable(
                _state,
                card,
                new Float2(201f, 300f));

            Assert.That(_state.Bullets, Has.Count.EqualTo(10));
        }

        [Test]
        public void GalvanicWardProvidesWaveAndConsumableShields()
        {
            EquipResolved(
                "galvanicWard",
                3,
                "3:galvanicWardA");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            Assert.That(profile.ShieldHits, Is.EqualTo(3));
            Assert.That(profile.ShieldBreakDamage, Is.EqualTo(24f));

            _system.CastConsumable(
                _state,
                _state.CreateCard("galvanicWard", 3),
                new Float2(201f, 300f));

            Assert.That(_state.ShieldHits, Is.EqualTo(5));
            Assert.That(_state.ShieldMaxHits, Is.EqualTo(5));
        }

        [Test]
        public void OverchargeKillBuildsFireRateStacks()
        {
            EquipResolved(
                "overcharge",
                3,
                "3:overchargeA");
            EnemyState enemy = AddEnemy(
                new Float2(200f, 200f),
                5f);

            HitWithProfile(
                enemy.Position,
                CardEffectResolver.Resolve(_state));

            Assert.That(_state.KillFireRateStacks, Is.EqualTo(1));
            Assert.That(
                _state.FireRateMultiplier,
                Is.EqualTo(1.1f).Within(0.001f));
            Assert.That(_state.FireRateBuffRemaining, Is.EqualTo(4f));
        }

        [TestCase("glacialSpike")]
        [TestCase("permafrost")]
        [TestCase("iceTomb")]
        [TestCase("frozenBulwark")]
        [TestCase("hoarfrostTithe")]
        public void WinterRosterCardsArePlayableAndCastable(string type)
        {
            CardState card = _state.CreateCard(type, 3);

            Assert.That(CardPoolSystem.IsPlayable(type), Is.True);
            Assert.That(CombatSystem.SupportsConsumable(card), Is.True);
        }

        [Test]
        public void GlacialSpikeRouteUsesPierceAndFreezeConfig()
        {
            EquipResolved(
                "glacialSpike",
                3,
                "3:glacialSpikeB");

            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            Assert.That(profile.PierceCount, Is.EqualTo(2));
            Assert.That(profile.PierceDamageRetention, Is.EqualTo(0.8f));
            Assert.That(profile.FreezeStacksToTrigger, Is.EqualTo(2));
            Assert.That(profile.FreezeDuration, Is.EqualTo(0.8f));
        }

        [Test]
        public void GlacialSpikeConsumableFreezesEnemiesOnItsLine()
        {
            EnemyState enemy = AddEnemy(
                new Float2(201f, 350f),
                200f);

            _system.CastConsumable(
                _state,
                _state.CreateCard("glacialSpike", 3),
                new Float2(201f, 100f));

            Assert.That(enemy.Hp, Is.LessThan(200f));
            Assert.That(enemy.FrozenRemaining, Is.EqualTo(1.2f));
        }

        [Test]
        public void PermafrostCreatesTimedSlowZones()
        {
            EquipResolved(
                "permafrost",
                5,
                "3:permafrostA",
                "5:permafrostA2");
            _state.BeginWave(1);
            AddEnemy(new Float2(201f, 380f), 100f);

            _system.StepPassives(_state, 0f);
            _system.StepPassives(_state, 4f);

            Assert.That(_state.GroundZones, Has.Count.EqualTo(2));
            Assert.That(
                CardEffectResolver.Resolve(_state).PermafrostZoneCount,
                Is.EqualTo(2));
        }

        [Test]
        public void IceTombConsumableFreezesAndMarksAtSixStars()
        {
            EnemyState enemy = AddEnemy(
                new Float2(250f, 250f),
                100f);

            _system.CastConsumable(
                _state,
                _state.CreateCard("iceTomb", 6),
                enemy.Position);

            Assert.That(enemy.FrozenRemaining, Is.EqualTo(2.2f));
            Assert.That(enemy.VulnerableRatio, Is.EqualTo(0.2f));
        }

        [Test]
        public void FrozenBulwarkCombinesShieldAndFreeze()
        {
            EquipResolved(
                "frozenBulwark",
                3,
                "3:frozenBulwarkA");
            EnemyState enemy = AddEnemy(
                new Float2(250f, 250f),
                100f);

            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            _system.CastConsumable(
                _state,
                _state.CreateCard("frozenBulwark", 3),
                enemy.Position);

            Assert.That(profile.ShieldHits, Is.EqualTo(3));
            Assert.That(_state.ShieldHits, Is.EqualTo(5));
            Assert.That(enemy.FrozenRemaining, Is.EqualTo(1.1f));
        }

        [Test]
        public void HoarfrostConsumableTemporarilyBoostsEconomy()
        {
            _system.CastConsumable(
                _state,
                _state.CreateCard("hoarfrostTithe", 3),
                new Float2());

            _system.StepPassives(_state, 0f);

            Assert.That(_state.XpMultiplier, Is.EqualTo(1.3f));
            Assert.That(_state.DropRateMultiplier, Is.EqualTo(1.3f));
            Assert.That(_state.EconomyBuffRemaining, Is.EqualTo(4f));
        }

        [TestCase("meteor")]
        [TestCase("magmaPool")]
        [TestCase("flashfire")]
        [TestCase("cinderheart")]
        [TestCase("ashHarvest")]
        public void InfernoRosterCardsArePlayableAndCastable(string type)
        {
            CardState card = _state.CreateCard(type, 3);

            Assert.That(CardPoolSystem.IsPlayable(type), Is.True);
            Assert.That(CombatSystem.SupportsConsumable(card), Is.True);
        }

        [Test]
        public void MeteorRouteAndConsumableCreateConfiguredImpacts()
        {
            EquipResolved("meteor", 3, "3:meteorB");
            EnemyState enemy = AddEnemy(
                new Float2(250f, 250f),
                200f);

            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            _system.CastConsumable(
                _state,
                _state.CreateCard("meteor", 3),
                enemy.Position);

            Assert.That(profile.MeteorRadius, Is.EqualTo(80f));
            Assert.That(profile.MeteorDamageRatio, Is.EqualTo(2.2f));
            Assert.That(enemy.Hp, Is.LessThan(200f));
        }

        [Test]
        public void MagmaPoolEquipmentCreatesPersistentZones()
        {
            EquipResolved(
                "magmaPool",
                5,
                "3:magmaPoolA",
                "5:magmaPoolA2");
            _state.BeginWave(1);
            AddEnemy(new Float2(201f, 380f), 100f);

            _system.StepPassives(_state, 0f);
            _system.StepPassives(_state, 4f);

            Assert.That(_state.GroundZones, Has.Count.EqualTo(2));
        }

        [Test]
        public void MagmaDeathBurstRequiresDotKill()
        {
            EquipResolved(
                "magmaPool",
                5,
                "3:magmaPoolA",
                "5:magmaPoolC2");
            EnemyState victim = AddEnemy(
                new Float2(200f, 200f),
                1f);
            victim.DotRemaining = 1f;
            EnemyState nearby = AddEnemy(
                new Float2(250f, 200f),
                100f);

            HitWithProfile(
                victim.Position,
                CardEffectResolver.Resolve(_state));

            Assert.That(nearby.Hp, Is.EqualTo(82f));
        }

        [Test]
        public void MagmaDeathBurstSkipsOrdinaryKill()
        {
            EquipResolved(
                "magmaPool",
                5,
                "3:magmaPoolA",
                "5:magmaPoolC2");
            EnemyState victim = AddEnemy(
                new Float2(200f, 200f),
                1f);
            EnemyState nearby = AddEnemy(
                new Float2(250f, 200f),
                100f);

            HitWithProfile(
                victim.Position,
                CardEffectResolver.Resolve(_state));

            Assert.That(nearby.Hp, Is.EqualTo(100f));
        }

        [Test]
        public void FlashfireConsumableKnocksBackAndIgnites()
        {
            EnemyState enemy = AddEnemy(
                new Float2(250f, 250f),
                100f);
            Float2 original = enemy.Position;

            _system.CastConsumable(
                _state,
                _state.CreateCard("flashfire", 3),
                new Float2(201f, 300f));

            Assert.That(enemy.Position.X, Is.GreaterThan(original.X));
            Assert.That(enemy.DotRemaining, Is.EqualTo(3f));
        }

        [Test]
        public void CinderheartCombinesBreachDefenseAndBurningZone()
        {
            EquipResolved(
                "cinderheart",
                5,
                "3:cinderheartA",
                "5:cinderheartB2");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            _system.CastConsumable(
                _state,
                _state.CreateCard("cinderheart", 3),
                new Float2(201f, 300f));

            Assert.That(profile.BreachReductionRatio, Is.GreaterThan(0f));
            Assert.That(profile.ScorchAuraRadius, Is.EqualTo(105f));
            Assert.That(
                _state.DefenseDurabilityMultiplier,
                Is.EqualTo(1.35f));
            Assert.That(_state.GroundZones, Has.Count.EqualTo(1));
        }

        [Test]
        public void AshHarvestRoutesAndConsumableBoostEconomy()
        {
            EquipResolved(
                "ashHarvest",
                5,
                "3:ashHarvestA",
                "5:ashHarvestA2");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            _system.CastConsumable(
                _state,
                _state.CreateCard("ashHarvest", 3),
                new Float2());
            _system.StepPassives(_state, 0f);

            Assert.That(profile.DotKillXpMultiplier, Is.EqualTo(1.24f));
            Assert.That(profile.ExpiryConvertRatio, Is.EqualTo(0.65f));
            Assert.That(_state.XpMultiplier, Is.EqualTo(1.3f));
            Assert.That(_state.DropRateMultiplier, Is.EqualTo(1.3f));
        }

        [TestCase("sentinel")]
        [TestCase("retribution")]
        [TestCase("ironvine")]
        public void BulwarkRosterCardsArePlayableAndCastable(string type)
        {
            CardState card = _state.CreateCard(type, 3);

            Assert.That(CardPoolSystem.IsPlayable(type), Is.True);
            Assert.That(CombatSystem.SupportsConsumable(card), Is.True);
        }

        [Test]
        public void SentinelRouteCreatesMirrorTurretAndConsumable()
        {
            EquipResolved(
                "sentinel",
                5,
                "3:sentinelA",
                "5:sentinelA2");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            _system.CastConsumable(
                _state,
                _state.CreateCard("sentinel", 6),
                new Float2(300f, 300f));

            Assert.That(profile.DecoyMirrorTurret, Is.True);
            Assert.That(profile.DecoyCount, Is.EqualTo(2));
            Assert.That(_state.DecoyIsMirrorTurret, Is.True);
            Assert.That(_state.SecondaryDecoyActive, Is.True);
        }

        [Test]
        public void RetributionRouteAndConsumableDamageAndStun()
        {
            EquipResolved(
                "retribution",
                5,
                "3:retributionB",
                "5:retributionA2");
            EnemyState enemy = AddEnemy(
                new Float2(250f, 250f),
                200f);
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            _system.CastConsumable(
                _state,
                _state.CreateCard("retribution", 3),
                enemy.Position);

            Assert.That(
                profile.BreachBurstDamageMultiplier,
                Is.EqualTo(2.88f).Within(0.001f));
            Assert.That(profile.BreachVulnerableRatio, Is.EqualTo(0.2f));
            Assert.That(enemy.Hp, Is.LessThan(200f));
            Assert.That(enemy.StunnedRemaining, Is.EqualTo(0.6f));
        }

        [Test]
        public void IronvineRouteAndConsumableBoostDrops()
        {
            EquipResolved(
                "ironvine",
                5,
                "3:ironvineB",
                "5:ironvineA2");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            _system.CastConsumable(
                _state,
                _state.CreateCard("ironvine", 3),
                new Float2());
            _system.StepPassives(_state, 0f);

            Assert.That(profile.DropLifetimeMultiplier, Is.GreaterThan(1.25f));
            Assert.That(profile.XpMultiplier, Is.EqualTo(1.18f));
            Assert.That(_state.DropRateMultiplier, Is.GreaterThan(1.3f));
            Assert.That(_state.DropLifetimeMultiplier, Is.GreaterThan(1.3f));
        }

        [Test]
        public void IronvineRetaliationDropRequiresRetaliationKill()
        {
            CardState ironvine = _state.CreateCard("ironvine", 5);
            ironvine.EvolutionPath.Add("3:ironvineC");
            ironvine.EvolutionPath.Add("5:ironvineC2");
            _state.Equipment[0] = ironvine;
            CardState thorns = _state.CreateCard("thorns", 3);
            thorns.EvolutionPath.Add("3:thornsA");
            _state.Equipment[1] = thorns;
            var economy = new EconomyConfig();
            economy.defaults.dropChance = 0f;
            var drops = new DropSystem(
                economy,
                new ConstantRandomSource(0f));
            var system = new CombatSystem(
                _combat,
                _enemies,
                drops);
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            EnemyState plain = AddEnemy(
                new Float2(200f, 200f),
                1f);

            HitWithSystem(system, plain.Position, profile);

            Assert.That(_state.GroundDrops, Is.Empty);
            Assert.That(
                profile.ControlledKillExtraDropChance,
                Is.Zero);
            Assert.That(
                profile.RetaliationKillExtraDropChance,
                Is.EqualTo(0.2f));

            Float2 turret = new Float2(
                _combat.turret.x,
                _combat.turret.y);
            EnemyState retaliationVictim = AddEnemy(
                turret + new Float2(60f, 0f),
                1f);
            AddEnemy(turret, 100f, 5f);

            system.StepEnemies(_state, 0f);

            Assert.That(_state.Enemies.Contains(retaliationVictim), Is.False);
            Assert.That(_state.GroundDrops.Count, Is.EqualTo(1));
        }

        [TestCase("fateLoom")]
        [TestCase("goldenVolley")]
        [TestCase("bountyCall")]
        [TestCase("overgrowth")]
        [TestCase("springOfLife")]
        [TestCase("luckyStar")]
        public void PlentyRosterCardsArePlayableAndCastable(string type)
        {
            CardState card = _state.CreateCard(type, 3);

            Assert.That(CardPoolSystem.IsPlayable(type), Is.True);
            Assert.That(CombatSystem.SupportsConsumable(card), Is.True);
        }

        [Test]
        public void FateLoomRouteDrivesMergePulseAndConsumable()
        {
            EquipResolved(
                "fateLoom",
                5,
                "3:fateLoomA",
                "5:fateLoomA2");
            EnemyState enemy = AddEnemy(
                new Float2(250f, 250f),
                200f);
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            _system.CastConsumable(
                _state,
                _state.CreateCard("fateLoom", 3),
                enemy.Position);

            Assert.That(
                profile.MergePulseDamagePerStar,
                Is.EqualTo(11.25f));
            Assert.That(profile.MergeVulnerableRatio, Is.EqualTo(0.15f));
            Assert.That(enemy.Hp, Is.LessThan(200f));
        }

        [Test]
        public void GoldenVolleyRouteUsesSplashAndSplitPipeline()
        {
            EquipResolved(
                "goldenVolley",
                5,
                "3:goldenVolleyB",
                "5:goldenVolleyC2");

            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            Assert.That(
                profile.SplashDamageRatio,
                Is.EqualTo(2.3f).Within(0.001f));
            Assert.That(profile.SplitCount, Is.EqualTo(2));
            Assert.That(profile.SplitDamageRatio, Is.EqualTo(0.55f));
        }

        [Test]
        public void GoldenVolleyFocusRouteBrandsTheHitTarget()
        {
            EquipResolved(
                "goldenVolley",
                3,
                "3:goldenVolleyC");
            EnemyState enemy = AddEnemy(
                new Float2(200f, 200f),
                100f);

            HitWithProfile(
                enemy.Position,
                CardEffectResolver.Resolve(_state));

            Assert.That(enemy.FocusPriorityWeight, Is.EqualTo(3f));
            Assert.That(enemy.FocusPriorityRemaining, Is.EqualTo(3f));
        }

        [Test]
        public void GoldenVolleyBrandedBurstRequiresBrand()
        {
            EquipResolved(
                "goldenVolley",
                5,
                "3:goldenVolleyA",
                "5:goldenVolleyA2");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            EnemyState branded = AddEnemy(
                new Float2(200f, 200f),
                100f);
            branded.FocusPriorityRemaining = 2f;
            EnemyState brandedNearby = AddEnemy(
                new Float2(220f, 200f),
                100f);
            EnemyState plain = AddEnemy(
                new Float2(500f, 200f),
                100f);
            EnemyState plainNearby = AddEnemy(
                new Float2(520f, 200f),
                100f);

            HitWithProfile(branded.Position, profile);
            HitWithProfile(plain.Position, profile);

            Assert.That(
                brandedNearby.Hp,
                Is.EqualTo(78.2f).Within(0.001f));
            Assert.That(
                plainNearby.Hp,
                Is.EqualTo(86.2f).Within(0.001f));
        }

        [Test]
        public void GoldenVolleyBonusDropRequiresBrandedKill()
        {
            EquipResolved(
                "goldenVolley",
                5,
                "3:goldenVolleyA",
                "5:goldenVolleyB2");
            var economy = new EconomyConfig();
            economy.defaults.dropChance = 0f;
            var drops = new DropSystem(
                economy,
                new ConstantRandomSource(0f));
            var system = new CombatSystem(
                _combat,
                _enemies,
                drops);
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);
            EnemyState plain = AddEnemy(
                new Float2(200f, 200f),
                1f);

            HitWithSystem(system, plain.Position, profile);

            Assert.That(_state.GroundDrops, Is.Empty);

            EnemyState branded = AddEnemy(
                new Float2(500f, 200f),
                1f);
            branded.FocusPriorityRemaining = 2f;

            HitWithSystem(system, branded.Position, profile);

            Assert.That(_state.GroundDrops.Count, Is.EqualTo(1));
        }

        [Test]
        public void BountyCallConsumableMarksPriorityTargets()
        {
            EnemyState enemy = AddEnemy(
                new Float2(250f, 250f),
                100f);

            _system.CastConsumable(
                _state,
                _state.CreateCard("bountyCall", 6),
                enemy.Position);

            Assert.That(enemy.FocusPriorityWeight, Is.EqualTo(8f));
            Assert.That(enemy.VulnerableRatio, Is.EqualTo(0.25f));
            Assert.That(enemy.SlowRatio, Is.EqualTo(0.3f));
        }

        [Test]
        public void BountyCallBrandedKillCreatesPriorityZone()
        {
            EquipResolved(
                "bountyCall",
                5,
                "3:bountyCallA",
                "5:bountyCallA2");
            EnemyState victim = AddEnemy(
                new Float2(200f, 200f),
                1f);
            victim.FocusPriorityRemaining = 2f;
            EnemyState nearby = AddEnemy(
                new Float2(250f, 200f),
                100f);

            HitWithProfile(
                victim.Position,
                CardEffectResolver.Resolve(_state));

            Assert.That(
                nearby.FocusPriorityWeight,
                Is.EqualTo(4f));
            Assert.That(
                nearby.FocusPriorityRemaining,
                Is.EqualTo(3f));
        }

        [Test]
        public void BountyCallBrandedKillStartsXpBuff()
        {
            EquipResolved(
                "bountyCall",
                5,
                "3:bountyCallA",
                "5:bountyCallB2");
            EnemyState victim = AddEnemy(
                new Float2(200f, 200f),
                1f);
            victim.FocusPriorityRemaining = 2f;

            HitWithProfile(
                victim.Position,
                CardEffectResolver.Resolve(_state));

            Assert.That(
                _state.KillXpBuffMultiplier,
                Is.EqualTo(1.35f));
            Assert.That(
                _state.KillXpBuffRemaining,
                Is.EqualTo(3f));
        }

        [Test]
        public void OvergrowthEquipmentAndConsumableCreateZones()
        {
            EquipResolved(
                "overgrowth",
                5,
                "3:overgrowthC",
                "5:overgrowthC2");
            _system.CastConsumable(
                _state,
                _state.CreateCard("overgrowth", 3),
                new Float2(250f, 250f));

            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            Assert.That(profile.OvergrowthZoneCount, Is.EqualTo(2));
            Assert.That(profile.OvergrowthVulnerableRatio, Is.EqualTo(0.1f));
            Assert.That(_state.GroundZones, Has.Count.EqualTo(1));
        }

        [Test]
        public void SpringOfLifeConsumableAddsSixStarShield()
        {
            _system.CastConsumable(
                _state,
                _state.CreateCard("springOfLife", 6),
                new Float2());

            Assert.That(_state.ShieldHits, Is.EqualTo(2));
        }

        [Test]
        public void LuckyStarRouteAndConsumableBoostEconomy()
        {
            EquipResolved(
                "luckyStar",
                5,
                "3:luckyStarB",
                "5:luckyStarB2");
            CardCombatProfile profile = CardEffectResolver.Resolve(_state);

            _system.CastConsumable(
                _state,
                _state.CreateCard("luckyStar", 3),
                new Float2());
            _system.StepPassives(_state, 0f);

            Assert.That(profile.DropLifetimeMultiplier, Is.EqualTo(1.3f));
            Assert.That(profile.ExpiryConvertRatio, Is.EqualTo(0.7f));
            Assert.That(_state.XpMultiplier, Is.GreaterThan(1.4f));
            Assert.That(_state.DropRateMultiplier, Is.GreaterThan(1.4f));
        }

        private void EquipResolved(
            string type,
            int star,
            params string[] paths)
        {
            CardState card = _state.CreateCard(type, star);
            card.EvolutionPath.AddRange(paths);
            _state.Equipment[0] = card;
        }

        private EnemyState AddEnemy(
            Float2 position,
            float hp,
            float damage = 1f)
        {
            var enemy = new EnemyState(
                _nextEnemyId++,
                EnemyKind.Normal,
                position,
                hp,
                10f,
                8f,
                damage);
            _state.Enemies.Add(enemy);
            return enemy;
        }

        private void HitWithProfile(
            Float2 position,
            CardCombatProfile profile)
        {
            HitWithSystem(_system, position, profile);
        }

        private void HitWithSystem(
            CombatSystem system,
            Float2 position,
            CardCombatProfile profile)
        {
            _state.Bullets.Add(new BulletState(
                _nextBulletId++,
                position,
                new Float2(),
                5f,
                1f,
                10f,
                profile));
            system.StepBullets(_state, 0f);
        }

        private sealed class ConstantRandomSource : IRandomSource
        {
            private readonly float _value;

            public ConstantRandomSource(float value)
            {
                _value = value;
            }

            public float NextFloat()
            {
                return _value;
            }
        }
    }
}
