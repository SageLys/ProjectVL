using System;
using System.Collections.Generic;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public static class RelicScalingSystem
    {
        private static readonly string[] NoTags = Array.Empty<string>();
        private static readonly Dictionary<string, string[]> CardTags =
            new Dictionary<string, string[]>
            {
                { "pierce", new[] { "projectile" } },
                { "chainLightning", new[] { "projectile", "control" } },
                { "frost", new[] { "control", "domain" } },
                { "impact", new[] { "control", "defense" } },
                { "scorch", new[] { "domain" } },
                { "splitBlast", new[] { "projectile", "domain" } },
                { "aegis", new[] { "defense" } },
                { "thorns", new[] { "defense", "domain" } },
                { "decoy", new[] { "control", "defense" } },
                { "sanctum", new[] { "domain", "control" } },
                { "harvest", new[] { "utility" } },
                { "frozenThunder", new[] { "projectile", "control" } },
                { "solarLance", new[] { "projectile" } },
                { "avalanche", new[] { "control", "domain" } },
                { "pyrestorm", new[] { "projectile", "domain" } },
                { "crownOfThorns", new[] { "defense", "domain" } },
                { "goldenIdol", new[] { "utility", "defense" } }
            };

        public static float ForCard(
            GameState state,
            string cardType,
            string axis)
        {
            if (state == null || string.IsNullOrEmpty(axis))
            {
                return 0f;
            }

            string[] tags = CardTags.TryGetValue(cardType, out string[] found)
                ? found
                : NoTags;
            float best = 0f;
            foreach (string tag in tags)
            {
                string key = tag + ":" + axis;
                if (state.RelicScaling.TryGetValue(key, out float value))
                {
                    best = Math.Max(best, value);
                }
            }

            return best;
        }

        public static float ForEquipped(GameState state, string axis)
        {
            if (state == null)
            {
                return 0f;
            }

            float best = 0f;
            foreach (CardState card in state.Equipment)
            {
                if (card == null || card.Provisional || card.Star < 3)
                {
                    continue;
                }

                best = Math.Max(best, ForCard(state, card.Type, axis));
            }

            return best;
        }

        public static float GlobalMax(GameState state, string axis)
        {
            if (state == null)
            {
                return 0f;
            }

            string suffix = ":" + axis;
            float best = 0f;
            foreach (KeyValuePair<string, float> pair in state.RelicScaling)
            {
                if (pair.Key.EndsWith(suffix, StringComparison.Ordinal))
                {
                    best = Math.Max(best, pair.Value);
                }
            }

            return best;
        }

        public static void Apply(
            GameState state,
            CardCombatProfile profile)
        {
            if (state == null || profile == null)
            {
                return;
            }

            ApplyEffectDamage(
                profile,
                ForEquipped(state, "effectDamageMul"));
            ApplyQuantity(
                profile,
                ForEquipped(state, "quantityAdd"));
            ApplyControl(
                profile,
                ForEquipped(state, "controlPotencyMul"));
            ApplyArea(
                profile,
                ForEquipped(state, "areaScaleMul"));
            ApplyDot(
                profile,
                ForEquipped(state, "dotDamageMul"));
            ApplyDefenseDurability(
                profile,
                ForEquipped(state, "defenseDurabilityMul"));
            ApplyRetaliation(
                profile,
                ForEquipped(state, "retaliationMul"));

            if (profile.DropRateMultiplier != 1f)
            {
                profile.DropRateMultiplier *= 1f
                    + ForEquipped(state, "dropRateMul");
            }

            if (profile.DropLifetimeMultiplier != 1f)
            {
                profile.DropLifetimeMultiplier *= 1f
                    + ForEquipped(state, "dropLifetimeMul");
            }

            if (profile.XpMultiplier != 1f)
            {
                profile.XpMultiplier *= 1f
                    + ForEquipped(state, "xpMul");
            }
            profile.ControlledDamageTakenBonus =
                GlobalMax(state, "controlledDamageTakenMul");
        }

        private static void ApplyEffectDamage(
            CardCombatProfile profile,
            float value)
        {
            if (value == 0f)
            {
                return;
            }

            float multiplier = 1f + value;
            profile.PierceDamageRetention = Math.Min(
                1f,
                profile.PierceDamageRetention * multiplier);
            profile.ChainDamageRetention = Math.Min(
                1f,
                profile.ChainDamageRetention * multiplier);
            profile.ChainKillDamageRetention = Math.Min(
                1f,
                profile.ChainKillDamageRetention * multiplier);
            profile.ChainPulseDamageRetention = Math.Min(
                1f,
                profile.ChainPulseDamageRetention * multiplier);
            profile.BeamDamageRatio *= multiplier;
            profile.SplitDamageRatio *= multiplier;
            profile.RecursiveSplitDamageRatio *= multiplier;
            profile.SplashDamageRatio *= multiplier;
            profile.SecondarySplashDamageRatio *= multiplier;
            profile.DotHitBurstDamageMultiplier *= multiplier;
            profile.AvalancheDamageMultiplier *= multiplier;
            profile.DecoyExplodeDamageMultiplier *= multiplier;
            profile.DecoyDamageRatio *= multiplier;
            profile.PyrestormDamageRatio *= multiplier;
        }

        private static void ApplyQuantity(
            CardCombatProfile profile,
            float value)
        {
            int add = value > 0f ? (int)Math.Ceiling(value) : 0;
            if (add == 0)
            {
                return;
            }

            if (profile.PierceCount > 0) profile.PierceCount += add;
            if (profile.RicochetBounces > 0) profile.RicochetBounces += add;
            if (profile.ChainBounces > 0) profile.ChainBounces += add;
            if (profile.ChainKillBounces > 0) profile.ChainKillBounces += add;
            if (profile.ChainPulseBounces > 0) profile.ChainPulseBounces += add;
            if (profile.SplitCount > 0) profile.SplitCount += add;
            if (profile.RecursiveSplitCount > 0)
            {
                profile.RecursiveSplitCount += add;
            }
        }

        private static void ApplyControl(
            CardCombatProfile profile,
            float value)
        {
            if (value == 0f)
            {
                return;
            }

            float multiplier = 1f + value;
            profile.SlowRatio = CapSlow(profile.SlowRatio * multiplier);
            profile.FrostAuraSlowRatio =
                CapSlow(profile.FrostAuraSlowRatio * multiplier);
            profile.AuraSlowRatio =
                CapSlow(profile.AuraSlowRatio * multiplier);
            profile.ScorchAuraSlowRatio =
                CapSlow(profile.ScorchAuraSlowRatio * multiplier);
            profile.ThornsAuraSlowRatio =
                CapSlow(profile.ThornsAuraSlowRatio * multiplier);
            profile.DecoyAuraSlowRatio =
                CapSlow(profile.DecoyAuraSlowRatio * multiplier);
            profile.BreachSlowRatio =
                CapSlow(profile.BreachSlowRatio * multiplier);

            profile.FreezeDuration *= multiplier;
            profile.FrozenKillFreezeDuration *= multiplier;
            profile.FrostNovaDuration *= multiplier;
            profile.ImpactBreachStunDuration *= multiplier;
            profile.ImpactPulseStunDuration *= multiplier;
            profile.AvalancheFreezeDuration *= multiplier;
            profile.OnHitStunDuration *= multiplier;

            profile.KnockbackDistance *= multiplier;
            profile.HitAreaKnockbackDistance *= multiplier;
            profile.ImpactBreachKnockback *= multiplier;
            profile.ImpactPulseKnockback *= multiplier;
            profile.AvalancheKnockback *= multiplier;
            profile.ShieldBreakKnockback *= multiplier;
            profile.BreachKnockback *= multiplier;
            profile.DecoyExplodeKnockback *= multiplier;

            profile.VulnerableRatio *= multiplier;
            profile.FrozenHitVulnerableRatio *= multiplier;
            profile.DotAreaVulnerableRatio *= multiplier;
            profile.DotHitVulnerableRatio *= multiplier;
            profile.AuraVulnerableRatio *= multiplier;
            profile.SanctumPulseVulnerableRatio *= multiplier;
            profile.BreachVulnerableRatio *= multiplier;
        }

        private static void ApplyArea(
            CardCombatProfile profile,
            float value)
        {
            if (value == 0f)
            {
                return;
            }

            float multiplier = 1f + value;
            profile.FrostAuraRadiusRatio *= multiplier;
            profile.FrostNovaRadius *= multiplier;
            profile.DotAreaRadius *= multiplier;
            profile.SplashRadius *= multiplier;
            profile.SecondarySplashRadius *= multiplier;
            profile.ScorchAuraRadius *= multiplier;
            profile.ImpactBreachRadius *= multiplier;
            profile.ImpactPulseRadius *= multiplier;
            profile.AvalancheRadius *= multiplier;
            profile.AuraRadiusRatio *= multiplier;
            profile.SanctumPulseRadius *= multiplier;
            profile.ThornsAuraRadius *= multiplier;
            profile.BreachBurstRadius *= multiplier;
            profile.BreachVulnerableRadius *= multiplier;
            profile.BreachExecuteRadius *= multiplier;
            profile.DecoyAuraRadius *= multiplier;
            profile.PyrestormRadius *= multiplier;
            profile.PyrestormZoneDuration *= multiplier;
        }

        private static void ApplyDot(
            CardCombatProfile profile,
            float value)
        {
            if (value == 0f)
            {
                return;
            }

            float multiplier = 1f + value;
            profile.DotDamageRatio *= multiplier;
            profile.SecondaryDotDamageRatio *= multiplier;
            profile.ScorchAuraDamageRatio *= multiplier;
            profile.PyrestormZoneDamageRatio *= multiplier;
        }

        private static void ApplyDefenseDurability(
            CardCombatProfile profile,
            float value)
        {
            if (value == 0f)
            {
                return;
            }

            profile.ShieldHits = (int)Math.Ceiling(
                profile.ShieldHits * (1f + value));
            profile.DecoyHp *= 1f + value;
        }

        private static void ApplyRetaliation(
            CardCombatProfile profile,
            float value)
        {
            if (value == 0f)
            {
                return;
            }

            float multiplier = 1f + value;
            profile.ShieldBreakDamage *= multiplier;
            profile.ThornsRatio *= multiplier;
            profile.BreachBurstDamageMultiplier *= multiplier;
            profile.ThornsAuraDamageRatio *= multiplier;
        }

        private static float CapSlow(float value)
        {
            return Math.Min(0.8f, value);
        }
    }
}
