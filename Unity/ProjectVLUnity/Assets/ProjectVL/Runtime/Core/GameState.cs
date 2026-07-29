using System;
using System.Collections.Generic;
using ProjectVL.Config;
using ProjectVL.Systems;

namespace ProjectVL.Core
{
    public sealed class GameState
    {
        public GameMode Mode { get; private set; }
        public bool Paused { get; private set; }
        public bool DecisionLocked { get; private set; }
        public bool IntermissionActive { get; internal set; }
        public float Time { get; private set; }
        public float Hp { get; private set; }
        public float BaseMaxHp { get; private set; }
        public float MaxHp { get; private set; }
        public int Wave { get; private set; }
        public DifficultyId Difficulty { get; private set; } =
            DifficultyId.Standard;
        public bool? Won { get; private set; }
        public WavePhase WavePhase { get; internal set; } = WavePhase.Regular;
        public int? BossId { get; internal set; }
        public int LastSpawnCheckCount { get; internal set; }
        public RunReward PendingBossReward { get; internal set; }
        public List<RunReward> CollectedRewards { get; } = new List<RunReward>();
        public CardState[] Hand { get; }
        public CardState[] Equipment { get; }
        public Dictionary<int, int> Wildcards { get; } =
            new Dictionary<int, int>();
        public int ConsumedCards { get; internal set; }
        public int Merges { get; internal set; }
        public EvolutionChoice PendingEvolution { get; internal set; }
        public List<string> CompletedRecipes { get; } = new List<string>();
        public int EquipmentEffectWave { get; internal set; }
        public int ShieldHits { get; internal set; }
        public int ShieldMaxHits { get; internal set; }
        public float ShieldRegenRemaining { get; internal set; }
        public float FireRateMultiplier { get; internal set; } = 1f;
        public float FireRateBuffRemaining { get; internal set; }
        public float ImpactBreachCooldownRemaining { get; internal set; }
        public float ImpactPulseRemaining { get; internal set; }
        public float AvalanchePulseRemaining { get; internal set; }
        public float PyrestormPulseRemaining { get; internal set; }
        public float ImpactHitCooldownRemaining { get; internal set; }
        public float ThornsAuraTickRemaining { get; internal set; }
        public float BeamPulseRemaining { get; internal set; }
        public float ChainPulseRemaining { get; internal set; }
        public float FrostNovaRemaining { get; internal set; }
        public float ScorchAuraTickRemaining { get; internal set; }
        public float SanctumPulseRemaining { get; internal set; }
        public float BeamVisualRemaining { get; internal set; }
        public Float2 BeamVisualStart { get; internal set; }
        public Float2 BeamVisualEnd { get; internal set; }
        public float BeamVisualWidth { get; internal set; }
        public float DropRateMultiplier { get; internal set; } = 1f;
        public float DropLifetimeMultiplier { get; internal set; } = 1f;
        public float ExpiryConvertRatio { get; internal set; }
        public float XpMultiplier { get; internal set; } = 1f;
        public float KillXpBuffMultiplier { get; internal set; } = 1f;
        public float KillXpBuffRemaining { get; internal set; }
        public int KillXpBuffStacks { get; internal set; }
        public float Experience { get; private set; }
        public float ExperienceFloor { get; private set; }
        public float ExperienceNeeded { get; private set; } = 10f;
        public int Level { get; private set; } = 1;
        public float XpGainBonus { get; internal set; }
        public string MainGod { get; internal set; }
        public List<string> SubGods { get; } = new List<string>();
        public string FocusGod { get; internal set; }
        public Dictionary<string, List<string>> RosterByGod { get; } =
            new Dictionary<string, List<string>>();
        public List<string> RunRoster { get; } = new List<string>();
        public List<string> ActiveCardPool { get; } = new List<string>();
        public List<string> PreviousActiveCardPool { get; } =
            new List<string>();
        public List<string> ActiveCardPoolHistory { get; } =
            new List<string>();
        public int ActiveCardPoolWave { get; internal set; }
        public List<string> BootstrapCardQueue { get; } =
            new List<string>();
        public int BootstrapDropsRemaining { get; internal set; }
        public GodChoice PendingGodChoice { get; private set; }
        public int LastGodDecisionAfterWave { get; internal set; } = -1;
        public Dictionary<string, int> RelicStacks { get; } =
            new Dictionary<string, int>();
        public Dictionary<string, int> GodAffinity { get; } =
            new Dictionary<string, int>();
        public Dictionary<string, float> RelicScaling { get; } =
            new Dictionary<string, float>();
        public LevelUpgradeChoice PendingLevelUpgrade =>
            _pendingLevelUpgrades.Count > 0
                ? _pendingLevelUpgrades[0]
                : null;
        public int PendingLevelUpgradeCount => _pendingLevelUpgrades.Count;
        internal LevelUpgradeChoice LevelUpgradeAt(int index)
        {
            return index >= 0 && index < _pendingLevelUpgrades.Count
                ? _pendingLevelUpgrades[index]
                : null;
        }

        public Dictionary<string, int> UpgradeStacks { get; } =
            new Dictionary<string, int>();
        public IEnumerable<string> SelectedGodIds
        {
            get
            {
                if (!string.IsNullOrEmpty(MainGod))
                {
                    yield return MainGod;
                }

                foreach (string god in SubGods)
                {
                    yield return god;
                }
            }
        }
        public int ExpiredDropsConverted { get; internal set; }
        public int HarvestProcessedMergeStars { get; internal set; }
        public int MergeResultStarTotal { get; internal set; }
        public bool DecoyActive { get; internal set; }
        public Float2 DecoyPosition { get; internal set; }
        public float DecoyHp { get; internal set; }
        public float DecoyMaxHp { get; internal set; }
        public float DecoyTauntRadius { get; internal set; }
        public float DecoyExplodeDamageMultiplier { get; internal set; }
        public float DecoyExplodeKnockback { get; internal set; }
        public int DecoyRespawnsRemaining { get; internal set; }
        public bool SecondaryDecoyActive { get; internal set; }
        public Float2 SecondaryDecoyPosition { get; internal set; }
        public float SecondaryDecoyHp { get; internal set; }
        public bool DecoyIsMirrorTurret { get; internal set; }
        public float DecoyFireCooldown { get; internal set; }
        public float DecoyLifeRemaining { get; internal set; }
        public float DecoyDamageRatio { get; internal set; }
        public float DecoyFireInterval { get; internal set; }
        public float DecoyFireRangeRatio { get; internal set; }
        public float IntermissionRemaining { get; internal set; }
        public bool IntermissionReady { get; internal set; }
        public float ShotCooldown { get; set; }
        public float TurretAngleRadians { get; set; }
        public int SpawnLeft { get; internal set; }
        public float SpawnTimer { get; internal set; }
        public int Kills { get; internal set; }
        public List<EnemyState> Enemies { get; } = new List<EnemyState>();
        public List<BulletState> Bullets { get; } = new List<BulletState>();
        public List<GroundDropState> GroundDrops { get; } =
            new List<GroundDropState>();
        public List<GroundZoneState> GroundZones { get; } =
            new List<GroundZoneState>();

        private int _nextEnemyId = 1;
        private int _nextBulletId = 1;
        private int _nextDropId = 1;
        private int _nextCardId = 1;
        private CardInventorySystem _inventory;
        private readonly List<LevelUpgradeChoice> _pendingLevelUpgrades =
            new List<LevelUpgradeChoice>();

        public bool CanAdvance =>
            Mode == GameMode.Playing
            && !Paused
            && !DecisionLocked;

        public bool CanAdvanceCombat => CanAdvance && !IntermissionActive;

        internal GameState(float maxHp, EconomyConfig economy)
        {
            if (economy == null)
            {
                throw new ArgumentNullException(nameof(economy));
            }

            Mode = GameMode.Ready;
            Hp = maxHp;
            BaseMaxHp = maxHp;
            MaxHp = maxHp;
            TurretAngleRadians = -(float)Math.PI / 2f;
            Hand = new CardState[economy.handSlots];
            Equipment = new CardState[economy.equipSlots];
            for (int star = 1; star <= economy.maxStar; star++)
            {
                Wildcards[star] = 0;
            }
        }

        internal void AttachInventory(CardInventorySystem inventory)
        {
            _inventory = inventory;
        }

        public CardState CreateCard(string type, int star)
        {
            return new CardState(_nextCardId++, type, star);
        }

        public void StartRun()
        {
            if (Mode != GameMode.Ready)
            {
                throw new InvalidOperationException("Only a ready game can be started.");
            }

            Mode = GameMode.Playing;
        }

        public void SelectDifficulty(DifficultyId difficulty)
        {
            if (Mode == GameMode.Ready)
            {
                Difficulty = difficulty;
            }
        }

        public void SetPaused(bool paused)
        {
            Paused = Mode == GameMode.Playing && paused;
        }

        public void SetDecisionLocked(bool locked)
        {
            DecisionLocked = locked;
        }

        public void SetIntermission(bool active)
        {
            IntermissionActive = active;
        }

        public void BeginWave(int wave)
        {
            if (wave < 1)
            {
                throw new ArgumentOutOfRangeException(nameof(wave));
            }

            Wave = wave;
            IntermissionActive = false;
            WavePhase = WavePhase.Regular;
            BossId = null;
            LastSpawnCheckCount = 0;
            PendingBossReward = null;
            IntermissionRemaining = 0f;
            IntermissionReady = false;
        }

        public void EndRun(bool won = false)
        {
            Mode = GameMode.Ended;
            Paused = false;
            Won = won;
        }

        internal int TakeNextEnemyId()
        {
            return _nextEnemyId++;
        }

        internal int TakeNextBulletId()
        {
            return _nextBulletId++;
        }

        internal int TakeNextDropId()
        {
            return _nextDropId++;
        }

        internal void ApplyDamage(float damage)
        {
            Hp = Math.Max(0f, Hp - Math.Max(0f, damage));
            if (Hp <= 0f)
            {
                EndRun(false);
            }
        }

        internal void RestoreHp(float amount)
        {
            Hp = Math.Min(MaxHp, Hp + Math.Max(0f, amount));
        }

        internal void AddExperience(float amount)
        {
            Experience += Math.Max(0f, amount);
        }

        internal void AdvanceLevel(float nextExperienceNeeded)
        {
            ExperienceFloor = ExperienceNeeded;
            Level++;
            ExperienceNeeded = Math.Max(ExperienceNeeded, nextExperienceNeeded);
        }

        internal void EnqueueLevelUpgrade(LevelUpgradeChoice choice)
        {
            if (choice == null)
            {
                return;
            }

            _pendingLevelUpgrades.Add(choice);
            DecisionLocked = true;
        }

        internal void CompleteLevelUpgrade()
        {
            if (_pendingLevelUpgrades.Count > 0)
            {
                _pendingLevelUpgrades.RemoveAt(0);
            }

            RefreshDecisionLock();
        }

        internal void SetGodChoice(GodChoice choice)
        {
            PendingGodChoice = choice;
            if (choice != null)
            {
                DecisionLocked = true;
            }
        }

        internal void CompleteGodChoice()
        {
            PendingGodChoice = null;
            RefreshDecisionLock();
        }

        internal void RecordRelic(RelicConfig relic)
        {
            if (relic == null || string.IsNullOrEmpty(relic.id))
            {
                return;
            }

            RelicStacks[relic.id] = RelicStacks.TryGetValue(
                relic.id,
                out int relicCount)
                ? relicCount + 1
                : 1;
            UpgradeStacks[relic.id] = UpgradeStacks.TryGetValue(
                relic.id,
                out int count)
                ? count + 1
                : 1;
            if (!string.IsNullOrEmpty(relic.god))
            {
                GodAffinity[relic.god] = GodAffinity.TryGetValue(
                    relic.god,
                    out int affinity)
                    ? affinity + 1
                    : 1;
            }

            foreach (RelicEffectConfig effect in relic.effects)
            {
                foreach (string tag in effect.targetTags)
                {
                    string key = tag + ":" + effect.axis;
                    RelicScaling[key] = RelicScaling.TryGetValue(
                        key,
                        out float value)
                        ? value + effect.value
                        : effect.value;
                }
            }
        }

        internal void RefreshDecisionLock()
        {
            DecisionLocked = _pendingLevelUpgrades.Count > 0
                || PendingGodChoice != null
                || PendingEvolution != null
                || PendingBossReward != null;
        }

        internal void GrantReward(RunReward reward)
        {
            TryGrantReward(reward);
        }

        internal bool TryGrantReward(RunReward reward)
        {
            if (reward == null || _inventory == null)
            {
                return false;
            }

            bool granted = _inventory.GrantReward(this, reward);
            if (granted)
            {
                CollectedRewards.Add(reward);
            }

            return granted;
        }

        internal bool TryGrantCard(string type, int star)
        {
            if (_inventory == null
                || !_inventory.AddCard(this, type, star))
            {
                return false;
            }

            CollectedRewards.Add(
                new RunReward(RewardKind.Card, star, 1, type));
            return true;
        }

        internal void AdvanceTime(float deltaTime)
        {
            Time += deltaTime;
        }
    }

    public sealed class GroundZoneState
    {
        public Float2 Position { get; }
        public float Radius { get; }
        public float LifeRemaining { get; set; }
        public float TickInterval { get; }
        public float TickRemaining { get; set; }
        public float DamagePerTick { get; }
        public float VulnerableRatio { get; }
        public float VulnerableDuration { get; }
        public float SlowRatio { get; }
        public float SlowDuration { get; }
        public float ExecuteThresholdRatio { get; }
        public float FocusPriorityWeight { get; }

        public GroundZoneState(
            Float2 position,
            float radius,
            float duration,
            float tickInterval,
            float damagePerTick,
            float vulnerableRatio,
            float vulnerableDuration,
            float slowRatio = 0f,
            float slowDuration = 0f,
            float executeThresholdRatio = 0f,
            float focusPriorityWeight = 1f)
        {
            Position = position;
            Radius = radius;
            LifeRemaining = duration;
            TickInterval = tickInterval;
            TickRemaining = tickInterval;
            DamagePerTick = damagePerTick;
            VulnerableRatio = vulnerableRatio;
            VulnerableDuration = vulnerableDuration;
            SlowRatio = slowRatio;
            SlowDuration = slowDuration;
            ExecuteThresholdRatio = executeThresholdRatio;
            FocusPriorityWeight = focusPriorityWeight;
        }
    }
}
