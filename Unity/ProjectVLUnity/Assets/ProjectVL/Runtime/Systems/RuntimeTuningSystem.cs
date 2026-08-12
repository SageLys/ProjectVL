using System;
using System.Collections.Generic;
using ProjectVL.Config;

namespace ProjectVL.Systems
{
    public sealed class TuningParameter
    {
        private readonly Func<float> _getter;
        private readonly Action<float> _setter;
        private readonly float _baseline;

        public string Group { get; }
        public string Key { get; }
        public string Label { get; }
        public float Min { get; }
        public float Max { get; }
        public bool Integer { get; }
        public bool AppliesNextWave { get; }
        public float Value => _getter();

        public TuningParameter(
            string group,
            string key,
            string label,
            float min,
            float max,
            bool integer,
            bool appliesNextWave,
            Func<float> getter,
            Action<float> setter)
        {
            Group = group;
            Key = key;
            Label = label;
            Min = min;
            Max = max;
            Integer = integer;
            AppliesNextWave = appliesNextWave;
            _getter = getter;
            _setter = setter;
            _baseline = getter();
        }

        public void Set(float value)
        {
            float bounded = Math.Max(Min, Math.Min(Max, value));
            _setter(Integer ? (float)Math.Round(bounded) : bounded);
        }

        public void Reset()
        {
            _setter(_baseline);
        }
    }

    public sealed class RuntimeTuningSystem
    {
        private readonly List<TuningParameter> _parameters =
            new List<TuningParameter>();
        private readonly BountyConfig _bounty;
        private readonly bool _bountyBaseline;
        private readonly HashSet<string> _lastAppliedDifferences =
            new HashSet<string>();

        public IReadOnlyList<TuningParameter> Parameters => _parameters;
        public bool BountyEnabled => _bounty.enabled;
        public string AppliedPresetName { get; private set; } = "Default";

        public RuntimeTuningSystem(
            CombatConfig combat,
            EnemiesConfig enemies,
            WavesConfig waves,
            EconomyConfig economy,
            BountyConfig bounty,
            ProgressionConfig progression = null)
        {
            if (combat == null) throw new ArgumentNullException(nameof(combat));
            if (enemies == null) throw new ArgumentNullException(nameof(enemies));
            if (waves == null) throw new ArgumentNullException(nameof(waves));
            if (economy == null) throw new ArgumentNullException(nameof(economy));
            _bounty = bounty ?? throw new ArgumentNullException(nameof(bounty));
            _bountyBaseline = bounty.enabled;

            Add("Combat", "combat.defaults.damage", "Damage", 1f, 200f, false, false,
                () => combat.defaults.damage, value => combat.defaults.damage = value);
            Add("Combat", "combat.defaults.fireRate", "Fire rate", 0.1f, 20f, false, false,
                () => combat.defaults.fireRate, value => combat.defaults.fireRate = value);
            Add("Combat", "combat.defaults.range", "Range", 50f, 210f, false, false,
                () => combat.defaults.range, value => combat.defaults.range = value);
            Add("Combat", "combat.bullet.speed", "Bullet speed", 50f, 1500f, false, false,
                () => combat.bullet.speed, value => combat.bullet.speed = value);
            Add("Combat", "combat.bullet.life", "Bullet life", 0.1f, 5f, false, false,
                () => combat.bullet.life, value => combat.bullet.life = value);
            Add("Combat", "combat.bullet.spread", "Bullet spread", 0f, 0.5f, false, false,
                () => combat.bullet.spread, value => combat.bullet.spread = value);
            Add("Combat", "combat.hp.max", "Max HP", 5f, 1000f, false, false,
                () => combat.hp.max, value => combat.hp.max = value);
            Add("Combat", "combat.breakthroughDist", "Breakthrough distance", 1f, 250f, false, false,
                () => combat.breakthroughDist, value => combat.breakthroughDist = value);
            Add("Combat", "combat.dangerZoneWidth", "Danger zone width", 0f, 300f, false, false,
                () => combat.dangerZoneWidth, value => combat.dangerZoneWidth = value);

            Add("Enemies", "enemies.defaults.enemySpeed", "Global speed", 0.1f, 3f, false, false,
                () => enemies.defaults.enemySpeed, value => enemies.defaults.enemySpeed = value);
            AddEnemy("Enemies", "Normal", enemies.types.normal);
            AddEnemy("Enemies", "Fast", enemies.types.fast);
            AddEnemy("Enemies", "Tank", enemies.types.tank);
            AddEnemy("Enemies", "Boss", enemies.types.boss);

            AddWaveDirector(waves);
            AddStage("Waves", "Selection", waves.stagePlan.selection);
            AddStage("Waves", "Build", waves.stagePlan.build);

            Add("Drops", "economy.dropChance", "Drop chance", 0f, 1f, false, false,
                () => economy.defaults.dropChance, value => economy.defaults.dropChance = value);
            Add("Drops", "economy.dropLifetime", "Drop lifetime", 1f, 30f, false, false,
                () => economy.defaults.dropLifetime, value => economy.defaults.dropLifetime = value);
            AddDropDirector(economy);
            AddBounty(bounty);
            if (progression != null)
            {
                Add("Progression", "progression.killXpMul", "Kill XP multiplier", 0f, 10f, false, false,
                    () => progression.killXpMul, value => progression.killXpMul = value);
                Add("Progression", "progression.relicChoices", "Relic choices", 1f, 8f, true, false,
                    () => progression.relicChoices,
                    value => progression.relicChoices = (int)value);
            }
        }

        public void SetBountyEnabled(bool enabled)
        {
            _bounty.enabled = enabled;
        }

        public void ResetGroup(string group)
        {
            foreach (TuningParameter parameter in _parameters)
            {
                if (parameter.Group == group)
                {
                    parameter.Reset();
                }
            }

            if (group == "Bounty")
            {
                _bounty.enabled = _bountyBaseline;
            }
        }

        public void ResetAll()
        {
            foreach (TuningParameter parameter in _parameters)
            {
                parameter.Reset();
            }

            _bounty.enabled = _bountyBaseline;
            AppliedPresetName = "Default";
            _lastAppliedDifferences.Clear();
        }

        public TuningPreset CapturePreset(string name)
        {
            var preset = new TuningPreset
            {
                name = name?.Trim(),
                savedAt = DateTime.UtcNow.ToString("O"),
                bountyEnabled = _bounty.enabled
            };
            foreach (TuningParameter parameter in _parameters)
            {
                preset.values.Add(new TuningPresetValue
                {
                    key = parameter.Key,
                    value = parameter.Value
                });
            }

            return preset;
        }

        public int ApplyPreset(TuningPreset preset)
        {
            if (preset == null)
            {
                throw new ArgumentNullException(nameof(preset));
            }

            _lastAppliedDifferences.Clear();
            var values = new Dictionary<string, float>();
            foreach (TuningPresetValue value in preset.values)
            {
                if (value != null && !string.IsNullOrEmpty(value.key))
                {
                    values[value.key] = value.value;
                }
            }

            foreach (TuningParameter parameter in _parameters)
            {
                if (values.TryGetValue(parameter.Key, out float value))
                {
                    if (Math.Abs(parameter.Value - value) > 0.0001f)
                    {
                        _lastAppliedDifferences.Add(parameter.Key);
                    }

                    parameter.Set(value);
                }
            }

            if (_bounty.enabled != preset.bountyEnabled)
            {
                _lastAppliedDifferences.Add("bounty.enabled");
            }

            _bounty.enabled = preset.bountyEnabled;
            AppliedPresetName = string.IsNullOrWhiteSpace(preset.name)
                ? "Imported"
                : preset.name;
            return _lastAppliedDifferences.Count;
        }

        public bool WasChangedByLastPreset(TuningParameter parameter)
        {
            return parameter != null
                && _lastAppliedDifferences.Contains(parameter.Key);
        }

        private void AddEnemy(
            string group,
            string prefix,
            EnemyTypeConfig enemy)
        {
            string keyPrefix = "enemies.types." + prefix.ToLowerInvariant();
            Add(group, keyPrefix + ".hpBase", prefix + " HP", 1f, 10000f, false, false,
                () => enemy.hpBase, value => enemy.hpBase = value);
            Add(group, keyPrefix + ".hpPerWave", prefix + " HP/wave", 0f, 1000f, false, false,
                () => enemy.hpPerWave, value => enemy.hpPerWave = value);
            Add(group, keyPrefix + ".speedBase", prefix + " speed", 1f, 200f, false, false,
                () => enemy.speedBase, value => enemy.speedBase = value);
            Add(group, keyPrefix + ".speedPerWave", prefix + " speed/wave", 0f, 30f, false, false,
                () => enemy.speedPerWave, value => enemy.speedPerWave = value);
            Add(group, keyPrefix + ".damage", prefix + " damage", 0f, 1000f, false, false,
                () => enemy.damage, value => enemy.damage = value);
            Add(group, keyPrefix + ".r", prefix + " radius", 4f, 160f, false, false,
                () => enemy.r, value => enemy.r = value);
            Add(group, keyPrefix + ".xp", prefix + " XP", 0f, 100f, true, false,
                () => enemy.xp, value => enemy.xp = (int)value);
        }

        private void AddStage(
            string group,
            string prefix,
            RegularStageConfig stage)
        {
            string keyPrefix = "waves.stagePlan." + prefix.ToLowerInvariant();
            Add(group, keyPrefix + ".waveQuota.start", prefix + " quota start", 1f, 400f, false, true,
                () => stage.waveQuota.start, value => stage.waveQuota.start = value);
            Add(group, keyPrefix + ".waveQuota.end", prefix + " quota end", 1f, 400f, false, true,
                () => stage.waveQuota.end, value => stage.waveQuota.end = value);
            Add(group, keyPrefix + ".targetOnScreen.start", prefix + " target start", 1f, 60f, false, true,
                () => stage.targetOnScreen.start,
                value => stage.targetOnScreen.start = value);
            Add(group, keyPrefix + ".targetOnScreen.end", prefix + " target end", 1f, 60f, false, true,
                () => stage.targetOnScreen.end,
                value => stage.targetOnScreen.end = value);
            Add(group, keyPrefix + ".maxAlive", prefix + " max alive", 1f, 200f, true, true,
                () => stage.maxAlive, value => stage.maxAlive = (int)value);
        }

        private void AddWaveDirector(WavesConfig waves)
        {
            Add("Waves", "waves.totalWaves", "Total waves", 1f, 100f, true, true,
                () => waves.totalWaves, value => waves.totalWaves = (int)value);
            Add("Waves", "waves.enemyCountBase", "Enemy count base", 0f, 200f, true, true,
                () => waves.enemyCountBase, value => waves.enemyCountBase = (int)value);
            Add("Waves", "waves.enemyCountPerWave", "Enemy count/wave", 0f, 100f, true, true,
                () => waves.enemyCountPerWave, value => waves.enemyCountPerWave = (int)value);
            Add("Waves", "waves.firstSpawnDelay", "First spawn delay", 0f, 10f, false, true,
                () => waves.firstSpawnDelay, value => waves.firstSpawnDelay = value);
            Add("Waves", "waves.spawnInterval.base", "Spawn interval base", 0.05f, 10f, false, true,
                () => waves.spawnInterval.@base, value => waves.spawnInterval.@base = value);
            Add("Waves", "waves.spawnInterval.perWave", "Spawn interval/wave", 0f, 1f, false, true,
                () => waves.spawnInterval.perWave, value => waves.spawnInterval.perWave = value);
            Add("Waves", "waves.spawnInterval.min", "Spawn interval min", 0.01f, 5f, false, true,
                () => waves.spawnInterval.min, value => waves.spawnInterval.min = value);
            Add("Waves", "waves.spawnMargin", "Spawn margin", 0f, 200f, false, true,
                () => waves.spawnMargin, value => waves.spawnMargin = value);
            Add("Waves", "waves.typeRoll.tankBase", "Tank chance base", 0f, 1f, false, true,
                () => waves.typeRoll.tankBase, value => waves.typeRoll.tankBase = value);
            Add("Waves", "waves.typeRoll.tankPerWave", "Tank chance/wave", 0f, 0.2f, false, true,
                () => waves.typeRoll.tankPerWave, value => waves.typeRoll.tankPerWave = value);
            Add("Waves", "waves.typeRoll.fastThreshold", "Fast threshold", 0f, 1f, false, true,
                () => waves.typeRoll.fastThreshold, value => waves.typeRoll.fastThreshold = value);
            Add("Waves", "waves.intermission.settleSeconds", "Intermission settle", 0f, 10f, false, true,
                () => waves.intermission.settleSeconds, value => waves.intermission.settleSeconds = value);
            Add("Waves", "waves.intermission.freeSeconds.selection", "Selection rest", 0f, 60f, false, true,
                () => waves.intermission.freeSeconds.selection,
                value => waves.intermission.freeSeconds.selection = value);
            Add("Waves", "waves.intermission.freeSeconds.buildEarly", "Build early rest", 0f, 60f, false, true,
                () => waves.intermission.freeSeconds.buildEarly,
                value => waves.intermission.freeSeconds.buildEarly = value);
            Add("Waves", "waves.intermission.freeSeconds.buildLate", "Build late rest", 0f, 60f, false, true,
                () => waves.intermission.freeSeconds.buildLate,
                value => waves.intermission.freeSeconds.buildLate = value);
            Add("Waves", "waves.intermission.freeSeconds.validation", "Validation rest", 0f, 60f, false, true,
                () => waves.intermission.freeSeconds.validation,
                value => waves.intermission.freeSeconds.validation = value);
            Add("Waves", "waves.stagePlan.selectionWaves", "Selection waves", 1f, 4f, true, true,
                () => waves.stagePlan.selectionWaves,
                value => waves.stagePlan.selectionWaves = (int)value);
            Add("Waves", "waves.stagePlan.validationWaves", "Validation waves", 1f, 3f, true, true,
                () => waves.stagePlan.validationWaves,
                value => waves.stagePlan.validationWaves = (int)value);
            Add("Waves", "waves.budget.waveQuota.base", "Budget quota base", 1f, 500f, false, true,
                () => waves.budget.waveQuota.@base, value => waves.budget.waveQuota.@base = value);
            Add("Waves", "waves.budget.waveQuota.perWave", "Budget quota/wave", 0f, 200f, false, true,
                () => waves.budget.waveQuota.perWave, value => waves.budget.waveQuota.perWave = value);
            Add("Waves", "waves.budget.targetOnScreen.base", "Budget target base", 1f, 30f, false, true,
                () => waves.budget.targetOnScreen.@base,
                value => waves.budget.targetOnScreen.@base = value);
            Add("Waves", "waves.budget.targetOnScreen.perWave", "Budget target/wave", 0f, 10f, false, true,
                () => waves.budget.targetOnScreen.perWave,
                value => waves.budget.targetOnScreen.perWave = value);
            Add("Waves", "waves.budget.checkInterval", "Budget check interval", 0.05f, 30f, false, true,
                () => waves.budget.checkInterval, value => waves.budget.checkInterval = value);
            Add("Waves", "waves.budget.batchMax", "Budget batch max", 1f, 30f, true, true,
                () => waves.budget.batchMax, value => waves.budget.batchMax = (int)value);
            Add("Waves", "waves.budget.waveEndSprint.window", "Budget sprint window", 0f, 60f, false, true,
                () => waves.budget.waveEndSprint.window,
                value => waves.budget.waveEndSprint.window = value);
            Add("Waves", "waves.budget.waveEndSprint.multiplier", "Budget sprint multiplier", 1f, 4f, false, true,
                () => waves.budget.waveEndSprint.multiplier,
                value => waves.budget.waveEndSprint.multiplier = value);
            Add("Waves", "waves.budget.maxAlive", "Budget max alive", 1f, 100f, true, true,
                () => waves.budget.maxAlive, value => waves.budget.maxAlive = (int)value);
        }

        private void AddDropDirector(EconomyConfig economy)
        {
            OrdinaryDropRateConfig rate = economy.ordinaryDropRate;
            Add("Drops", "economy.ordinaryDropRate.selectionPerMinute", "Selection drops/min", 5f, 90f, false, false,
                () => rate.selectionPerMinute, value => rate.selectionPerMinute = value);
            Add("Drops", "economy.ordinaryDropRate.buildPerMinute", "Build drops/min", 5f, 90f, false, false,
                () => rate.buildPerMinute, value => rate.buildPerMinute = value);
            Add("Drops", "economy.ordinaryDropRate.buildTransitionSeconds", "Build transition", 0f, 60f, false, false,
                () => rate.buildTransitionSeconds, value => rate.buildTransitionSeconds = value);
            Add("Drops", "economy.ordinaryDropRate.carryCap", "Drop credit cap", 1f, 5f, false, false,
                () => rate.carryCap, value => rate.carryCap = value);

            NormalDropTypePolicyConfig policy = economy.normalDropTypePolicy;
            const string policyKey = "economy.normalDropTypePolicy";
            Add("Drops", policyKey + ".roleBagSize", "Role bag size", 4f, 20f, true, false,
                () => policy.roleBagSize, value => policy.roleBagSize = (int)value);
            AddMix("Drops", policyKey + ".earlyMix", "Early", policy.earlyMix);
            AddMix("Drops", policyKey + ".lateMix", "Late", policy.lateMix);
            Add("Drops", policyKey + ".bootstrapMinDiscovery", "Bootstrap discovery", 0f, 10f, true, false,
                () => policy.bootstrapMinDiscovery,
                value => policy.bootstrapMinDiscovery = (int)value);
            Add("Drops", policyKey + ".godAffinity.scorePerStack", "Affinity/stack", 0f, 6f, false, false,
                () => policy.godAffinity.scorePerStack,
                value => policy.godAffinity.scorePerStack = value);
            Add("Drops", policyKey + ".godAffinity.scoreCap", "Affinity cap", 0f, 12f, false, false,
                () => policy.godAffinity.scoreCap,
                value => policy.godAffinity.scoreCap = value);
            Add("Drops", policyKey + ".maturity.fullMergeOps", "Maturity merge ops", 1f, 40f, true, false,
                () => policy.maturity.fullMergeOps,
                value => policy.maturity.fullMergeOps = (int)value);
            Add("Drops", policyKey + ".maturity.fullHighestStar", "Maturity highest star", 2f, 6f, true, false,
                () => policy.maturity.fullHighestStar,
                value => policy.maturity.fullHighestStar = (int)value);
            Add("Drops", policyKey + ".maturity.fullEquippedTypes", "Maturity equipped types", 1f, 3f, true, false,
                () => policy.maturity.fullEquippedTypes,
                value => policy.maturity.fullEquippedTypes = (int)value);
            Add("Drops", policyKey + ".maturity.mergeWeight", "Maturity merge weight", 0f, 1f, false, false,
                () => policy.maturity.mergeWeight, value => policy.maturity.mergeWeight = value);
            Add("Drops", policyKey + ".maturity.starWeight", "Maturity star weight", 0f, 1f, false, false,
                () => policy.maturity.starWeight, value => policy.maturity.starWeight = value);
            Add("Drops", policyKey + ".maturity.equipWeight", "Maturity equip weight", 0f, 1f, false, false,
                () => policy.maturity.equipWeight, value => policy.maturity.equipWeight = value);
            Add("Drops", policyKey + ".build.topK", "Build top K", 1f, 6f, true, false,
                () => policy.build.topK, value => policy.build.topK = (int)value);
            Add("Drops", policyKey + ".build.scorePower", "Build score power", 0.5f, 3f, false, false,
                () => policy.build.scorePower, value => policy.build.scorePower = value);
            Add("Drops", policyKey + ".build.mergeReadyMultiplier", "Merge-ready multiplier", 1f, 4f, false, false,
                () => policy.build.mergeReadyMultiplier,
                value => policy.build.mergeReadyMultiplier = value);
            Add("Drops", policyKey + ".build.equippedBaseBonus", "Equipped base bonus", 0f, 20f, false, false,
                () => policy.build.equippedBaseBonus,
                value => policy.build.equippedBaseBonus = value);
            Add("Drops", policyKey + ".build.equippedStarBonus", "Equipped star bonus", 0f, 10f, false, false,
                () => policy.build.equippedStarBonus,
                value => policy.build.equippedStarBonus = value);
            Add("Drops", policyKey + ".build.historicalMergeWeight", "Historical merge weight", 0f, 2f, false, false,
                () => policy.build.historicalMergeWeight,
                value => policy.build.historicalMergeWeight = value);
            Add("Drops", policyKey + ".build.historicalMergeCap", "Historical merge cap", 0f, 30f, true, false,
                () => policy.build.historicalMergeCap,
                value => policy.build.historicalMergeCap = (int)value);
            Add("Drops", policyKey + ".build.maxWeightRatio", "Max weight ratio", 1f, 20f, false, false,
                () => policy.build.maxWeightRatio,
                value => policy.build.maxWeightRatio = value);
            Add("Drops", policyKey + ".pivot.excludeTopK", "Pivot exclude top K", 0f, 5f, true, false,
                () => policy.pivot.excludeTopK,
                value => policy.pivot.excludeTopK = (int)value);
            Add("Drops", policyKey + ".pivot.candidateFraction", "Pivot candidate fraction", 0.1f, 1f, false, false,
                () => policy.pivot.candidateFraction,
                value => policy.pivot.candidateFraction = value);
            Add("Drops", policyKey + ".maxSameTypeStreak", "Max same-type streak", 1f, 5f, true, false,
                () => policy.maxSameTypeStreak,
                value => policy.maxSameTypeStreak = (int)value);
        }

        private void AddBounty(BountyConfig bounty)
        {
            BountyOfferConfig offer = bounty.offer;
            Add("Bounty", "bounty.offer.enabledFromWave", "Offer start wave", 1f, 20f, true, true,
                () => offer.enabledFromWave, value => offer.enabledFromWave = (int)value);
            Add("Bounty", "bounty.offer.checkIntervalSeconds", "Offer check interval", 0.25f, 30f, false, false,
                () => offer.checkIntervalSeconds, value => offer.checkIntervalSeconds = value);
            Add("Bounty", "bounty.offer.baseChancePerCheck", "Offer base chance", 0f, 1f, false, false,
                () => offer.baseChancePerCheck, value => offer.baseChancePerCheck = value);
            Add("Bounty", "bounty.offer.minChancePerCheck", "Offer minimum chance", 0f, 1f, false, false,
                () => offer.minChancePerCheck, value => offer.minChancePerCheck = value);
            Add("Bounty", "bounty.offer.maxChancePerCheck", "Offer maximum chance", 0f, 1f, false, false,
                () => offer.maxChancePerCheck, value => offer.maxChancePerCheck = value);
            Add("Bounty", "bounty.offer.noDamageRampSeconds", "No-damage ramp", 0.5f, 180f, false, false,
                () => offer.noDamageRampSeconds, value => offer.noDamageRampSeconds = value);
            Add("Bounty", "bounty.offer.noDamageBonusMax", "No-damage bonus cap", 0f, 1f, false, false,
                () => offer.noDamageBonusMax, value => offer.noDamageBonusMax = value);
            Add("Bounty", "bounty.offer.healthyHpThreshold", "Healthy HP threshold", 0f, 1f, false, false,
                () => offer.healthyHpThreshold, value => offer.healthyHpThreshold = value);
            Add("Bounty", "bounty.offer.healthyHpBonusMax", "Healthy HP bonus", 0f, 1f, false, false,
                () => offer.healthyHpBonusMax, value => offer.healthyHpBonusMax = value);
            Add("Bounty", "bounty.offer.recentDamagePenalty", "Recent damage penalty", 0f, 1f, false, false,
                () => offer.recentDamagePenalty, value => offer.recentDamagePenalty = value);
            Add("Bounty", "bounty.offer.recentDamagePenaltySeconds", "Recent damage window", 0.5f, 60f, false, false,
                () => offer.recentDamagePenaltySeconds,
                value => offer.recentDamagePenaltySeconds = value);
            Add("Bounty", "bounty.offer.markWindowSeconds", "Offer accept window", 0.5f, 30f, false, false,
                () => offer.markWindowSeconds, value => offer.markWindowSeconds = value);
            Add("Bounty", "bounty.offer.cooldownSeconds", "Offer cooldown", 0f, 60f, false, false,
                () => offer.cooldownSeconds, value => offer.cooldownSeconds = value);
            Add("Bounty", "bounty.offer.minOffersPerWave", "Offers per wave minimum", 0f, 10f, true, true,
                () => offer.minOffersPerWave, value => offer.minOffersPerWave = (int)value);
            Add("Bounty", "bounty.offer.maxOffersPerWave", "Offers per wave maximum", 1f, 10f, true, true,
                () => offer.maxOffersPerWave, value => offer.maxOffersPerWave = (int)value);
            Add("Bounty", "bounty.offer.guaranteeAtWaveProgress", "Offer guarantee progress", 0f, 1f, false, false,
                () => offer.guaranteeAtWaveProgress,
                value => offer.guaranteeAtWaveProgress = value);
            Add("Bounty", "bounty.offer.maxConcurrentOffers", "Concurrent offers", 1f, 5f, true, false,
                () => offer.maxConcurrentOffers,
                value => offer.maxConcurrentOffers = (int)value);
            Add("Bounty", "bounty.offer.maxConcurrentEncounters", "Concurrent encounters", 1f, 5f, true, false,
                () => offer.maxConcurrentEncounters,
                value => offer.maxConcurrentEncounters = (int)value);

            BountyEncounterConfig encounter = bounty.encounter;
            Add("Bounty", "bounty.encounter.enemyCountBase", "Encounter enemy base", 1f, 20f, true, true,
                () => encounter.enemyCountBase, value => encounter.enemyCountBase = (int)value);
            Add("Bounty", "bounty.encounter.enemyCountPerWave", "Encounter enemies/wave", 0f, 5f, false, true,
                () => encounter.enemyCountPerWave, value => encounter.enemyCountPerWave = value);
            Add("Bounty", "bounty.encounter.enemyCountMax", "Encounter enemy cap", 1f, 30f, true, true,
                () => encounter.enemyCountMax, value => encounter.enemyCountMax = (int)value);
            Add("Bounty", "bounty.encounter.hpMul", "Encounter HP multiplier", 0.1f, 5f, false, false,
                () => encounter.hpMul, value => encounter.hpMul = value);
            Add("Bounty", "bounty.encounter.speedMul", "Encounter speed multiplier", 0.1f, 3f, false, false,
                () => encounter.speedMul, value => encounter.speedMul = value);
            Add("Bounty", "bounty.encounter.damageMul", "Encounter damage multiplier", 0f, 5f, false, false,
                () => encounter.damageMul, value => encounter.damageMul = value);
            Add("Bounty", "bounty.encounter.spawnIntervalSeconds", "Encounter spawn interval", 0.01f, 3f, false, false,
                () => encounter.spawnIntervalSeconds,
                value => encounter.spawnIntervalSeconds = value);
            Add("Bounty", "bounty.encounter.spawnSpread", "Encounter spawn spread", 0f, 600f, false, false,
                () => encounter.spawnSpread, value => encounter.spawnSpread = value);
            Add("Bounty", "bounty.encounter.emergencyOverrideDistance", "Emergency override distance", 1f, 400f, false, false,
                () => encounter.emergencyOverrideDistance,
                value => encounter.emergencyOverrideDistance = value);
            Add("Bounty", "bounty.encounter.composition.normalWeight", "Normal enemy weight", 0f, 1f, false, false,
                () => encounter.composition.normalWeight,
                value => encounter.composition.normalWeight = value);
            Add("Bounty", "bounty.encounter.composition.fastWeight", "Fast enemy weight", 0f, 1f, false, false,
                () => encounter.composition.fastWeight,
                value => encounter.composition.fastWeight = value);
            Add("Bounty", "bounty.encounter.composition.tankWeight", "Tank enemy weight", 0f, 1f, false, false,
                () => encounter.composition.tankWeight,
                value => encounter.composition.tankWeight = value);

            BountyRewardConfig reward = bounty.reward;
            Add("Bounty", "bounty.reward.cardCount", "Reward card count", 0f, 10f, true, false,
                () => reward.cardCount, value => reward.cardCount = (int)value);
            Add("Bounty", "bounty.reward.cardStarMax", "Reward card star cap", 1f, 4f, true, false,
                () => reward.cardStarMax, value => reward.cardStarMax = (int)value);
            Add("Bounty", "bounty.reward.wildcardCount", "Reward wildcard count", 0f, 10f, true, false,
                () => reward.wildcardCount, value => reward.wildcardCount = (int)value);
            Add("Bounty", "bounty.reward.wildcardStarMax", "Reward wildcard star cap", 1f, 4f, true, false,
                () => reward.wildcardStarMax,
                value => reward.wildcardStarMax = (int)value);
            Add("Bounty", "bounty.reward.dropLifetimeSeconds", "Reward drop lifetime", 0.5f, 60f, false, false,
                () => reward.dropLifetimeSeconds,
                value => reward.dropLifetimeSeconds = value);
            Add("Bounty", "bounty.reward.repeatProtection", "Reward repeat protection", 0f, 10f, true, false,
                () => reward.repeatProtection,
                value => reward.repeatProtection = (int)value);

            BountyRewardBiasConfig bias = bounty.rewardBias;
            Add("Bounty", "bounty.rewardBias.primaryShare", "Primary style share", 0f, 1f, false, false,
                () => bias.primaryShare, value => bias.primaryShare = value);
            Add("Bounty", "bounty.rewardBias.secondaryShare", "Secondary style share", 0f, 0.3f, false, false,
                () => bias.secondaryShare, value => bias.secondaryShare = value);

            BountyVisualConfig visual = bounty.visual;
            Add("Bounty", "bounty.visual.offerRadius", "Offer radius", 8f, 80f, false, false,
                () => visual.offerRadius, value => visual.offerRadius = value);
            Add("Bounty", "bounty.visual.offerEdgeInset", "Offer edge inset", 8f, 160f, false, false,
                () => visual.offerEdgeInset, value => visual.offerEdgeInset = value);
            Add("Bounty", "bounty.visual.enemyGlowRadius", "Enemy glow radius", 0f, 50f, false, false,
                () => visual.enemyGlowRadius, value => visual.enemyGlowRadius = value);
            Add("Bounty", "bounty.visual.enemyPulseSpeed", "Enemy pulse speed", 0f, 12f, false, false,
                () => visual.enemyPulseSpeed, value => visual.enemyPulseSpeed = value);
        }

        private void AddMix(
            string group,
            string keyPrefix,
            string label,
            NormalDropRoleMixConfig mix)
        {
            Add(group, keyPrefix + ".discovery", label + " discovery", 0f, 100f, true, false,
                () => mix.discovery, value => mix.discovery = (int)value);
            Add(group, keyPrefix + ".build", label + " build", 0f, 100f, true, false,
                () => mix.build, value => mix.build = (int)value);
            Add(group, keyPrefix + ".pivot", label + " pivot", 0f, 100f, true, false,
                () => mix.pivot, value => mix.pivot = (int)value);
        }

        private void Add(
            string group,
            string key,
            string label,
            float min,
            float max,
            bool integer,
            bool appliesNextWave,
            Func<float> getter,
            Action<float> setter)
        {
            _parameters.Add(new TuningParameter(
                group,
                key,
                label,
                min,
                max,
                integer,
                appliesNextWave,
                getter,
                setter));
        }
    }
}
