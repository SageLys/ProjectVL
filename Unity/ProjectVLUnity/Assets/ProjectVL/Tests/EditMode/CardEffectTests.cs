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
            _state.Bullets.Add(new BulletState(
                _nextBulletId++,
                position,
                new Float2(),
                5f,
                1f,
                10f,
                profile));
            _system.StepBullets(_state, 0f);
        }
    }
}
