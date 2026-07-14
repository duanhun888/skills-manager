/** Canonical business category ids — keep in sync with server / SKILL.md `category`. */
export const SKILL_CATEGORY_IDS = [
  "code-style",
  "project-structure",
  "dev-workflow",
  "testing",
  "product",
  "ui-design",
  "devops",
  "other",
] as const;

export type SkillCategoryId = (typeof SKILL_CATEGORY_IDS)[number];

const CATEGORY_LABEL_KEYS: Record<SkillCategoryId, string> = {
  "code-style": "skillCategories.codeStyle",
  "project-structure": "skillCategories.projectStructure",
  "dev-workflow": "skillCategories.devWorkflow",
  testing: "skillCategories.testing",
  product: "skillCategories.product",
  "ui-design": "skillCategories.uiDesign",
  devops: "skillCategories.devops",
  other: "skillCategories.other",
};

export function isSkillCategoryId(value: string | null | undefined): value is SkillCategoryId {
  return Boolean(value && SKILL_CATEGORY_IDS.includes(value as SkillCategoryId));
}

export function skillCategoryLabelKey(
  category: string | null | undefined
): string | null {
  if (!category || !isSkillCategoryId(category)) return null;
  return CATEGORY_LABEL_KEYS[category];
}

export function countSkillsByCategory<T extends { category?: string | null }>(
  skills: T[]
): Record<"all" | SkillCategoryId, number> {
  const counts: Record<"all" | SkillCategoryId, number> = {
    all: skills.length,
    "code-style": 0,
    "project-structure": 0,
    "dev-workflow": 0,
    testing: 0,
    product: 0,
    "ui-design": 0,
    devops: 0,
    other: 0,
  };
  for (const skill of skills) {
    if (skill.category && isSkillCategoryId(skill.category)) {
      counts[skill.category] += 1;
    }
  }
  return counts;
}

export function countUncategorizedSkills<T extends { category?: string | null }>(
  skills: T[]
): number {
  return skills.filter((skill) => !skill.category || !isSkillCategoryId(skill.category)).length;
}

/** Badge colors for category pills (distinct from scope colors). */
export function skillCategoryBadgeClass(category: string): string {
  switch (category) {
    case "code-style":
      return "border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-300";
    case "project-structure":
      return "border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300";
    case "dev-workflow":
      return "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-300";
    case "testing":
      return "border-lime-500/30 bg-lime-500/10 text-lime-700 dark:text-lime-300";
    case "product":
      return "border-pink-500/30 bg-pink-500/10 text-pink-600 dark:text-pink-300";
    case "ui-design":
      return "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300";
    case "devops":
      return "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300";
    default:
      return "border-border-subtle bg-surface text-tertiary";
  }
}
