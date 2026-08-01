using System;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public static class RecipeProductProfileCompiler
    {
        public static bool Apply(string cardId, CardCombatProfile profile)
        {
            RecipeProductCardEffectsConfig card =
                RecipeProductEffectCatalog.Default.Find(cardId);
            if (card == null || profile == null)
                return false;

            return Apply(card.bindings, profile);
        }

        public static bool Apply(
            CompiledEffectBindingConfig[] bindings,
            CardCombatProfile profile)
        {
            if (bindings == null || profile == null)
                return false;

            foreach (CompiledEffectBindingConfig binding in bindings)
            {
                foreach (CompiledEffectAtomConfig atom in binding.effects)
                    ApplyAtom(binding, atom, null, profile);
            }

            return true;
        }

        private static void ApplyAtom(
            CompiledEffectBindingConfig binding,
            CompiledEffectAtomConfig atom,
            string parentAtom,
            CardCombatProfile profile)
        {
            float radius = Number(atom, "radius");
            float duration = Number(atom, "duration");
            float ratio = Number(atom, "ratio");
            switch (atom.atom)
            {
                case "pierce":
                    profile.PierceCount = Math.Max(
                        profile.PierceCount,
                        Integer(atom, "count"));
                    profile.PierceDamageRetention = Math.Min(
                        profile.PierceDamageRetention,
                        Positive(atom, "damageRetention", 1f));
                    break;
                case "chain":
                    ApplyChain(binding, atom, profile);
                    break;
                case "split":
                    profile.SplitCount = Math.Max(
                        profile.SplitCount,
                        Integer(atom, "count"));
                    profile.SplitDamageRatio = Math.Max(
                        profile.SplitDamageRatio,
                        Number(atom, "damageRatio"));
                    break;
                case "dot":
                    ApplyDot(binding, atom, parentAtom, profile);
                    break;
                case "slow":
                    ApplySlow(binding, atom, parentAtom, profile);
                    break;
                case "freeze":
                    profile.FreezeStacksToTrigger = Math.Max(
                        profile.FreezeStacksToTrigger,
                        Math.Max(1, Integer(atom, "stacksToTrigger")));
                    profile.FreezeDuration = Math.Max(
                        profile.FreezeDuration,
                        Positive(atom, "duration", 1f));
                    if (binding.trigger == "interval")
                    {
                        profile.FrostNovaInterval = Positive(
                            binding.triggerParams,
                            "seconds",
                            profile.FrostNovaInterval);
                        profile.FrostNovaRadius = Math.Max(
                            profile.FrostNovaRadius,
                            radius);
                        profile.FrostNovaDuration = Math.Max(
                            profile.FrostNovaDuration,
                            Positive(atom, "duration", 1f));
                    }
                    break;
                case "vulnerable":
                    ApplyVulnerable(
                        atom,
                        parentAtom,
                        profile,
                        ratio,
                        duration);
                    break;
                case "burstDamage":
                    ApplyBurst(binding, atom, profile, radius);
                    break;
                case "aoeOnHit":
                    profile.SplashRadius = Math.Max(
                        profile.SplashRadius,
                        radius);
                    profile.SplashDamageRatio = Math.Max(
                        profile.SplashDamageRatio,
                        Number(atom, "damageRatio"));
                    profile.SplashFalloff = Math.Max(
                        profile.SplashFalloff,
                        Number(atom, "falloff"));
                    break;
                case "groundZone":
                    ApplyGroundZone(binding, atom, profile, radius, duration);
                    break;
                case "aura":
                    profile.AuraRadiusRatio = Math.Max(
                        profile.AuraRadiusRatio,
                        radius / 180f);
                    break;
                case "shield":
                    profile.ShieldHits = Math.Max(
                        profile.ShieldHits,
                        Integer(atom, "absorbHits"));
                    profile.ShieldRegenSeconds = MaxPositive(
                        profile.ShieldRegenSeconds,
                        Number(atom, "regenSeconds"));
                    break;
                case "thorns":
                    profile.ThornsRatio = Math.Max(profile.ThornsRatio, ratio);
                    break;
                case "breachReduction":
                    profile.BreachReductionRatio = Math.Max(
                        profile.BreachReductionRatio,
                        ratio);
                    break;
                case "knockback":
                    ApplyKnockback(binding, atom, profile);
                    break;
                case "stun":
                    if (binding.trigger == "onBreach")
                        profile.ImpactBreachStunDuration = Math.Max(
                            profile.ImpactBreachStunDuration,
                            duration);
                    else
                        profile.OnHitStunDuration = Math.Max(
                            profile.OnHitStunDuration,
                            duration);
                    break;
                case "summon":
                    profile.DecoyCount = Math.Max(
                        profile.DecoyCount,
                        Math.Max(1, Integer(atom, "count")));
                    profile.DecoyHp = Math.Max(
                        profile.DecoyHp,
                        Number(atom, "hp"));
                    profile.DecoyTauntRadius = Math.Max(
                        profile.DecoyTauntRadius,
                        Number(atom, "tauntRadius"));
                    profile.DecoyAuraRadius = Math.Max(
                        profile.DecoyAuraRadius,
                        Number(atom, "auraRadius"));
                    profile.DecoyDamageRatio = Math.Max(
                        profile.DecoyDamageRatio,
                        Number(atom, "damageRatio"));
                    profile.DecoyFireInterval = MaxPositive(
                        profile.DecoyFireInterval,
                        Number(atom, "fireInterval"));
                    break;
                case "focusPriority":
                    if (binding.trigger == "onHit")
                    {
                        profile.OnHitFocusPriorityWeight = Math.Max(
                            profile.OnHitFocusPriorityWeight,
                            Positive(atom, "priorityWeight", 1f));
                        profile.OnHitFocusDuration = Math.Max(
                            profile.OnHitFocusDuration,
                            duration);
                    }
                    else
                    {
                        profile.AuraFocusPriorityWeight = Math.Max(
                            profile.AuraFocusPriorityWeight,
                            Positive(atom, "priorityWeight", 1f));
                    }
                    break;
                case "extraDrop":
                    ApplyExtraDrop(binding, atom, profile);
                    break;
                case "dropRateMul":
                    profile.DropRateMultiplier = Math.Max(
                        profile.DropRateMultiplier,
                        1f + Number(atom, "mul"));
                    break;
                case "dropLifetimeMul":
                    profile.DropLifetimeMultiplier = Math.Max(
                        profile.DropLifetimeMultiplier,
                        Positive(atom, "mul", 1f));
                    break;
                case "xpMul":
                    profile.XpMultiplier = Math.Max(
                        profile.XpMultiplier,
                        Positive(atom, "mul", 1f));
                    break;
                case "expiryConvert":
                    profile.ExpiryConvertRatio = Math.Max(
                        profile.ExpiryConvertRatio,
                        ratio);
                    break;
                case "execute":
                    if (binding.trigger == "onBreach")
                    {
                        profile.BreachExecuteRadius = Math.Max(
                            profile.BreachExecuteRadius,
                            radius);
                        profile.BreachExecuteThresholdRatio = Math.Max(
                            profile.BreachExecuteThresholdRatio,
                            Number(atom, "hpThresholdRatio"));
                    }
                    else
                    {
                        profile.FrozenHitExecuteThresholdRatio = Math.Max(
                            profile.FrozenHitExecuteThresholdRatio,
                            Number(atom, "hpThresholdRatio"));
                    }
                    break;
                case "mergeMaterialRefund":
                    profile.MergeMaterialRefundChance = Math.Max(
                        profile.MergeMaterialRefundChance,
                        Number(atom, "refundChance"));
                    profile.MergeMaterialRefundCount = Math.Max(
                        profile.MergeMaterialRefundCount,
                        Integer(atom, "count"));
                    profile.MergeMaterialRefundStar = Math.Max(
                        profile.MergeMaterialRefundStar,
                        Integer(atom, "star"));
                    break;
                case "wildcardRewardBonus":
                    profile.WildcardRewardBonusChance = Math.Max(
                        profile.WildcardRewardBonusChance,
                        Number(atom, "bonusChance"));
                    profile.WildcardRewardBonusCount = Math.Max(
                        profile.WildcardRewardBonusCount,
                        Integer(atom, "count"));
                    break;
                case "restore":
                    profile.PickupRestore = Math.Max(
                        profile.PickupRestore,
                        Number(atom, "amount"));
                    profile.SpringRestoreRatio = Math.Max(
                        profile.SpringRestoreRatio,
                        Number(atom, "amountRatio"));
                    break;
                case "mergePulse":
                    profile.MergePulseDamagePerStar = Math.Max(
                        profile.MergePulseDamagePerStar,
                        Number(atom, "damagePerMergeCount"));
                    break;
                case "mortarMorph":
                    profile.MeteorInterval = MaxPositive(
                        profile.MeteorInterval,
                        Number(binding.triggerParams, "seconds"));
                    profile.MeteorRadius = Math.Max(
                        profile.MeteorRadius,
                        radius);
                    profile.MeteorDamageRatio = Math.Max(
                        profile.MeteorDamageRatio,
                        Number(atom, "damageRatio"));
                    profile.MeteorCount = Math.Max(profile.MeteorCount, 1);
                    break;
                case "novaOnBreak":
                    profile.ShieldBreakDamage = Number(atom, "damage");
                    profile.ShieldBreakKnockback =
                        Number(atom, "knockbackDistance");
                    break;
                case "statBuff":
                    ApplyStatBuff(binding, atom, profile);
                    break;
            }

            foreach (CompiledEffectAtomConfig child
                in atom.children ?? Array.Empty<CompiledEffectAtomConfig>())
            {
                ApplyAtom(binding, child, atom.atom, profile);
            }
        }

        private static void ApplyChain(
            CompiledEffectBindingConfig binding,
            CompiledEffectAtomConfig atom,
            CardCombatProfile profile)
        {
            int bounces = Math.Max(
                Integer(atom, "bounces"),
                Integer(atom, "targets"));
            float retention = Positive(atom, "damageRetention", 1f);
            if (binding.trigger == "interval")
            {
                profile.ChainPulseInterval = MaxPositive(
                    profile.ChainPulseInterval,
                    Number(binding.triggerParams, "seconds"));
                profile.ChainPulseTargets = Math.Max(
                    profile.ChainPulseTargets,
                    Math.Max(1, Integer(atom, "targets")));
                profile.ChainPulseBounces = Math.Max(
                    profile.ChainPulseBounces,
                    bounces);
                profile.ChainPulseDamageRetention = Math.Max(
                    profile.ChainPulseDamageRetention,
                    retention);
            }
            else
            {
                profile.ChainBounces = Math.Max(profile.ChainBounces, bounces);
                profile.ChainDamageRetention = Math.Min(
                    profile.ChainDamageRetention,
                    retention);
            }
        }

        private static void ApplyDot(
            CompiledEffectBindingConfig binding,
            CompiledEffectAtomConfig atom,
            string parentAtom,
            CardCombatProfile profile)
        {
            float ratio = Number(atom, "damageRatio");
            float duration = Positive(atom, "duration", 3f);
            float tick = Positive(atom, "tickInterval", 0.5f);
            if (parentAtom == "aura")
            {
                profile.ScorchAuraDamageRatio = Math.Max(
                    profile.ScorchAuraDamageRatio,
                    ratio);
                profile.ScorchAuraTickInterval = MaxPositive(
                    profile.ScorchAuraTickInterval,
                    tick);
            }
            else if (parentAtom == "groundZone")
            {
                profile.MagmaDamageRatio = Math.Max(
                    profile.MagmaDamageRatio,
                    ratio);
                profile.MagmaTickInterval = MaxPositive(
                    profile.MagmaTickInterval,
                    tick);
            }
            else if (binding.trigger == "onHit"
                && Text(binding.triggerParams, "requiresStatus")
                    .Contains("dot"))
            {
                profile.SecondaryDotDamageRatio = Math.Max(
                    profile.SecondaryDotDamageRatio,
                    ratio);
                profile.SecondaryDotDuration = Math.Max(
                    profile.SecondaryDotDuration,
                    duration);
                profile.SecondaryDotTickInterval = MaxPositive(
                    profile.SecondaryDotTickInterval,
                    tick);
            }
            else if (binding.trigger == "onHit")
            {
                profile.DotDamageRatio = Math.Max(profile.DotDamageRatio, ratio);
                profile.DotDuration = Math.Max(profile.DotDuration, duration);
                profile.DotTickInterval = MaxPositive(profile.DotTickInterval, tick);
            }
        }

        private static void ApplySlow(
            CompiledEffectBindingConfig binding,
            CompiledEffectAtomConfig atom,
            string parentAtom,
            CardCombatProfile profile)
        {
            float ratio = Number(atom, "ratio");
            float duration = Positive(atom, "duration", 1f);
            if (parentAtom == "aura")
            {
                profile.AuraSlowRatio = Math.Max(profile.AuraSlowRatio, ratio);
            }
            else if (parentAtom == "groundZone")
            {
                profile.PermafrostSlowRatio = Math.Max(
                    profile.PermafrostSlowRatio,
                    ratio);
            }
            else
            {
                profile.SlowRatio = Math.Max(profile.SlowRatio, ratio);
                profile.SlowDuration = Math.Max(profile.SlowDuration, duration);
            }
        }

        private static void ApplyVulnerable(
            CompiledEffectAtomConfig atom,
            string parentAtom,
            CardCombatProfile profile,
            float ratio,
            float duration)
        {
            if (parentAtom == "aura")
                profile.AuraVulnerableRatio = Math.Max(
                    profile.AuraVulnerableRatio,
                    ratio);
            else if (parentAtom == "groundZone")
            {
                profile.DotAreaVulnerableRatio = Math.Max(
                    profile.DotAreaVulnerableRatio,
                    ratio);
                profile.DotAreaVulnerableDuration = Math.Max(
                    profile.DotAreaVulnerableDuration,
                    duration);
            }
            else
            {
                profile.VulnerableRatio = Math.Max(profile.VulnerableRatio, ratio);
                profile.VulnerableDuration = Math.Max(
                    profile.VulnerableDuration,
                    duration);
            }
        }

        private static void ApplyBurst(
            CompiledEffectBindingConfig binding,
            CompiledEffectAtomConfig atom,
            CardCombatProfile profile,
            float radius)
        {
            float damage = Math.Max(
                Number(atom, "damageMul"),
                Number(atom, "damageRatio"));
            string required = Text(binding.triggerParams, "requiresStatus");
            if (binding.trigger == "onBreach")
            {
                profile.BreachBurstDamageMultiplier = Math.Max(
                    profile.BreachBurstDamageMultiplier,
                    damage);
                profile.BreachBurstRadius = Math.Max(
                    profile.BreachBurstRadius,
                    radius);
                string scaleSource = Text(atom, "scaleBy.source");
                if (scaleSource == "thornsRatio")
                {
                    profile.BreachBurstThornsScale = Math.Max(
                        profile.BreachBurstThornsScale,
                        Number(atom, "scaleBy.perUnit"));
                    profile.BreachBurstThornsScaleCap = Math.Max(
                        profile.BreachBurstThornsScaleCap,
                        Number(atom, "scaleBy.cap"));
                }
                else if (scaleSource == "shieldTier")
                {
                    profile.BreachBurstShieldScale = Math.Max(
                        profile.BreachBurstShieldScale,
                        Number(atom, "scaleBy.perUnit"));
                    profile.BreachBurstShieldScaleCap = Math.Max(
                        profile.BreachBurstShieldScaleCap,
                        Number(atom, "scaleBy.cap"));
                }
            }
            else if (required.Contains("dot"))
            {
                profile.DotHitBurstDamageMultiplier = Math.Max(
                    profile.DotHitBurstDamageMultiplier,
                    damage);
                profile.DotHitBurstRadius = Math.Max(
                    profile.DotHitBurstRadius,
                    radius);
            }
            else if (required.Contains("brand"))
            {
                profile.BrandedHitBurstDamageMultiplier = Math.Max(
                    profile.BrandedHitBurstDamageMultiplier,
                    damage);
                profile.BrandedHitBurstRadius = Math.Max(
                    profile.BrandedHitBurstRadius,
                    radius);
            }
            else
            {
                profile.SplashDamageRatio = Math.Max(
                    profile.SplashDamageRatio,
                    damage);
                profile.SplashRadius = Math.Max(profile.SplashRadius, radius);
            }
        }

        private static void ApplyGroundZone(
            CompiledEffectBindingConfig binding,
            CompiledEffectAtomConfig atom,
            CardCombatProfile profile,
            float radius,
            float duration)
        {
            if (binding.trigger == "onHit")
            {
                profile.DotAreaRadius = Math.Max(profile.DotAreaRadius, radius);
            }
            else if (binding.trigger == "onKill"
                && Text(binding.triggerParams, "requiresSource") == "dot")
            {
                profile.DotKillZoneCount = Math.Max(
                    profile.DotKillZoneCount,
                    Math.Max(1, Integer(atom, "forEach.maxTargets")));
                profile.DotKillZoneRadius = Math.Max(
                    profile.DotKillZoneRadius,
                    radius);
                profile.DotKillZoneDuration = Math.Max(
                    profile.DotKillZoneDuration,
                    duration);
                profile.DotKillZoneTickInterval = MaxPositive(
                    profile.DotKillZoneTickInterval,
                    Positive(atom, "tickInterval", 0.5f));
                foreach (CompiledEffectAtomConfig child
                    in atom.children ?? Array.Empty<CompiledEffectAtomConfig>())
                {
                    if (child.atom == "dot")
                    {
                        profile.DotKillZoneDamageRatio = Math.Max(
                            profile.DotKillZoneDamageRatio,
                            Number(child, "damageRatio"));
                    }
                }
            }
            else
            {
                profile.MagmaInterval = MaxPositive(
                    profile.MagmaInterval,
                    Number(binding.triggerParams, "seconds"));
                profile.MagmaRadius = Math.Max(profile.MagmaRadius, radius);
                profile.MagmaDuration = Math.Max(profile.MagmaDuration, duration);
                profile.MagmaZoneCount = Math.Max(profile.MagmaZoneCount, 1);
            }
        }

        private static void ApplyKnockback(
            CompiledEffectBindingConfig binding,
            CompiledEffectAtomConfig atom,
            CardCombatProfile profile)
        {
            float distance = Number(atom, "distance");
            float radius = Number(atom, "radius");
            if (binding.trigger == "onBreach")
            {
                profile.BreachKnockback = Math.Max(
                    profile.BreachKnockback,
                    distance);
            }
            else
            {
                profile.KnockbackDistance = Math.Max(
                    profile.KnockbackDistance,
                    distance);
                profile.HitAreaKnockbackRadius = Math.Max(
                    profile.HitAreaKnockbackRadius,
                    radius);
            }
        }

        private static void ApplyExtraDrop(
            CompiledEffectBindingConfig binding,
            CompiledEffectAtomConfig atom,
            CardCombatProfile profile)
        {
            float chance = Positive(atom, "chance", 1f);
            string required = Text(binding.triggerParams, "requiresStatus");
            if (required.Contains("dot"))
                profile.DotKillExtraDropChance = Math.Max(
                    profile.DotKillExtraDropChance,
                    chance);
            else if (required.Contains("brand"))
                profile.BrandedKillExtraDropChance = Math.Max(
                    profile.BrandedKillExtraDropChance,
                    chance);
            else if (required.Contains("frozen"))
                profile.ControlledKillExtraDropChance = Math.Max(
                    profile.ControlledKillExtraDropChance,
                    chance);
            else
                profile.KillExtraDropChance = Math.Max(
                    profile.KillExtraDropChance,
                    chance);
        }

        private static void ApplyStatBuff(
            CompiledEffectBindingConfig binding,
            CompiledEffectAtomConfig atom,
            CardCombatProfile profile)
        {
            string stat = Text(atom, "stat");
            float value = Positive(atom, "value", 1f);
            float duration = Number(atom, "duration");
            if (binding.trigger == "onWaveStart" && stat == "fireRate")
            {
                profile.WaveStartFireRateMultiplier = Math.Max(
                    profile.WaveStartFireRateMultiplier,
                    value);
                profile.WaveStartFireRateDuration = Math.Max(
                    profile.WaveStartFireRateDuration,
                    duration);
            }
            else if (binding.trigger == "onWaveStart" && stat == "damage")
            {
                profile.WaveStartDamageMultiplier = Math.Max(
                    profile.WaveStartDamageMultiplier,
                    value);
                profile.WaveStartDamageDuration = Math.Max(
                    profile.WaveStartDamageDuration,
                    duration);
            }
            else if (binding.trigger == "onKill" && stat == "damage")
            {
                profile.DotKillDamageMultiplier = Math.Max(
                    profile.DotKillDamageMultiplier,
                    value);
                profile.DotKillDamageMaxStacks = Math.Max(
                    profile.DotKillDamageMaxStacks,
                    Math.Max(1, Integer(atom, "maxStacks")));
            }
        }

        private static int Integer(CompiledEffectAtomConfig atom, string key)
        {
            return (int)Math.Round(Number(atom, key));
        }

        private static float Number(CompiledEffectAtomConfig atom, string key)
        {
            return Number(atom?.Params, key);
        }

        private static float Number(
            CompiledEffectParamConfig[] parameters,
            string key)
        {
            foreach (CompiledEffectParamConfig parameter
                in parameters ?? Array.Empty<CompiledEffectParamConfig>())
            {
                if (parameter?.key == key && parameter.kind == "number")
                    return parameter.number;
            }
            return 0f;
        }

        private static string Text(CompiledEffectAtomConfig atom, string key)
        {
            return Text(atom?.Params, key);
        }

        private static string Text(
            CompiledEffectParamConfig[] parameters,
            string key)
        {
            foreach (CompiledEffectParamConfig parameter
                in parameters ?? Array.Empty<CompiledEffectParamConfig>())
            {
                if (parameter?.key == key)
                    return parameter.text ?? string.Empty;
            }
            return string.Empty;
        }

        private static float Positive(
            CompiledEffectAtomConfig atom,
            string key,
            float fallback)
        {
            float value = Number(atom, key);
            return value > 0f ? value : fallback;
        }

        private static float Positive(
            CompiledEffectParamConfig[] parameters,
            string key,
            float fallback)
        {
            float value = Number(parameters, key);
            return value > 0f ? value : fallback;
        }

        private static float MaxPositive(float current, float candidate)
        {
            if (candidate <= 0f)
                return current;
            return current <= 0f ? candidate : Math.Max(current, candidate);
        }
    }
}
