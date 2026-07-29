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
                }
            }

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
