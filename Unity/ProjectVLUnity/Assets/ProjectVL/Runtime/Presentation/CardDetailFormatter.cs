using System.Text;
using ProjectVL.Config;
using ProjectVL.Core;

namespace ProjectVL.Presentation
{
    public static class CardDetailFormatter
    {
        public static string Format(CardState card)
        {
            if (card == null)
                return string.Empty;

            CardDefinitionConfig definition =
                CardCatalog.Default.Find(card.Type);
            var text = new StringBuilder();
            text.Append(card.Star)
                .Append("★ ")
                .Append(CardCatalog.Default.DisplayName(card.Type));
            if (card.Provisional)
                text.Append("（待定）");
            text.AppendLine();
            text.Append(GodName(definition?.god))
                .Append(" · ")
                .Append(CategoryName(definition?.category));
            if (definition?.recipeOnly == true)
                text.Append(" · 固定配方终态");
            else if (definition?.consumable == true)
                text.Append(" · 可拖到战场施放");

            if (card.EvolutionPath.Count > 0)
            {
                text.AppendLine().Append("进化：");
                for (int index = 0;
                    index < card.EvolutionPath.Count;
                    index++)
                {
                    if (index > 0)
                        text.Append(" → ");
                    EvolutionOptionTextConfig option =
                        EvolutionTextCatalog.Default.Find(
                            card.EvolutionPath[index]);
                    text.Append(option?.name ?? card.EvolutionPath[index]);
                }
            }

            if (card.Affixes.Count > 0)
            {
                text.AppendLine().Append("词缀：");
                for (int index = 0; index < card.Affixes.Count; index++)
                {
                    if (index > 0)
                        text.Append("；");
                    CardAffixRoll affix = card.Affixes[index];
                    text.Append(AffixName(affix.Stat))
                        .Append(" +")
                        .Append(FormatAffixValue(affix));
                    if (affix.ConsumableDuration > 0f)
                    {
                        text.Append("（")
                            .Append(affix.ConsumableDuration.ToString("0.#"))
                            .Append("秒）");
                    }
                }
            }

            return text.ToString();
        }

        public static string FormatRecipe(EvolutionRecipeConfig recipe)
        {
            if (recipe == null)
                return "固定配方：材料不足";

            return $"{recipe.ingredientA.minStar}★ "
                + $"{CardCatalog.Default.DisplayName(recipe.ingredientA.cardId)}"
                + $" + {recipe.ingredientB.minStar}★ "
                + $"{CardCatalog.Default.DisplayName(recipe.ingredientB.cardId)}"
                + $" → {recipe.outputStar}★ "
                + CardCatalog.Default.DisplayName(recipe.outputCardId);
        }

        public static string GodName(string god)
        {
            switch (god)
            {
                case "storm": return "迅霆";
                case "winter": return "凛冬";
                case "inferno": return "焚狱";
                case "bulwark": return "磐垒";
                case "plenty": return "丰饶";
                default: return "中立";
            }
        }

        private static string CategoryName(string category)
        {
            switch (category)
            {
                case "projectile": return "投射";
                case "control": return "控制";
                case "domain": return "领域";
                case "defense": return "防御";
                case "economy": return "成长";
                default: return "通用";
            }
        }

        private static string AffixName(string stat)
        {
            switch (stat)
            {
                case "damageAdd": return "伤害";
                case "fireRateAdd": return "攻速";
                case "rangeAdd": return "射程";
                case "multiAdd": return "弹道";
                case "maxHpAdd": return "生命上限";
                case "heal": return "治疗";
                case "effectDamageMul": return "效果伤害";
                case "quantityAdd": return "效果数量";
                case "controlPotencyMul": return "控制强度";
                case "controlledDamageTakenMul": return "受控增伤";
                case "areaScaleMul": return "范围";
                case "dotDamageMul": return "持续伤害";
                case "defenseDurabilityMul": return "防御耐久";
                case "retaliationMul": return "反击";
                case "dropRateMul": return "掉率";
                case "dropLifetimeMul": return "掉落时限";
                case "xpMul": return "经验";
                default: return stat;
            }
        }

        private static string FormatAffixValue(CardAffixRoll affix)
        {
            return affix.Stat.EndsWith("Mul")
                ? (affix.Value * 100f).ToString("0.#") + "%"
                : affix.Value.ToString("0.##");
        }
    }
}
