using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public static class CardEffectResolver
    {
        public static CardCombatProfile Resolve(GameState state)
        {
            var profile = new CardCombatProfile();
            if (state == null)
            {
                return profile;
            }

            foreach (CardState card in state.Equipment)
            {
                if (card == null || card.Provisional || card.Star < 3)
                {
                    continue;
                }

                switch (card.Type)
                {
                    case "pierce":
                        ApplyPierce(card, profile);
                        break;
                    case "chainLightning":
                        ApplyChainLightning(card, profile);
                        break;
                    case "frost":
                        ApplyFrost(card, profile);
                        break;
                    case "scorch":
                        ApplyScorch(card, profile);
                        break;
                    case "splitBlast":
                        ApplySplitBlast(card, profile);
                        break;
                    case "impact":
                        ApplyImpact(card, profile);
                        break;
                    case "sanctum":
                        ApplySanctum(card, profile);
                        break;
                    case "aegis":
                        ApplyAegis(card, profile);
                        break;
                    case "thorns":
                        ApplyThorns(card, profile);
                        break;
                    case "decoy":
                        ApplyDecoy(card, profile);
                        break;
                    case "harvest":
                        ApplyHarvest(card, profile);
                        break;
                    case "frozenThunder":
                        ApplyFrozenThunder(profile);
                        break;
                    case "solarLance":
                        ApplySolarLance(profile);
                        break;
                    case "avalanche":
                        ApplyAvalanche(profile);
                        break;
                    case "pyrestorm":
                        ApplyPyrestorm(profile);
                        break;
                    case "crownOfThorns":
                        ApplyCrownOfThorns(profile);
                        break;
                    case "goldenIdol":
                        ApplyGoldenIdol(profile);
                        break;
                    case "staticSurge":
                        ApplyStaticSurge(card, profile);
                        break;
                    case "stormcall":
                        ApplyStormcall(card, profile);
                        break;
                    case "arcSplitter":
                        ApplyArcSplitter(card, profile);
                        break;
                    case "galvanicWard":
                        ApplyGalvanicWard(card, profile);
                        break;
                    case "overcharge":
                        ApplyOvercharge(card, profile);
                        break;
                    case "glacialSpike":
                        ApplyGlacialSpike(card, profile);
                        break;
                    case "permafrost":
                        ApplyPermafrost(card, profile);
                        break;
                    case "iceTomb":
                        ApplyIceTomb(card, profile);
                        break;
                    case "frozenBulwark":
                        ApplyFrozenBulwark(card, profile);
                        break;
                    case "hoarfrostTithe":
                        ApplyHoarfrostTithe(card, profile);
                        break;
                    case "meteor":
                        ApplyMeteor(card, profile);
                        break;
                    case "magmaPool":
                        ApplyMagmaPool(card, profile);
                        break;
                    case "flashfire":
                        ApplyFlashfire(card, profile);
                        break;
                    case "cinderheart":
                        ApplyCinderheart(card, profile);
                        break;
                    case "ashHarvest":
                        ApplyAshHarvest(card, profile);
                        break;
                    case "sentinel":
                        ApplySentinel(card, profile);
                        break;
                    case "retribution":
                        ApplyRetribution(card, profile);
                        break;
                    case "ironvine":
                        ApplyIronvine(card, profile);
                        break;
                    case "fateLoom":
                        ApplyFateLoom(card, profile);
                        break;
                    case "goldenVolley":
                        ApplyGoldenVolley(card, profile);
                        break;
                    case "bountyCall":
                        ApplyBountyCall(card, profile);
                        break;
                    case "overgrowth":
                        ApplyOvergrowth(card, profile);
                        break;
                    case "springOfLife":
                        ApplySpringOfLife(card, profile);
                        break;
                    case "luckyStar":
                        ApplyLuckyStar(card, profile);
                        break;
                }
            }

            RelicScalingSystem.Apply(state, profile);
            CardAffixSystem.ApplyProfile(state, profile);
            return profile;
        }

        private static void ApplyPierce(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.BeamInterval = 0.9f;
                profile.BeamWidth = 32f;
                profile.BeamDamageRatio = 1f;
                return;
            }

            string route = RouteAt(card, 3);
            if (route == "pierceB")
            {
                profile.PierceCount += 1;
                profile.PierceDamageRetention = 0.9f;
                profile.RampPerPierce += 0.3f;
            }
            else
            {
                profile.PierceCount += 2;
                profile.PierceDamageRetention =
                    route == "pierceC" ? 0.75f : 0.8f;
                profile.RampPerPierce += 0.1f;
                if (route == "pierceC")
                {
                    profile.VulnerableRatio =
                        Max(profile.VulnerableRatio, 0.12f);
                    profile.VulnerableDuration =
                        Max(profile.VulnerableDuration, 2f);
                }
            }

            if (card.Star >= 4)
            {
                profile.PierceCount += 1;
                profile.PierceDamageRetention =
                    System.Math.Min(
                        1f,
                        profile.PierceDamageRetention + 0.1f);
            }

            string advancedRoute = RouteAt(card, 5);
            if (advancedRoute == "pierceA2")
            {
                profile.RicochetBounces += 1;
            }
            else if (advancedRoute == "pierceB2")
            {
                profile.PierceCount += 1;
                profile.PierceDamageRetention = 1f;
                profile.RampPerPierce += 0.25f;
            }
            else if (advancedRoute == "pierceC2")
            {
                profile.SplitCount += 2;
                profile.SplitDamageRatio =
                    Max(profile.SplitDamageRatio, 0.6f);
            }
        }

        private static void ApplyChainLightning(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.ChainPulseInterval = 1.2f;
                profile.ChainPulseTargets = 3;
                profile.ChainPulseBounces = 2;
                profile.ChainPulseDamageRetention = 0.8f;
                profile.ChainPulseSearchRange = 160f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.ChainBounces += route == "chainLightningB" ? 1 : 2;
            profile.ChainDamageRetention =
                route == "chainLightningB" ? 0.95f : 0.7f;
            profile.ChainSearchRange =
                Max(profile.ChainSearchRange, 120f);
            if (route == "chainLightningC")
            {
                profile.VulnerableRatio =
                    Max(profile.VulnerableRatio, 0.06f);
                profile.VulnerableDuration =
                    Max(profile.VulnerableDuration, 2f);
            }
            else
            {
                profile.SlowRatio = Max(profile.SlowRatio, 0.2f);
                profile.SlowDuration = Max(profile.SlowDuration, 1.2f);
            }

            if (card.Star >= 4)
            {
                profile.ChainBounces += 1;
                profile.ChainSearchRange += 20f;
            }

            string advancedRoute = RouteAt(card, 5);
            if (advancedRoute == "chainLightningA2")
            {
                profile.ChainKillBounces = 2;
                profile.ChainKillDamageRetention = 0.5f;
                profile.ChainKillSearchRange = 140f;
            }
            else if (advancedRoute == "chainLightningB2")
            {
                profile.DotDamageRatio =
                    Max(profile.DotDamageRatio, 0.08f);
                profile.DotDuration =
                    Max(profile.DotDuration, 2f);
                profile.DotTickInterval = 0.5f;
            }
            else if (advancedRoute == "chainLightningC2")
            {
                profile.SplashRadius =
                    Max(profile.SplashRadius, 65f);
                profile.SplashDamageRatio =
                    Max(profile.SplashDamageRatio, 0.65f);
            }
        }

        private static void ApplyFrost(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.FrostAuraRadiusRatio = 0.6f;
                profile.FrostAuraSlowRatio = 0.35f;
                profile.FrostAuraSlowDuration = 1.2f;
                profile.FrostNovaInterval = 4f;
                profile.FrostNovaRadius = 150f;
                profile.FrostNovaDuration = 0.6f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.SlowRatio = Max(profile.SlowRatio, 0.3f);
            profile.SlowDuration = Max(profile.SlowDuration, 1.5f);
            profile.FreezeDuration = Max(profile.FreezeDuration, 0.8f);
            profile.FreezeStacksToTrigger =
                route == "frostB" ? 2 : 3;
            if (route == "frostC")
            {
                profile.FrostHitZoneRadius = 45f;
                profile.FrostHitZoneDuration = 1.5f;
                profile.FrostHitZoneTickInterval = 0.5f;
                profile.FrostHitZoneSlowRatio = 0.25f;
                profile.FrostHitZoneSlowDuration = 0.7f;
            }
            if (card.Star >= 4)
            {
                profile.SlowRatio =
                    Max(profile.SlowRatio, 0.4f);
                profile.FreezeStacksToTrigger =
                    System.Math.Max(
                        1,
                        profile.FreezeStacksToTrigger - 1);
            }

            string advancedRoute = RouteAt(card, 5);
            if (advancedRoute == "frostA2")
            {
                profile.FrozenKillSplashRadius = 80f;
                profile.FrozenKillSplashDamageRatio = 0.5f;
                profile.FrozenKillSlowRatio = 0.3f;
                profile.FrozenKillSlowDuration = 1.5f;
            }
            else if (advancedRoute == "frostB2")
            {
                profile.FrozenKillSplashRadius = 90f;
                profile.FrozenKillSplashDamageRatio = 0.8f;
            }
            else if (advancedRoute == "frostC2")
            {
                profile.FrozenHitVulnerableRatio = 0.16f;
                profile.FrozenHitVulnerableDuration = 2f;
            }
        }

        private static void ApplyScorch(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.ScorchAuraRadius = 200f;
                profile.ScorchAuraTickInterval = 0.5f;
                profile.ScorchAuraDamageRatio = 0.1f;
                profile.ScorchAuraSlowRatio = 0.15f;
                profile.ScorchAuraSlowDuration = 0.6f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.DotDamageRatio =
                Max(profile.DotDamageRatio, 0.15f);
            profile.DotDuration = Max(
                profile.DotDuration,
                route == "scorchB" ? 4f : 2.5f);
            profile.DotTickInterval = 0.5f;
            profile.DotAreaRadius =
                Max(profile.DotAreaRadius, 40f);
            if (route == "scorchC")
            {
                profile.SlowRatio = Max(profile.SlowRatio, 0.15f);
                profile.SlowDuration = Max(profile.SlowDuration, 0.6f);
            }

            if (card.Star >= 4)
            {
                profile.DotAreaRadius =
                    Max(profile.DotAreaRadius, 50f);
                profile.DotDamageRatio *= 1.3f;
            }

            string advancedRoute = RouteAt(card, 5);
            if (advancedRoute == "scorchA2")
            {
                profile.DotAreaVulnerableRatio = 0.15f;
                profile.DotAreaVulnerableDuration = 0.6f;
            }
            else if (advancedRoute == "scorchB2")
            {
                profile.DotHitVulnerableRatio = 0.16f;
                profile.DotHitVulnerableDuration = 2f;
            }
            else if (advancedRoute == "scorchC2")
            {
                profile.SecondaryDotDamageRatio = 0.075f;
                profile.SecondaryDotTickInterval = 0.25f;
                profile.SecondaryDotDuration = 2f;
            }
        }

        private static void ApplySplitBlast(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.ProjectileDamageMultiplier = 1.3f;
                profile.SplashRadius = 90f;
                profile.SplashDamageRatio = 1f;
                profile.SplashFalloff = 0.5f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.SplitCount += 2;
            profile.SplitDamageRatio = route == "splitBlastB"
                ? 0.45f
                : 0.5f;
            if (route == "splitBlastC")
            {
                profile.DotDamageRatio =
                    Max(profile.DotDamageRatio, 0.08f);
                profile.DotDuration = Max(profile.DotDuration, 2f);
                profile.DotTickInterval = 0.5f;
            }
            else
            {
                profile.SplashRadius = Max(profile.SplashRadius, 40f);
                profile.SplashDamageRatio = Max(
                    profile.SplashDamageRatio,
                    route == "splitBlastB" ? 1f : 0.6f);
            }

            if (card.Star >= 4)
            {
                profile.SplitCount += 1;
                if (profile.SplashRadius > 0f)
                {
                    profile.SplashRadius *= 1.25f;
                }
            }

            string advancedRoute = RouteAt(card, 5);
            if (advancedRoute == "splitBlastA2")
            {
                profile.RecursiveSplitCount = 2;
                profile.RecursiveSplitDamageRatio = 0.5f;
            }
            else if (advancedRoute == "splitBlastB2")
            {
                profile.SecondarySplashRadius = 100f;
                profile.SecondarySplashDamageRatio = 0.65f;
            }
            else if (advancedRoute == "splitBlastC2")
            {
                profile.HitAreaKnockbackRadius = 87.5f;
                profile.HitAreaKnockbackDistance = 45f;
            }
        }

        private static void ApplyImpact(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.ImpactPulseInterval = 4f;
                profile.ImpactPulseRadius = 150f;
                profile.ImpactPulseKnockback = 100f;
                profile.ImpactPulseStunDuration = 0.4f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.KnockbackDistance =
                Max(profile.KnockbackDistance, 22f);
            if (route == "impactB")
            {
                profile.SlowRatio = Max(profile.SlowRatio, 0.25f);
                profile.SlowDuration = Max(profile.SlowDuration, 1.2f);
            }
            else if (route == "impactC")
            {
                profile.KnockbackCollisionDamageRatio = 0.6f;
                profile.SplashRadius = Max(profile.SplashRadius, 35f);
                profile.SplashDamageRatio =
                    Max(profile.SplashDamageRatio, 0.4f);
            }
            else
            {
                profile.KnockbackCollisionDamageRatio = 0.3f;
            }

            if (card.Star >= 4)
            {
                profile.KnockbackDistance *= 1.3f;
                profile.KnockbackCollisionDamageRatio *= 1.5f;
            }

            string advancedRoute = RouteAt(card, 5);
            if (advancedRoute == "impactA2")
            {
                profile.ImpactBreachRadius = 150f;
                profile.ImpactBreachKnockback = 80f;
                profile.ImpactBreachStunDuration = 0.4f;
                profile.ImpactBreachCooldown = 6f;
            }
            else if (advancedRoute == "impactB2")
            {
                profile.ImpactPulseRadius = 140f;
                profile.ImpactPulseKnockback = 75f;
                profile.ImpactPulseInterval = 4f;
            }
            else if (advancedRoute == "impactC2")
            {
                profile.OnHitStunDuration = 0.35f;
                profile.OnHitStunCooldown = 1.5f;
            }
        }

        private static void ApplySanctum(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.SanctumPulseInterval = 3f;
                profile.SanctumPulseRadius = 170f;
                profile.SanctumPulseVulnerableRatio = 0.4f;
                profile.SanctumPulseVulnerableDuration = 2f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.AuraRadiusRatio =
                Max(profile.AuraRadiusRatio, 0.5f);
            profile.AuraVulnerableRatio =
                Max(profile.AuraVulnerableRatio, 0.2f);
            profile.AuraSlowRatio = Max(
                profile.AuraSlowRatio,
                route == "sanctumB" ? 0.25f : 0.1f);
            if (route == "sanctumC")
            {
                profile.WaveStartFireRateMultiplier =
                    Max(profile.WaveStartFireRateMultiplier, 1.15f);
                profile.WaveStartFireRateDuration =
                    Max(profile.WaveStartFireRateDuration, 5f);
            }

            if (card.Star >= 4)
            {
                profile.AuraRadiusRatio *= 1.15f;
                profile.AuraVulnerableRatio += 0.1f;
                profile.AuraSlowRatio += 0.1f;
            }

            string advancedRoute = RouteAt(card, 5);
            if (advancedRoute == "sanctumA2")
            {
                profile.AuraFocusPriorityWeight = 3f;
                profile.AuraFocusHpThresholdRatio = 0.3f;
            }
            else if (advancedRoute == "sanctumB2")
            {
                profile.AuraVulnerableRatio = Max(
                    profile.AuraVulnerableRatio,
                    card.Star >= 4 ? 0.26f : 0.16f);
            }
        }

        private static void ApplyAegis(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.ShieldHits = 3;
                profile.ShieldRegenSeconds = 6f;
                profile.ShieldBreakDamage = 50f;
                profile.ShieldBreakKnockback = 130f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.ShieldHits = 2;
            profile.ShieldRegenSeconds =
                route == "aegisB" ? 7f : 10f;
            if (route == "aegisC")
            {
                profile.ShieldBreakDamage = 28f;
                profile.ShieldBreakKnockback = 70f;
            }
            else
            {
                profile.BreachReductionRatio = System.Math.Min(
                    0.9f,
                    profile.BreachReductionRatio + 0.2f);
            }

            if (card.Star >= 4)
            {
                profile.ShieldHits += 1;
                profile.ShieldRegenSeconds =
                    System.Math.Max(
                        0f,
                        profile.ShieldRegenSeconds - 2f);
            }

            string advancedRoute = RouteAt(card, 5);
            if (advancedRoute == "aegisA2")
            {
                profile.ShieldBreakDamage = 30f;
                profile.ShieldBreakKnockback = 100f;
            }
            else if (advancedRoute == "aegisB2")
            {
                profile.BreachReductionRatio = System.Math.Min(
                    0.9f,
                    profile.BreachReductionRatio + 0.18f);
            }
            else if (advancedRoute == "aegisC2")
            {
                profile.ShieldBreakDamage = 30f;
                profile.ShieldBreakKnockback = 135f;
            }
        }

        private static void ApplyThorns(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.ThornsAuraRadius = 130f;
                profile.ThornsAuraTickInterval = 0.4f;
                profile.ThornsAuraDamageRatio = 0.15f;
                profile.ThornsAuraExecuteThresholdRatio = 0.2f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.BreachReductionRatio = System.Math.Min(
                0.9f,
                profile.BreachReductionRatio
                    + (route == "thornsA" ? 0.35f : 0.3f));
            if (route == "thornsA")
            {
                profile.BreachBurstDamageMultiplier = 1.5f;
                profile.BreachBurstRadius = 100f;
                profile.BreachKnockback = 90f;
            }
            else if (route == "thornsB")
            {
                profile.ThornsRatio = 0.3f;
                profile.BreachBurstDamageMultiplier = 1.2f;
                profile.BreachBurstRadius = 140f;
            }
            else
            {
                profile.ThornsRatio = 0.25f;
                profile.BreachSlowRatio = 0.35f;
                profile.BreachSlowDuration = 1.5f;
                profile.BreachBurstRadius = 120f;
            }

            if (card.Star >= 4)
            {
                profile.BreachReductionRatio = System.Math.Min(
                    0.9f,
                    profile.BreachReductionRatio + 0.1f);
                profile.ThornsRatio += route == "thornsA"
                    ? 0f
                    : 0.1f;
                if (profile.BreachBurstDamageMultiplier > 0f)
                {
                    profile.BreachBurstDamageMultiplier += 0.5f;
                }

                if (profile.BreachSlowRatio > 0f)
                {
                    profile.BreachSlowRatio += 0.1f;
                }
            }

            string advancedRoute = RouteAt(card, 5);
            if (advancedRoute == "thornsA2")
            {
                profile.ThornsAuraRadius = 90f;
                profile.ThornsAuraTickInterval = 0.5f;
                profile.ThornsAuraDamageRatio = 0.1f;
            }
            else if (advancedRoute == "thornsB2")
            {
                profile.BreachVulnerableRadius = 120f;
                profile.BreachVulnerableRatio =
                    card.Star >= 4 ? 0.28f : 0.18f;
                profile.BreachVulnerableDuration = 2f;
            }
            else if (advancedRoute == "thornsC2")
            {
                profile.BreachExecuteRadius = 120f;
                profile.BreachExecuteThresholdRatio = 0.18f;
            }
        }

        private static void ApplyDecoy(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.DecoyHp = 80f;
                profile.DecoyTauntRadius = 2000f;
                profile.DecoyDistance = 150f;
                profile.DecoyCount = 1;
                profile.DecoyMirrorTurret = true;
                profile.DecoyDamageRatio = 0.3f;
                profile.DecoyFireInterval = 0.7f;
                profile.DecoyFireRangeRatio = 0.8f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.DecoyHp = 60f;
            profile.DecoyTauntRadius =
                route == "decoyB" ? 190f : 140f;
            profile.DecoyDistance = 150f;
            profile.DecoyCount = 1;
            if (route == "decoyC")
            {
                profile.DecoyExplodeDamageMultiplier = 1.2f;
                profile.DecoyExplodeKnockback = 70f;
            }

            if (card.Star >= 4)
            {
                profile.DecoyHp *= 1.5f;
                profile.DecoyTauntRadius += 20f;
            }

            string advancedRoute = RouteAt(card, 5);
            if (advancedRoute == "decoyA2")
            {
                profile.DecoyRespawns = 1;
            }
            else if (advancedRoute == "decoyB2")
            {
                profile.DecoyCount = 2;
                profile.SecondaryDecoyDistance = 190f;
            }
            else if (advancedRoute == "decoyC2")
            {
                profile.DecoyAuraRadius = 130f;
                profile.DecoyAuraSlowRatio = 0.3f;
                profile.DecoyAuraSlowDuration = 0.8f;
            }
        }

        private static void ApplyHarvest(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.HarvestWaveStartDrops = 2;
                profile.ExpiryConvertRatio = 1f;
                return;
            }

            string route = RouteAt(card, 3);
            if (route == "harvestA")
            {
                profile.DropRateMultiplier =
                    Max(profile.DropRateMultiplier, 1.25f);
                profile.DropLifetimeMultiplier =
                    Max(profile.DropLifetimeMultiplier, 1.25f);
            }
            else if (route == "harvestB")
            {
                profile.DropRateMultiplier =
                    Max(profile.DropRateMultiplier, 1.1f);
                profile.DropLifetimeMultiplier =
                    Max(profile.DropLifetimeMultiplier, 1.5f);
            }
            else
            {
                profile.DropRateMultiplier =
                    Max(profile.DropRateMultiplier, 1.1f);
                profile.PickupRestore =
                    Max(profile.PickupRestore, 2f);
            }

            if (card.Star >= 4)
            {
                profile.DropRateMultiplier *= 1.1f;
                profile.DropLifetimeMultiplier *= 1.1f;
            }

            string advancedRoute = RouteAt(card, 5);
            if (advancedRoute == "harvestA2")
            {
                profile.ExpiryConvertRatio =
                    Max(profile.ExpiryConvertRatio, 0.5f);
            }
            else if (advancedRoute == "harvestB2")
            {
                profile.XpMultiplier =
                    Max(profile.XpMultiplier, 1.2f);
            }
            else if (advancedRoute == "harvestC2")
            {
                profile.MergePulseDamagePerStar =
                    Max(profile.MergePulseDamagePerStar, 7f);
            }
        }

        private static void ApplyGlacialSpike(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.BeamInterval = 0.9f;
                profile.BeamWidth = 28f;
                profile.BeamDamageRatio = 0.95f;
                profile.FreezeStacksToTrigger = 2;
                profile.FreezeDuration = Max(
                    profile.FreezeDuration,
                    0.7f);
                return;
            }

            string route = RouteAt(card, 3);
            profile.PierceCount += route == "glacialSpikeA" ? 3 : 2;
            profile.PierceDamageRetention =
                route == "glacialSpikeC" ? 0.9f : 0.8f;
            if (route != "glacialSpikeC")
            {
                profile.FreezeStacksToTrigger =
                    route == "glacialSpikeB" ? 2 : 3;
                profile.FreezeDuration = Max(
                    profile.FreezeDuration,
                    0.8f);
            }
            else
            {
                profile.FrozenHitVulnerableRatio = Max(
                    profile.FrozenHitVulnerableRatio,
                    0.08f);
                profile.FrozenHitVulnerableDuration = Max(
                    profile.FrozenHitVulnerableDuration,
                    1f);
            }

            if (card.Star >= 4)
            {
                profile.PierceCount += 1;
                profile.FreezeDuration *= 1.25f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "glacialSpikeA2")
            {
                profile.SplashRadius = Max(profile.SplashRadius, 70f);
                profile.SplashDamageRatio = Max(
                    profile.SplashDamageRatio,
                    0.7f);
                profile.SlowRatio = Max(profile.SlowRatio, 0.3f);
                profile.SlowDuration = Max(profile.SlowDuration, 1.2f);
            }
            else if (advanced == "glacialSpikeB2")
            {
                profile.ChainBounces += 1;
                profile.ChainDamageRetention = 0.7f;
                profile.ChainSearchRange = Max(
                    profile.ChainSearchRange,
                    110f);
            }
            else if (advanced == "glacialSpikeC2")
            {
                profile.FrozenHitExecuteThresholdRatio = 0.16f;
            }
        }

        private static void ApplyPermafrost(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.FrostAuraRadiusRatio = Max(
                    profile.FrostAuraRadiusRatio,
                    155f / 150f);
                profile.FrostAuraSlowRatio = Max(
                    profile.FrostAuraSlowRatio,
                    0.35f);
                profile.FrostAuraSlowDuration = Max(
                    profile.FrostAuraSlowDuration,
                    0.9f);
                profile.FreezeStacksToTrigger = 5;
                profile.FreezeDuration = Max(
                    profile.FreezeDuration,
                    0.5f);
                return;
            }

            string route = RouteAt(card, 3);
            profile.PermafrostInterval = 4f;
            profile.PermafrostZoneCount = 1;
            profile.PermafrostRadius =
                route == "permafrostA" ? 115f : 90f;
            profile.PermafrostDuration = 3f;
            profile.PermafrostSlowRatio =
                route == "permafrostB" ? 0.45f : 0.25f;
            if (route == "permafrostC")
            {
                profile.PermafrostFreezeDuration = 0.6f;
            }

            if (card.Star >= 4)
            {
                profile.PermafrostRadius *= 1.25f;
                profile.PermafrostSlowRatio *= 1.25f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "permafrostA2")
            {
                profile.PermafrostZoneCount = 2;
                profile.PermafrostRadius = 85f;
            }
            else if (advanced == "permafrostB2")
            {
                profile.PermafrostRadius = 95f;
                profile.PermafrostVulnerableRatio = 0.12f;
            }
            else if (advanced == "permafrostC2")
            {
                profile.PermafrostRadius = 130f;
                profile.PermafrostSlowRatio = Max(
                    profile.PermafrostSlowRatio,
                    0.25f);
                profile.PermafrostDuration = 2f;
            }
        }

        private static void ApplyIceTomb(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.FrostNovaInterval = 9f;
                profile.FrostNovaRadius = 1000f;
                profile.FrostNovaDuration = 0.75f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.FreezeStacksToTrigger =
                route == "iceTombA" ? 5 : 8;
            profile.FreezeDuration = Max(
                profile.FreezeDuration,
                route == "iceTombB" ? 1.4f : route == "iceTombC" ? 0.9f : 0.8f);
            if (card.Star >= 4)
            {
                profile.FreezeDuration *= 1.25f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "iceTombA2")
            {
                profile.FrozenKillSplashRadius = 90f;
                profile.FrozenKillSplashDamageRatio = 0.9f;
            }
            else if (advanced == "iceTombB2")
            {
                profile.FrozenKillSplashRadius = 95f;
                profile.FrozenKillFreezeDuration = 0.7f;
            }
            else if (advanced == "iceTombC2")
            {
                profile.FrozenHitVulnerableRatio = 0.22f;
                profile.FrozenHitVulnerableDuration = 1.5f;
            }
        }

        private static void ApplyFrozenBulwark(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.ShieldHits += 4;
                profile.ShieldRegenSeconds = 6f;
                profile.FrostAuraRadiusRatio = Max(
                    profile.FrostAuraRadiusRatio,
                    170f / 150f);
                profile.FrostAuraSlowRatio = Max(
                    profile.FrostAuraSlowRatio,
                    0.3f);
                profile.FrostAuraSlowDuration = Max(
                    profile.FrostAuraSlowDuration,
                    0.9f);
                return;
            }

            string route = RouteAt(card, 3);
            profile.ShieldHits += route == "frozenBulwarkA" ? 3 : 2;
            profile.ShieldRegenSeconds = 10f;
            if (route == "frozenBulwarkA")
            {
                profile.ShieldBreakDamage = Max(
                    profile.ShieldBreakDamage,
                    18f);
                profile.ShieldBreakKnockback = Max(
                    profile.ShieldBreakKnockback,
                    40f);
            }
            else if (route == "frozenBulwarkB")
            {
                profile.BreachBurstRadius = Max(
                    profile.BreachBurstRadius,
                    150f);
                profile.BreachSlowRatio = Max(
                    profile.BreachSlowRatio,
                    0.8f);
                profile.BreachSlowDuration = Max(
                    profile.BreachSlowDuration,
                    0.8f);
            }

            if (card.Star >= 4)
            {
                profile.ShieldHits += 1;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "frozenBulwarkA2")
            {
                profile.ShieldHits += 1;
                profile.ShieldRegenSeconds = 6f;
            }
            else if (advanced == "frozenBulwarkB2")
            {
                profile.BreachBurstRadius = 130f;
                profile.BreachBurstDamageMultiplier = 2.2f;
                profile.BreachSlowRatio = 1f;
                profile.BreachSlowDuration = 0.7f;
            }
            else if (advanced == "frozenBulwarkC2")
            {
                profile.ControlledDamageTakenBonus = Max(
                    profile.ControlledDamageTakenBonus,
                    0.12f);
            }
        }

        private static void ApplyHoarfrostTithe(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.ControlledKillExtraDropChance = Max(
                    profile.ControlledKillExtraDropChance,
                    0.35f);
                return;
            }

            string route = RouteAt(card, 3);
            if (route == "hoarfrostTitheA")
            {
                profile.ControlledKillXpMultiplier = Max(
                    profile.ControlledKillXpMultiplier,
                    1.2f);
                profile.ControlledKillXpDuration = 3f;
                profile.ControlledKillXpMaxStacks = 1;
            }
            else if (route == "hoarfrostTitheB")
            {
                profile.ControlledKillExtraDropChance = Max(
                    profile.ControlledKillExtraDropChance,
                    0.12f);
            }
            else
            {
                profile.DropLifetimeMultiplier = Max(
                    profile.DropLifetimeMultiplier,
                    1.25f);
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "hoarfrostTitheA2")
            {
                profile.FrozenKillRestore = 2f;
            }
            else if (advanced == "hoarfrostTitheB2")
            {
                profile.MergePulseDamagePerStar = Max(
                    profile.MergePulseDamagePerStar,
                    4f);
            }
            else if (advanced == "hoarfrostTitheC2")
            {
                profile.ControlledKillExtraDropChance = Max(
                    profile.ControlledKillExtraDropChance,
                    0.25f);
            }
        }

        private static void ApplyMeteor(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.MeteorInterval = 3f;
                profile.MeteorCount = 2;
                profile.MeteorRadius = 100f;
                profile.MeteorDamageRatio = 2f;
                profile.MeteorFalloff = 0.4f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.MeteorChance = 0.2f;
            profile.MeteorCount = 1;
            profile.MeteorRadius =
                route == "meteorA" ? 110f : 80f;
            profile.MeteorDamageRatio =
                route == "meteorB" ? 2.2f : 1.5f;
            profile.MeteorFalloff = 0.5f;
            if (route == "meteorC")
            {
                profile.MeteorZoneDuration = 2.5f;
                profile.MeteorZoneDamageRatio = 0.12f;
            }

            if (card.Star >= 4)
            {
                profile.MeteorRadius *= 1.2f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "meteorA2")
            {
                profile.MeteorChance = 0.25f;
                profile.MeteorCount = 2;
                profile.MeteorRadius = 75f;
                profile.MeteorDamageRatio = 1.2f;
            }
            else if (advanced == "meteorB2")
            {
                profile.OnHitStunDuration = Max(
                    profile.OnHitStunDuration,
                    0.4f);
                profile.OnHitStunCooldown = Max(
                    profile.OnHitStunCooldown,
                    1.5f);
            }
            else if (advanced == "meteorC2")
            {
                profile.MeteorZoneDuration = 4f;
                profile.MeteorZoneDamageRatio = 0.1f;
            }
        }

        private static void ApplyMagmaPool(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.MagmaAuraRadius = 145f;
                profile.MagmaTickInterval = 0.5f;
                profile.MagmaDamageRatio = 0.18f;
                profile.MagmaVulnerableRatio = 0.08f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.MagmaInterval = 4f;
            profile.MagmaZoneCount = 1;
            profile.MagmaRadius =
                route == "magmaPoolA" ? 115f : 90f;
            profile.MagmaDuration = 3f;
            profile.MagmaTickInterval = 0.5f;
            profile.MagmaDamageRatio =
                route == "magmaPoolB" ? 0.22f : 0.14f;
            if (route == "magmaPoolC")
            {
                profile.MagmaVulnerableRatio = 0.12f;
            }

            if (card.Star >= 4)
            {
                profile.MagmaDuration *= 1.3f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "magmaPoolA2")
            {
                profile.MagmaZoneCount = 2;
                profile.MagmaRadius = 85f;
                profile.MagmaDamageRatio = 0.12f;
            }
            else if (advanced == "magmaPoolB2")
            {
                profile.MagmaRadius = 100f;
                profile.MagmaDamageRatio = 0f;
                profile.MagmaSlowRatio = 0.25f;
            }
            else if (advanced == "magmaPoolC2")
            {
                profile.DotKillBurstRadius = Max(
                    profile.DotKillBurstRadius,
                    90f);
                profile.DotKillBurstDamageMultiplier = Max(
                    profile.DotKillBurstDamageMultiplier,
                    1f);
            }
        }

        private static void ApplyFlashfire(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.BreachBurstDamageMultiplier = Max(
                    profile.BreachBurstDamageMultiplier,
                    3f);
                profile.BreachBurstRadius = Max(
                    profile.BreachBurstRadius,
                    180f);
                profile.BreachKnockback = Max(
                    profile.BreachKnockback,
                    110f);
                profile.BreachDotDamageRatio = 0.2f;
                profile.BreachDotDuration = 3f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.FlashfireInterval = 4f;
            profile.FlashfireRadius =
                route == "flashfireC" ? 155f : 120f;
            profile.FlashfireKnockback =
                route == "flashfireA" ? 80f : 55f;
            profile.FlashfireDotRatio =
                route == "flashfireB" ? 0.18f : 0.1f;
            profile.FlashfireDotDuration = 2f;
            if (card.Star >= 4)
            {
                profile.FlashfireRadius *= 1.15f;
                profile.FlashfireKnockback *= 1.2f;
                profile.FlashfireDotRatio *= 1.2f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "flashfireA2")
            {
                profile.DotHitBurstDamageMultiplier = Max(
                    profile.DotHitBurstDamageMultiplier,
                    0.8f);
                profile.DotHitBurstRadius = Max(
                    profile.DotHitBurstRadius,
                    45f);
            }
            else if (advanced == "flashfireB2")
            {
                profile.OnHitStunDuration = Max(
                    profile.OnHitStunDuration,
                    0.4f);
                profile.OnHitStunCooldown = Max(
                    profile.OnHitStunCooldown,
                    4f);
            }
            else if (advanced == "flashfireC2")
            {
                profile.MagmaRadius = Max(
                    profile.MagmaRadius,
                    70f);
                profile.MagmaDuration = Max(
                    profile.MagmaDuration,
                    3f);
                profile.MagmaTickInterval = 0.5f;
                profile.MagmaDamageRatio = Max(
                    profile.MagmaDamageRatio,
                    0.14f);
            }
        }

        private static void ApplyCinderheart(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.CinderheartRestoreInterval = 2f;
                profile.CinderheartRestoreRatio = 0.02f;
                profile.DotDamageMultiplier = Max(
                    profile.DotDamageMultiplier,
                    1.3f);
                return;
            }

            string route = RouteAt(card, 3);
            profile.BreachReductionRatio = System.Math.Min(
                0.8f,
                profile.BreachReductionRatio
                    + (route == "cinderheartB" ? 0.3f : 0.18f));
            profile.ThornsRatio = Max(
                profile.ThornsRatio,
                route == "cinderheartB" ? 0.15f : 0.25f);
            if (route == "cinderheartC")
            {
                profile.ShieldHits += 1;
                profile.ShieldRegenSeconds = 3f;
            }
            else
            {
                profile.BreachDotDamageRatio =
                    route == "cinderheartB" ? 0.14f : 0.2f;
                profile.BreachDotDuration = 3f;
            }

            if (card.Star >= 4)
            {
                profile.BreachReductionRatio = System.Math.Min(
                    0.8f,
                    profile.BreachReductionRatio * 1.2f);
                profile.ThornsRatio *= 1.2f;
                profile.BreachDotDamageRatio *= 1.2f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "cinderheartA2")
            {
                profile.ShieldBreakDamage = Max(
                    profile.ShieldBreakDamage,
                    40f);
                profile.ShieldBreakKnockback = Max(
                    profile.ShieldBreakKnockback,
                    70f);
            }
            else if (advanced == "cinderheartB2")
            {
                profile.ScorchAuraRadius = Max(
                    profile.ScorchAuraRadius,
                    105f);
                profile.ScorchAuraTickInterval = 0.5f;
                profile.ScorchAuraDamageRatio = Max(
                    profile.ScorchAuraDamageRatio,
                    0.12f);
            }
            else if (advanced == "cinderheartC2")
            {
                profile.BreachDotDamageRatio = Max(
                    profile.BreachDotDamageRatio,
                    0.4f);
                profile.BreachDotDuration = 4f;
                profile.BreachBurstRadius = Max(
                    profile.BreachBurstRadius,
                    120f);
            }
        }

        private static void ApplyAshHarvest(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.WaveStartDamageMultiplier = 1.35f;
                profile.WaveStartDamageDuration = 5f;
                return;
            }

            string route = RouteAt(card, 3);
            if (route == "ashHarvestB")
            {
                profile.DotKillExtraDropChance = 0.12f;
            }
            else if (route == "ashHarvestC")
            {
                profile.DotKillDropLifetimeMultiplier = 1.25f;
                profile.DropLifetimeMultiplier = Max(
                    profile.DropLifetimeMultiplier,
                    1.25f);
            }
            else
            {
                profile.DotKillXpMultiplier = 1.2f;
                profile.DotKillXpDuration = 3f;
            }

            if (card.Star >= 4)
            {
                profile.DotKillXpMultiplier =
                    1f + (profile.DotKillXpMultiplier - 1f) * 1.2f;
                profile.DotKillExtraDropChance *= 1.2f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "ashHarvestA2")
            {
                profile.ExpiryConvertRatio = Max(
                    profile.ExpiryConvertRatio,
                    0.65f);
            }
            else if (advanced == "ashHarvestB2")
            {
                profile.DotKillDamageMultiplier = 1.15f;
                profile.DotKillDamageMaxStacks = 3;
            }
            else if (advanced == "ashHarvestC2")
            {
                profile.DotKillRestore = 2f;
            }
        }

        private static void ApplySentinel(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.DecoyHp = Max(profile.DecoyHp, 140f);
                profile.DecoyTauntRadius = Max(
                    profile.DecoyTauntRadius,
                    130f);
                profile.DecoyDistance = 150f;
                profile.DecoyCount = 1;
                profile.DecoyMirrorTurret = true;
                profile.DecoyDamageRatio = 0.65f;
                profile.DecoyFireInterval = 0.35f;
                profile.DecoyFireRangeRatio = 1f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.DecoyHp = Max(
                profile.DecoyHp,
                route == "sentinelC" ? 100f
                    : route == "sentinelB" ? 60f : 70f);
            profile.DecoyTauntRadius = Max(
                profile.DecoyTauntRadius,
                100f);
            profile.DecoyDistance = 145f;
            profile.DecoyCount = 1;
            profile.DecoyMirrorTurret = true;
            profile.DecoyDamageRatio =
                route == "sentinelA" ? 0.5f : 0.4f;
            profile.DecoyFireInterval =
                route == "sentinelB" ? 0.5f : 0.7f;
            profile.DecoyFireRangeRatio = 1f;
            if (card.Star >= 4)
            {
                profile.DecoyHp *= 1.2f;
                profile.DecoyDamageRatio *= 1.2f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "sentinelA2")
            {
                profile.DecoyCount = 2;
                profile.SecondaryDecoyDistance = 190f;
            }
            else if (advanced == "sentinelB2")
            {
                profile.SlowRatio = Max(profile.SlowRatio, 0.2f);
                profile.SlowDuration = Max(profile.SlowDuration, 1f);
            }
            else if (advanced == "sentinelC2")
            {
                profile.ShieldBreakDamage = Max(
                    profile.ShieldBreakDamage,
                    35f);
                profile.ShieldBreakKnockback = Max(
                    profile.ShieldBreakKnockback,
                    70f);
            }
        }

        private static void ApplyRetribution(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.ImpactBreachRadius = 180f;
                profile.BreachBurstDamageMultiplier = 3.5f;
                profile.BreachBurstRadius = 180f;
                profile.ImpactBreachStunDuration = 0.7f;
                profile.ImpactBreachCooldown = 4f;
                profile.BreachSlowRatio = 0.35f;
                profile.BreachSlowDuration = 2f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.ImpactBreachRadius = 120f;
            profile.BreachBurstRadius = 120f;
            profile.BreachBurstDamageMultiplier =
                route == "retributionB" ? 2.4f : 1.6f;
            profile.ImpactBreachStunDuration =
                route == "retributionA" ? 0.7f : 0.4f;
            profile.ImpactBreachCooldown =
                route == "retributionC" ? 3.5f : 5f;
            if (card.Star >= 4)
            {
                profile.BreachBurstDamageMultiplier *= 1.2f;
                profile.ImpactBreachStunDuration *= 1.2f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "retributionA2")
            {
                profile.BreachVulnerableRadius = 130f;
                profile.BreachVulnerableRatio = 0.2f;
                profile.BreachVulnerableDuration = 2.5f;
            }
            else if (advanced == "retributionB2")
            {
                profile.ShieldHits += 1;
            }
            else if (advanced == "retributionC2")
            {
                profile.BreachKnockback = Max(
                    profile.BreachKnockback,
                    100f);
                profile.BreachBurstRadius = Max(
                    profile.BreachBurstRadius,
                    220f);
            }
        }

        private static void ApplyIronvine(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.DropRateMultiplier = Max(
                    profile.DropRateMultiplier,
                    1.3f);
                profile.WaveStartDefenseMultiplier = 1.3f;
                profile.WaveStartDefenseDuration = 5f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.DropRateMultiplier = Max(
                profile.DropRateMultiplier,
                route == "ironvineA" ? 1.18f : 1.1f);
            if (route == "ironvineB")
            {
                profile.DropLifetimeMultiplier = Max(
                    profile.DropLifetimeMultiplier,
                    1.25f);
            }
            else if (route == "ironvineC")
            {
                profile.ExpiryConvertRatio = Max(
                    profile.ExpiryConvertRatio,
                    0.45f);
            }

            if (card.Star >= 4)
            {
                profile.DropRateMultiplier =
                    1f + (profile.DropRateMultiplier - 1f) * 1.15f;
                profile.DropLifetimeMultiplier =
                    1f + (profile.DropLifetimeMultiplier - 1f) * 1.15f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "ironvineA2")
            {
                profile.XpMultiplier = Max(
                    profile.XpMultiplier,
                    1.18f);
            }
            else if (advanced == "ironvineB2")
            {
                profile.ShieldHits += 1;
                profile.WaveStartRestoreRatio = 0.05f;
            }
            else if (advanced == "ironvineC2")
            {
                profile.ControlledKillExtraDropChance = Max(
                    profile.ControlledKillExtraDropChance,
                    0.2f);
            }
        }

        private static void ApplyFateLoom(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.MergePulseDamagePerStar = Max(
                    profile.MergePulseDamagePerStar,
                    14f);
                profile.MergeDamageMultiplier = 1.35f;
                profile.MergeDamageDuration = 4f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.MergePulseDamagePerStar = Max(
                profile.MergePulseDamagePerStar,
                route == "fateLoomA" ? 9f : 5f);
            if (route == "fateLoomB")
            {
                profile.MergeFireRateMultiplier = 1.2f;
                profile.MergeFireRateDuration = 3f;
            }
            else if (route == "fateLoomC")
            {
                profile.MergeSlowRatio = 0.3f;
                profile.MergeSlowDuration = 1.5f;
            }
            if (card.Star >= 4)
            {
                profile.MergePulseDamagePerStar *= 1.25f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "fateLoomA2")
            {
                profile.MergeVulnerableRatio = 0.15f;
                profile.MergeVulnerableDuration = 2f;
            }
            else if (advanced == "fateLoomB2")
            {
                profile.MergeRestoreRatio = 0.05f;
            }
            else if (advanced == "fateLoomC2")
            {
                profile.MergeDamageMultiplier = 1.2f;
                profile.MergeDamageDuration = 3f;
            }
        }

        private static void ApplyGoldenVolley(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.BeamInterval = 0.9f;
                profile.BeamWidth = 30f;
                profile.BeamDamageRatio = 1f;
                profile.KillExtraDropChance = Max(
                    profile.KillExtraDropChance,
                    0.2f);
                return;
            }

            string route = RouteAt(card, 3);
            profile.SplashRadius = Max(profile.SplashRadius, 35f);
            profile.SplashDamageRatio = Max(
                profile.SplashDamageRatio,
                route == "goldenVolleyB" ? 2f : 1.2f);
            if (route == "goldenVolleyC")
            {
                profile.OnHitFocusPriorityWeight = Max(
                    profile.OnHitFocusPriorityWeight,
                    3f);
                profile.OnHitFocusDuration = Max(
                    profile.OnHitFocusDuration,
                    3f);
            }
            if (card.Star >= 4)
            {
                profile.SplashDamageRatio *= 1.15f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "goldenVolleyA2")
            {
                profile.BrandedHitBurstDamageMultiplier = Max(
                    profile.BrandedHitBurstDamageMultiplier,
                    0.8f);
                profile.BrandedHitBurstRadius = Max(
                    profile.BrandedHitBurstRadius,
                    35f);
            }
            else if (advanced == "goldenVolleyB2")
            {
                profile.BrandedKillExtraDropChance = Max(
                    profile.BrandedKillExtraDropChance,
                    0.25f);
            }
            else if (advanced == "goldenVolleyC2")
            {
                profile.SplitCount += 2;
                profile.SplitDamageRatio = Max(
                    profile.SplitDamageRatio,
                    0.55f);
            }
        }

        private static void ApplyBountyCall(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.BountyInterval = 1f;
                profile.BountyFocusWeight = 5f;
                profile.BountyVulnerableRatio = 0.18f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.BountyInterval = 4f;
            profile.BountyFocusWeight =
                route == "bountyCallA" ? 6f : 4f;
            if (route == "bountyCallB")
            {
                profile.BountyVulnerableRatio = 0.16f;
            }
            else if (route == "bountyCallC")
            {
                profile.BountySlowRatio = 0.3f;
            }
            if (card.Star >= 4)
            {
                profile.BountyFocusWeight += 1f;
                profile.BountyVulnerableRatio *= 1.2f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "bountyCallA2")
            {
                profile.BrandedKillFocusRadius = Max(
                    profile.BrandedKillFocusRadius,
                    100f);
                profile.BrandedKillFocusWeight = Max(
                    profile.BrandedKillFocusWeight,
                    4f);
                profile.BrandedKillFocusDuration = Max(
                    profile.BrandedKillFocusDuration,
                    3f);
            }
            else if (advanced == "bountyCallB2")
            {
                profile.BrandedKillXpMultiplier = Max(
                    profile.BrandedKillXpMultiplier,
                    1.35f);
                profile.BrandedKillXpDuration = 3f;
                profile.BrandedKillXpMaxStacks = 1;
            }
            else if (advanced == "bountyCallC2")
            {
                profile.BountyFocusWeight = Max(
                    profile.BountyFocusWeight,
                    5f);
            }
        }

        private static void ApplyOvergrowth(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.OvergrowthInterval = 5f;
                profile.OvergrowthZoneCount = 1;
                profile.OvergrowthRadius = 190f;
                profile.OvergrowthDuration = 5f;
                profile.OvergrowthSlowRatio = 0.4f;
                profile.OvergrowthVulnerableRatio = 0.18f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.OvergrowthInterval = 4f;
            profile.OvergrowthZoneCount = 1;
            profile.OvergrowthRadius =
                route == "overgrowthA" ? 120f : 90f;
            profile.OvergrowthDuration = 3f;
            profile.OvergrowthSlowRatio =
                route == "overgrowthB" ? 0.45f : 0.25f;
            profile.OvergrowthVulnerableRatio =
                route == "overgrowthC" ? 0.16f : 0.08f;
            if (card.Star >= 4)
            {
                profile.OvergrowthDuration *= 1.3f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "overgrowthA2")
            {
                profile.OvergrowthRadius = 95f;
                profile.OvergrowthStunDuration = 0.3f;
            }
            else if (advanced == "overgrowthB2")
            {
                profile.XpMultiplier = Max(
                    profile.XpMultiplier,
                    1.15f);
            }
            else if (advanced == "overgrowthC2")
            {
                profile.OvergrowthZoneCount = 2;
                profile.OvergrowthRadius = 85f;
                profile.OvergrowthVulnerableRatio = 0.1f;
            }
        }

        private static void ApplySpringOfLife(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.SpringRestoreInterval = 2f;
                profile.SpringRestoreRatio = 0.035f;
                profile.BreachReductionRatio = System.Math.Min(
                    0.8f,
                    profile.BreachReductionRatio + 0.2f);
                return;
            }

            string route = RouteAt(card, 3);
            profile.WaveStartRestoreRatio =
                route == "springOfLifeA" ? 0.12f : 0.08f;
            profile.SpringRestoreInterval =
                route == "springOfLifeB" ? 2.5f : 4f;
            profile.SpringRestoreRatio =
                route == "springOfLifeA" ? 0.025f : 0.02f;
            if (route == "springOfLifeC")
            {
                profile.ShieldHits += 1;
            }
            if (card.Star >= 4)
            {
                profile.WaveStartRestoreRatio *= 1.25f;
                profile.SpringRestoreRatio *= 1.25f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "springOfLifeA2")
            {
                profile.BreachRestoreRatio = 0.1f;
            }
            else if (advanced == "springOfLifeB2")
            {
                profile.ScorchAuraRadius = Max(
                    profile.ScorchAuraRadius,
                    100f);
                profile.ScorchAuraTickInterval = 4f;
                profile.ScorchAuraDamageRatio = Max(
                    profile.ScorchAuraDamageRatio,
                    0.8f);
            }
            else if (advanced == "springOfLifeC2")
            {
                profile.WaveStartDefenseMultiplier = Max(
                    profile.WaveStartDefenseMultiplier,
                    1.1f);
                profile.WaveStartDefenseDuration = 5f;
            }
        }

        private static void ApplyLuckyStar(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.DropRateMultiplier = Max(
                    profile.DropRateMultiplier,
                    1.45f);
                profile.XpMultiplier = Max(
                    profile.XpMultiplier,
                    1.4f);
                profile.DropLifetimeMultiplier = Max(
                    profile.DropLifetimeMultiplier,
                    1.25f);
                return;
            }

            string route = RouteAt(card, 3);
            profile.DropRateMultiplier = Max(
                profile.DropRateMultiplier,
                route == "luckyStarA" ? 1.25f : 1.12f);
            profile.XpMultiplier = Max(
                profile.XpMultiplier,
                route == "luckyStarC" ? 1.2f : 1.08f);
            if (route == "luckyStarB")
            {
                profile.DropLifetimeMultiplier = Max(
                    profile.DropLifetimeMultiplier,
                    1.3f);
            }
            if (card.Star >= 4)
            {
                profile.DropRateMultiplier =
                    1f + (profile.DropRateMultiplier - 1f) * 1.15f;
                profile.XpMultiplier =
                    1f + (profile.XpMultiplier - 1f) * 1.15f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "luckyStarA2")
            {
                profile.KillExtraDropChance = Max(
                    profile.KillExtraDropChance,
                    0.1f);
            }
            else if (advanced == "luckyStarB2")
            {
                profile.ExpiryConvertRatio = Max(
                    profile.ExpiryConvertRatio,
                    0.7f);
            }
            else if (advanced == "luckyStarC2")
            {
                profile.MergePulseDamagePerStar = Max(
                    profile.MergePulseDamagePerStar,
                    8f);
            }
        }

        private static void ApplyStaticSurge(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.AuraRadiusRatio = Max(
                    profile.AuraRadiusRatio,
                    170f / 150f);
                profile.AuraVulnerableRatio = Max(
                    profile.AuraVulnerableRatio,
                    0.12f);
                return;
            }

            string route = RouteAt(card, 3);
            float ratio = route == "staticSurgeB" ? 0.08f : 0.05f;
            if (card.Star >= 4)
            {
                ratio *= 1.25f;
            }

            profile.VulnerableRatio = Max(
                profile.VulnerableRatio,
                ratio);
            profile.VulnerableDuration = Max(
                profile.VulnerableDuration,
                route == "staticSurgeC2" ? 5f : 3f);
            if (route == "staticSurgeC")
            {
                profile.OnHitStunDuration = Max(
                    profile.OnHitStunDuration,
                    0.35f);
                profile.OnHitStunCooldown = 2f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "staticSurgeA2")
            {
                profile.VulnerableKillZoneRadius = 90f;
                profile.VulnerableKillZoneRatio = 0.1f;
                profile.VulnerableKillZoneDuration = 3f;
            }
            else if (advanced == "staticSurgeB2")
            {
                profile.SplashRadius = Max(profile.SplashRadius, 55f);
                profile.SplashDamageRatio = Max(
                    profile.SplashDamageRatio,
                    0.32f);
            }
            else if (advanced == "staticSurgeC2")
            {
                profile.VulnerableDuration = Max(
                    profile.VulnerableDuration,
                    5f);
            }
        }

        private static void ApplyStormcall(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.StormcallInterval = 4f;
                profile.StormcallStrikeCount = 1;
                profile.StormcallRadius = 150f;
                profile.StormcallZoneDuration = 4f;
                profile.StormcallZoneTickInterval = 0.6f;
                profile.StormcallZoneDamageRatio = 0.45f;
                profile.StormcallZoneVulnerableRatio = 0.08f;
                return;
            }

            string route = RouteAt(card, 3);
            profile.StormcallInterval =
                route == "stormcallA" ? 2.2f : 3f;
            profile.StormcallStrikeCount = 1;
            profile.StormcallRadius =
                route == "stormcallC" ? 70f : 75f;
            profile.StormcallDamageRatio =
                route == "stormcallB" ? 1.8f : 1.3f;
            profile.StormcallFalloff = 0.4f;
            if (card.Star >= 4)
            {
                profile.StormcallDamageRatio *= 1.25f;
                profile.StormcallRadius *= 1.25f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "stormcallA2")
            {
                profile.StormcallStrikeCount = 2;
                profile.StormcallRadius = 70f;
                profile.StormcallDamageRatio = 1.1f;
            }
            else if (advanced == "stormcallB2")
            {
                profile.StormcallRadius = 90f;
                profile.StormcallDamageRatio = 1.5f;
            }
            else if (advanced == "stormcallC2")
            {
                profile.StormcallZoneDuration = 2f;
                profile.StormcallZoneTickInterval = 0.5f;
                profile.StormcallZoneDamageRatio = 0f;
                profile.StormcallZoneVulnerableRatio = 0.12f;
            }
        }

        private static void ApplyArcSplitter(
            CardState card,
            CardCombatProfile profile)
        {
            string route = RouteAt(card, 3);
            if (card.Star >= 6)
            {
                profile.SplitCount += 12;
                profile.SplitDamageRatio = Max(
                    profile.SplitDamageRatio,
                    0.6f);
                profile.RecursiveSplitCount = 1;
                return;
            }

            profile.SplitCount += route == "arcSplitterB" ? 3 : 4;
            profile.SplitDamageRatio = Max(
                profile.SplitDamageRatio,
                route == "arcSplitterB" ? 0.7f : 0.45f);
            if (route == "arcSplitterC")
            {
                profile.VulnerableRatio = Max(
                    profile.VulnerableRatio,
                    0.06f);
                profile.VulnerableDuration = Max(
                    profile.VulnerableDuration,
                    1.5f);
            }

            if (card.Star >= 4)
            {
                profile.SplitCount += 1;
                profile.SplitDamageRatio *= 1.25f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "arcSplitterA2")
            {
                profile.RecursiveSplitCount = 2;
                profile.RecursiveSplitDamageRatio = 0.4f;
            }
            else if (advanced == "arcSplitterB2")
            {
                profile.RicochetBounces += 1;
            }
            else if (advanced == "arcSplitterC2")
            {
                profile.OnHitFireRateMultiplier = 1.08f;
                profile.OnHitFireRateDuration = 2f;
                profile.OnHitFireRateMaxStacks = 3;
            }
        }

        private static void ApplyGalvanicWard(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.ShieldHits += 4;
                profile.ShieldRegenSeconds = 6f;
                profile.ShieldBreakDamage = Max(
                    profile.ShieldBreakDamage,
                    55f);
                profile.ShieldBreakKnockback = Max(
                    profile.ShieldBreakKnockback,
                    90f);
                profile.WaveStartFireRateMultiplier = Max(
                    profile.WaveStartFireRateMultiplier,
                    1.25f);
                profile.WaveStartFireRateDuration = Max(
                    profile.WaveStartFireRateDuration,
                    5f);
                return;
            }

            string route = RouteAt(card, 3);
            profile.ShieldHits += route == "galvanicWardA" ? 3 : 2;
            profile.ShieldRegenSeconds = 10f;
            profile.ShieldBreakDamage = Max(
                profile.ShieldBreakDamage,
                route == "galvanicWardB" ? 40f : 24f);
            profile.ShieldBreakKnockback = Max(
                profile.ShieldBreakKnockback,
                60f);
            if (route == "galvanicWardC")
            {
                profile.BreachVulnerableRadius = 120f;
                profile.BreachVulnerableRatio = 0.12f;
                profile.BreachVulnerableDuration = 2f;
            }

            if (card.Star >= 4)
            {
                profile.ShieldHits += 1;
                profile.ShieldBreakDamage *= 1.25f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "galvanicWardA2")
            {
                profile.ShieldHits += 1;
                profile.ShieldRegenSeconds = 6f;
            }
            else if (advanced == "galvanicWardB2")
            {
                profile.WaveStartFireRateMultiplier = Max(
                    profile.WaveStartFireRateMultiplier,
                    1.18f);
                profile.WaveStartFireRateDuration = 5f;
            }
            else if (advanced == "galvanicWardC2")
            {
                profile.BreachVulnerableRadius = 140f;
                profile.BreachVulnerableRatio = 0.2f;
                profile.BreachVulnerableDuration = 3f;
            }
        }

        private static void ApplyOvercharge(
            CardState card,
            CardCombatProfile profile)
        {
            if (card.Star >= 6)
            {
                profile.WaveStartFireRateMultiplier = Max(
                    profile.WaveStartFireRateMultiplier,
                    1.25f);
                profile.WaveStartFireRateDuration = Max(
                    profile.WaveStartFireRateDuration,
                    5f);
                profile.DropRateMultiplier = Max(
                    profile.DropRateMultiplier,
                    1.1f);
                return;
            }

            string route = RouteAt(card, 3);
            profile.KillFireRateMultiplier =
                route == "overchargeB"
                    ? 1.16f
                    : route == "overchargeC"
                        ? 1.08f
                        : 1.1f;
            profile.KillFireRateDuration =
                route == "overchargeB"
                    ? 2.5f
                    : route == "overchargeC"
                        ? 3f
                        : 4f;
            profile.KillFireRateMaxStacks =
                route == "overchargeC" ? 5 : 3;
            if (card.Star >= 4)
            {
                profile.KillFireRateMultiplier =
                    1f + (profile.KillFireRateMultiplier - 1f) * 1.25f;
            }

            string advanced = RouteAt(card, 5);
            if (advanced == "overchargeA2")
            {
                profile.KillBurstDamageMultiplier = 1.2f;
                profile.KillBurstRadius = 100f;
            }
            else if (advanced == "overchargeB2")
            {
                profile.KillRestore = 1.5f;
            }
            else if (advanced == "overchargeC2")
            {
                profile.DropRateMultiplier = Max(
                    profile.DropRateMultiplier,
                    1.12f);
            }
        }

        private static void ApplyFrozenThunder(
            CardCombatProfile profile)
        {
            profile.ChainBounces += 7;
            profile.ChainDamageRetention = 0.85f;
            profile.ChainSearchRange =
                Max(profile.ChainSearchRange, 190f);
            profile.FreezeStacksToTrigger = 2;
            profile.FreezeDuration =
                Max(profile.FreezeDuration, 1.2f);
            profile.FrozenKillSplashRadius = 120f;
            profile.FrozenKillSplashDamageRatio = 1.2f;
            profile.FrozenKillFreezeDuration = 0.7f;
        }

        private static void ApplySolarLance(
            CardCombatProfile profile)
        {
            profile.BeamInterval = 0.85f;
            profile.BeamWidth = 34f;
            profile.BeamDamageRatio = 1.15f;
            profile.DotDamageRatio =
                Max(profile.DotDamageRatio, 0.2f);
            profile.DotTickInterval = 0.5f;
            profile.DotDuration =
                Max(profile.DotDuration, 3f);
            profile.DotHitBurstDamageMultiplier = 0.8f;
            profile.DotHitBurstRadius = 30f;
        }

        private static void ApplyAvalanche(
            CardCombatProfile profile)
        {
            profile.AvalancheInterval = 5f;
            profile.AvalancheRadius = 220f;
            profile.AvalancheKnockback = 150f;
            profile.AvalancheFreezeDuration = 1.2f;
            profile.AvalancheDamageMultiplier = 2.5f;
        }

        private static void ApplyPyrestorm(
            CardCombatProfile profile)
        {
            profile.PyrestormInterval = 2.8f;
            profile.PyrestormRadius = 110f;
            profile.PyrestormDamageRatio = 2.4f;
            profile.PyrestormFalloff = 0.35f;
            profile.PyrestormZoneDuration = 4f;
            profile.PyrestormZoneTickInterval = 0.5f;
            profile.PyrestormZoneDamageRatio = 0.24f;
            profile.PyrestormZoneVulnerableRatio = 0.12f;
            profile.PyrestormZoneVulnerableDuration = 0.6f;
        }

        private static void ApplyCrownOfThorns(
            CardCombatProfile profile)
        {
            profile.ShieldHits = 6;
            profile.ShieldRegenSeconds = 6f;
            profile.ThornsAuraRadius = 150f;
            profile.ThornsAuraTickInterval = 0.5f;
            profile.ThornsAuraDamageRatio = 0.2f;
            profile.ThornsAuraSlowRatio = 0.2f;
            profile.ThornsAuraSlowDuration = 0.6f;
            profile.ThornsRatio = 0.5f;
            profile.ShieldBreakDamage = 75f;
            profile.ShieldBreakKnockback = 150f;
        }

        private static void ApplyGoldenIdol(
            CardCombatProfile profile)
        {
            profile.DecoyHp = 130f;
            profile.DecoyTauntRadius = 210f;
            profile.DecoyDistance = 160f;
            profile.DecoyCount = 1;
            profile.ControlledKillExtraDropChance = 0.3f;
            profile.ControlledKillXpMultiplier = 1.25f;
            profile.ControlledKillXpDuration = 3f;
            profile.ControlledKillXpMaxStacks = 2;
        }

        private static string RouteAt(CardState card, int checkpoint)
        {
            string prefix = checkpoint + ":";
            foreach (string entry in card.EvolutionPath)
            {
                if (entry.StartsWith(prefix))
                {
                    return entry.Substring(prefix.Length);
                }
            }

            return "";
        }

        private static float Max(float left, float right)
        {
            return left > right ? left : right;
        }
    }
}
