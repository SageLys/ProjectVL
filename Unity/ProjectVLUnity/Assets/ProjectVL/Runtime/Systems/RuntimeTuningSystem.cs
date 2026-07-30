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
            BountyConfig bounty)
        {
            if (combat == null) throw new ArgumentNullException(nameof(combat));
            if (enemies == null) throw new ArgumentNullException(nameof(enemies));
            if (waves == null) throw new ArgumentNullException(nameof(waves));
            if (economy == null) throw new ArgumentNullException(nameof(economy));
            _bounty = bounty ?? throw new ArgumentNullException(nameof(bounty));
            _bountyBaseline = bounty.enabled;

            Add("Combat", "combat.damage", "Damage", 1f, 100f, false, false,
                () => combat.defaults.damage, value => combat.defaults.damage = value);
            Add("Combat", "combat.fireRate", "Fire rate", 0.5f, 20f, false, false,
                () => combat.defaults.fireRate, value => combat.defaults.fireRate = value);
            Add("Combat", "combat.range", "Range", 50f, 350f, false, false,
                () => combat.defaults.range, value => combat.defaults.range = value);
            Add("Combat", "combat.bulletSpeed", "Bullet speed", 100f, 900f, false, false,
                () => combat.bullet.speed, value => combat.bullet.speed = value);

            Add("Enemies", "enemies.globalSpeed", "Global speed", 0.1f, 3f, false, false,
                () => enemies.defaults.enemySpeed, value => enemies.defaults.enemySpeed = value);
            AddEnemy("Enemies", "Normal", enemies.types.normal);
            AddEnemy("Enemies", "Fast", enemies.types.fast);
            AddEnemy("Enemies", "Tank", enemies.types.tank);
            AddEnemy("Enemies", "Boss", enemies.types.boss);

            AddStage("Waves", "Selection", waves.stagePlan.selection);
            AddStage("Waves", "Build", waves.stagePlan.build);

            Add("Economy", "economy.dropChance", "Drop chance", 0f, 1f, false, false,
                () => economy.defaults.dropChance, value => economy.defaults.dropChance = value);
            Add("Economy", "economy.dropLifetime", "Drop lifetime", 1f, 30f, false, false,
                () => economy.defaults.dropLifetime, value => economy.defaults.dropLifetime = value);
            Add("Economy", "economy.pickupRadius", "Pickup radius", 10f, 120f, false, false,
                () => economy.drops.pickupRadius, value => economy.drops.pickupRadius = value);

            Add("Bounty", "bounty.offerChance", "Offer chance", 0f, 1f, false, false,
                () => bounty.offer.baseChancePerCheck,
                value => bounty.offer.baseChancePerCheck = value);
            Add("Bounty", "bounty.offerChanceMax", "Offer chance max", 0f, 1f, false, false,
                () => bounty.offer.maxChancePerCheck,
                value => bounty.offer.maxChancePerCheck = value);
            Add("Bounty", "bounty.enemyCount", "Enemy count", 1f, 15f, true, false,
                () => bounty.encounter.enemyCountBase,
                value => bounty.encounter.enemyCountBase = (int)value);
            Add("Bounty", "bounty.enemyHpMul", "Enemy HP multiplier", 0.5f, 4f, false, false,
                () => bounty.encounter.hpMul, value => bounty.encounter.hpMul = value);
            Add("Bounty", "bounty.enemyDamageMul", "Enemy damage multiplier", 0.5f, 4f, false, false,
                () => bounty.encounter.damageMul, value => bounty.encounter.damageMul = value);
            Add("Bounty", "bounty.rewardLifetime", "Reward lifetime", 2f, 30f, false, false,
                () => bounty.reward.dropLifetimeSeconds,
                value => bounty.reward.dropLifetimeSeconds = value);
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
            string keyPrefix = "enemies." + prefix.ToLowerInvariant();
            Add(group, keyPrefix + ".hp", prefix + " HP", 1f, 3000f, false, false,
                () => enemy.hpBase, value => enemy.hpBase = value);
            Add(group, keyPrefix + ".damage", prefix + " damage", 0f, 100f, false, false,
                () => enemy.damage, value => enemy.damage = value);
        }

        private void AddStage(
            string group,
            string prefix,
            RegularStageConfig stage)
        {
            string keyPrefix = "waves." + prefix.ToLowerInvariant();
            Add(group, keyPrefix + ".quotaStart", prefix + " quota start", 1f, 300f, false, true,
                () => stage.waveQuota.start, value => stage.waveQuota.start = value);
            Add(group, keyPrefix + ".quotaEnd", prefix + " quota end", 1f, 500f, false, true,
                () => stage.waveQuota.end, value => stage.waveQuota.end = value);
            Add(group, keyPrefix + ".targetStart", prefix + " target start", 1f, 100f, false, true,
                () => stage.targetOnScreen.start,
                value => stage.targetOnScreen.start = value);
            Add(group, keyPrefix + ".targetEnd", prefix + " target end", 1f, 150f, false, true,
                () => stage.targetOnScreen.end,
                value => stage.targetOnScreen.end = value);
            Add(group, keyPrefix + ".maxAlive", prefix + " max alive", 1f, 200f, true, true,
                () => stage.maxAlive, value => stage.maxAlive = (int)value);
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
