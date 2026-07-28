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
                }
            }

            return profile;
        }

        private static void ApplyPierce(
            CardState card,
            CardCombatProfile profile)
        {
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

            if (RouteAt(card, 5) == "pierceB2")
            {
                profile.PierceCount += 1;
                profile.PierceDamageRetention = 1f;
                profile.RampPerPierce += 0.25f;
            }
        }

        private static void ApplyChainLightning(
            CardState card,
            CardCombatProfile profile)
        {
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
        }

        private static void ApplyFrost(
            CardState card,
            CardCombatProfile profile)
        {
            string route = RouteAt(card, 3);
            profile.SlowRatio = Max(profile.SlowRatio, 0.3f);
            profile.SlowDuration = Max(profile.SlowDuration, 1.5f);
            profile.FreezeDuration = Max(profile.FreezeDuration, 0.8f);
            profile.FreezeStacksToTrigger =
                route == "frostB" ? 2 : 3;
            if (RouteAt(card, 5) == "frostC2")
            {
                profile.VulnerableRatio =
                    Max(profile.VulnerableRatio, 0.16f);
                profile.VulnerableDuration =
                    Max(profile.VulnerableDuration, 2f);
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
