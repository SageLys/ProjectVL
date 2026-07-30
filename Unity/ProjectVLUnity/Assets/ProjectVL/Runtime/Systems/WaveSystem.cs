using System;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class WaveSystem
    {
        private readonly WavesConfig _waves;
        private readonly EnemyFactory _enemyFactory;
        private readonly WavePlanResolver _planResolver;
        private readonly GodPoolSystem _godPool;
        private readonly CardPoolSystem _cardPool;
        private readonly BountySystem _bounties;
        private readonly WaveRewardSystem _waveRewards;
        private ResolvedWavePlan _activePlan;

        public WaveSystem(
            WavesConfig waves,
            EnemyFactory enemyFactory,
            GodPoolSystem godPool = null,
            CardPoolSystem cardPool = null,
            BountySystem bounties = null,
            WaveRewardSystem waveRewards = null)
        {
            _waves = waves;
            _enemyFactory = enemyFactory;
            _godPool = godPool;
            _cardPool = cardPool;
            _bounties = bounties;
            _waveRewards = waveRewards;
            _planResolver = new WavePlanResolver(waves);
        }

        public void StartNextWave(GameState state)
        {
            int nextWave = state.Wave + 1;
            if (nextWave > _waves.totalWaves)
            {
                state.EndRun(true);
                return;
            }

            state.BeginWave(nextWave);
            _cardPool?.GenerateActivePool(state, nextWave);
            _activePlan = _planResolver.Resolve(nextWave);
            state.SpawnLeft = _activePlan.Quota;
            state.WaveSpawnQuota = _activePlan.Quota;
            state.SpawnTimer = _waves.firstSpawnDelay;
            _bounties?.OnWaveStarted(state);

            if (_activePlan.Validation != null)
            {
                foreach (ValidationEnemyConfig validation
                    in _activePlan.Validation.enemies)
                {
                    _enemyFactory.SpawnValidationElite(state, validation);
                }
            }
        }

        public void Step(GameState state, float deltaTime)
        {
            if (state.WavePhase == WavePhase.Intermission)
            {
                TickIntermission(state, deltaTime);
                return;
            }

            if (state.WavePhase == WavePhase.BossReward)
            {
                return;
            }

            if (state.WavePhase == WavePhase.Boss)
            {
                if (state.BossId.HasValue
                    && !state.Enemies.Exists(enemy => enemy.Id == state.BossId.Value))
                {
                    OfferBossReward(state);
                }

                return;
            }

            if (state.SpawnLeft > 0)
            {
                state.SpawnTimer -= deltaTime;
                if (state.SpawnTimer <= 0f)
                {
                    int alive = state.Enemies.FindAll(
                        enemy => enemy.SpawnKind == EnemySpawnKind.Regular).Count;
                    BudgetAdmission admission = BudgetAdmission.Calculate(
                        _activePlan,
                        state.SpawnLeft,
                        alive);
                    for (int index = 0; index < admission.SpawnCount; index++)
                    {
                        _enemyFactory.SpawnRegular(state);
                        state.SpawnLeft--;
                    }

                    state.LastSpawnCheckCount = admission.SpawnCount;
                    state.SpawnTimer = _activePlan.CheckInterval;
                }
            }

            bool hasRegularEnemy = state.Enemies.Exists(
                enemy => enemy.SpawnKind == EnemySpawnKind.Regular
                    || enemy.SpawnKind == EnemySpawnKind.Bounty
                    || enemy.SpawnKind == EnemySpawnKind.ValidationElite);
            if (state.SpawnLeft == 0
                && !hasRegularEnemy
                && !(_bounties?.HasBlockingEncounter(state) ?? false))
            {
                _bounties?.ClearOffers(state);
                if (IsBossWave(state.Wave))
                {
                    EnemyState boss = _enemyFactory.SpawnWaveBoss(state);
                    state.WavePhase = WavePhase.Boss;
                    state.BossId = boss.Id;
                }
                else if (state.Wave >= _waves.totalWaves)
                {
                    state.EndRun(true);
                }
                else
                {
                    BeginIntermission(state);
                }
            }
        }

        public int EnemyCountFor(int wave)
        {
            return _waves.enemyCountBase + wave * _waves.enemyCountPerWave;
        }

        private bool IsBossWave(int wave)
        {
            return Array.IndexOf(_waves.bossWaves, wave) >= 0;
        }

        public RunReward ComputeBossReward(int wave)
        {
            ResolvedWavePlan plan = _planResolver.Resolve(wave);
            if (plan.Validation?.bossReward != null)
            {
                return EnemyFactory.ToRunReward(plan.Validation.bossReward);
            }

            RunStage stage = plan.Stage;
            int[] schedule = stage == RunStage.Selection
                ? _waves.waveBoss.reward.schedule.selection
                : stage == RunStage.Build
                    ? _waves.waveBoss.reward.schedule.build
                    : _waves.waveBoss.reward.schedule.validation;
            int stageIndex = StageWaveIndex(wave, stage);
            int star = schedule.Length == 0
                ? 1
                : schedule[Math.Min(schedule.Length - 1, stageIndex)];
            return new RunReward(
                RewardKind.Wildcard,
                star,
                _waves.waveBoss.reward.count);
        }

        public void ClaimBossReward(GameState state)
        {
            if (state.WavePhase != WavePhase.BossReward
                || state.PendingBossReward == null)
            {
                return;
            }

            state.GrantReward(state.PendingBossReward);
            state.PendingBossReward = null;
            state.RefreshDecisionLock();

            if (state.Wave >= _waves.totalWaves)
            {
                state.EndRun(true);
                return;
            }

            BeginIntermission(state);
        }

        public void ConfirmIntermissionReady(GameState state)
        {
            if (state.IntermissionActive
                && state.PendingGodChoice == null
                && state.PendingWaveReward == null)
            {
                state.IntermissionReady = true;
            }
        }

        public bool ChooseWaveReward(GameState state, int optionIndex)
        {
            return _waveRewards != null
                && _waveRewards.Choose(state, optionIndex);
        }

        public void JumpToWave(GameState state, int targetWave)
        {
            if (state == null)
            {
                throw new ArgumentNullException(nameof(state));
            }

            int wave = Math.Max(
                1,
                Math.Min(_waves.totalWaves, targetWave));
            state.PrepareWaveJump(wave);
            StartNextWave(state);
        }

        public void RestartWave(GameState state)
        {
            if (state == null)
            {
                throw new ArgumentNullException(nameof(state));
            }

            JumpToWave(state, Math.Max(1, state.Wave));
        }

        private void OfferBossReward(GameState state)
        {
            state.PendingBossReward = ComputeBossReward(state.Wave);
            state.WavePhase = WavePhase.BossReward;
            state.SetDecisionLocked(true);
        }

        private void BeginIntermission(GameState state)
        {
            state.Bullets.Clear();
            _bounties?.ClearOffers(state);
            state.LastFloorRewards.Clear();
            _waveRewards?.GrantFloorRewards(state, state.Wave);
            state.IntermissionActive = true;
            state.IntermissionReady = false;
            state.IntermissionRemaining = _waves.intermission.settleSeconds
                + FreeSecondsFor(state.Wave);
            state.WavePhase = WavePhase.Intermission;
            _godPool?.OfferForAfterWave(state, state.Wave);
        }

        private void TickIntermission(GameState state, float deltaTime)
        {
            if (state.PendingGodChoice != null
                || state.PendingWaveReward != null)
            {
                return;
            }

            if (_waveRewards != null
                && state.WaveChoiceOfferedWave < state.Wave
                && _waveRewards.OfferChoice(state, state.Wave))
            {
                return;
            }

            state.IntermissionRemaining = Math.Max(
                0f,
                state.IntermissionRemaining - deltaTime);
            if (!state.IntermissionReady && state.IntermissionRemaining > 0f)
            {
                return;
            }

            state.IntermissionActive = false;
            state.IntermissionReady = false;
            state.IntermissionRemaining = 0f;
            StartNextWave(state);
        }

        private float FreeSecondsFor(int afterWave)
        {
            RunStage stage = _planResolver.StageForWave(afterWave);
            if (stage == RunStage.Selection)
            {
                return _waves.intermission.freeSeconds.selection;
            }

            if (stage == RunStage.Validation)
            {
                return _waves.intermission.freeSeconds.validation;
            }

            return afterWave <= _waves.stagePlan.selectionWaves + 3
                ? _waves.intermission.freeSeconds.buildEarly
                : _waves.intermission.freeSeconds.buildLate;
        }

        private int StageWaveIndex(int wave, RunStage stage)
        {
            if (stage == RunStage.Selection)
            {
                return Math.Max(0, wave - 1);
            }

            if (stage == RunStage.Build)
            {
                return Math.Max(0, wave - _waves.stagePlan.selectionWaves - 1);
            }

            return Math.Max(
                0,
                wave - (_waves.totalWaves - _waves.stagePlan.validationWaves + 1));
        }
    }
}
