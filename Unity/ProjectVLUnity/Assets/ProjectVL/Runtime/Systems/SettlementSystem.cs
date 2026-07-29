using System;
using System.Collections.Generic;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Systems
{
    public sealed class SettlementSystem
    {
        private readonly SettlementConfig _config;
        private readonly RelicsConfig _relics;
        private readonly int _totalWaves;

        public SettlementSystem(
            ProgressionConfig progression = null,
            RelicsConfig relics = null,
            int totalWaves = 10)
        {
            _config = progression?.settlement ?? new SettlementConfig();
            _relics = relics ?? new RelicsConfig();
            _totalWaves = Math.Max(1, totalWaves);
        }

        public RunSummary Build(GameState state, bool won)
        {
            if (state == null)
            {
                throw new ArgumentNullException(nameof(state));
            }

            int clearedWaves = won
                ? _totalWaves
                : Math.Max(0, state.Wave - 1);
            CardSummary highestCard = null;
            int buildScore = 0;
            ScoreCards(state.Hand, ref highestCard, ref buildScore);
            ScoreCards(state.Equipment, ref highestCard, ref buildScore);
            buildScore *= _config.perEquippedStarSquared;

            int wildcardScore = 0;
            foreach (KeyValuePair<int, int> wildcard in state.Wildcards)
            {
                wildcardScore += Math.Max(0, wildcard.Value)
                    * _config.WildcardValue(wildcard.Key);
            }

            int hpScore = 0;
            if (won && state.MaxHp > 0f)
            {
                float hpRatio = Math.Max(
                    0f,
                    Math.Min(1f, state.Hp / state.MaxHp));
                hpScore = (int)Math.Round(
                    hpRatio * _config.hpRatioBonusMax);
            }

            var score = new RunScore(
                won ? _config.winBonus : 0,
                clearedWaves * _config.perWaveCleared,
                state.Kills * _config.perKill,
                hpScore,
                buildScore,
                wildcardScore);

            int relicStacks = 0;
            int common = 0;
            int rare = 0;
            int epic = 0;
            foreach (KeyValuePair<string, int> relic in state.RelicStacks)
            {
                int count = Math.Max(0, relic.Value);
                relicStacks += count;
                string rarity = RarityFor(relic.Key);
                if (rarity == "rare")
                {
                    rare += count;
                }
                else if (rarity == "epic")
                {
                    epic += count;
                }
                else
                {
                    common += count;
                }
            }

            return new RunSummary(
                won,
                state.Difficulty,
                state.Wave,
                clearedWaves,
                state.Kills,
                state.Level,
                state.Time,
                state.Hp,
                state.MaxHp,
                state.MainGod,
                new List<string>(state.SubGods),
                state.FocusGod,
                state.RelicStacks.Count,
                relicStacks,
                new RelicRaritySummary(common, rare, epic),
                state.Merges,
                new List<string>(state.CompletedRecipes),
                state.TotalBountyOffers,
                state.TotalBountiesAccepted,
                state.TotalBountiesCompleted,
                state.CollectedRewards.Count,
                highestCard,
                score);
        }

        private void ScoreCards(
            CardState[] cards,
            ref CardSummary highestCard,
            ref int starSquared)
        {
            foreach (CardState card in cards)
            {
                if (card == null)
                {
                    continue;
                }

                starSquared += card.Star * card.Star;
                if (highestCard == null || card.Star > highestCard.Star)
                {
                    highestCard = new CardSummary(card.Type, card.Star);
                }
            }
        }

        private string RarityFor(string relicId)
        {
            foreach (RelicConfig relic in _relics.relics)
            {
                if (relic.id == relicId)
                {
                    return relic.rarity;
                }
            }

            return "common";
        }
    }
}
