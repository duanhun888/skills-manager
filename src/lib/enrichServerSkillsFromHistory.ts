import {
  fetchSkillHistory,
  type ServerSkill,
  type ServerSkillUpdater,
} from "./serverApi";
import {
  formatServerSkillRecentUpdaterLabels,
} from "./serverSkillAvatar";

const UPDATE_ACTIONS = new Set([
  "skill.content.upload",
  "skill.update",
  "skill.content.migrate",
]);

function needsHistoryEnrichment(skill: ServerSkill): boolean {
  const needsCreator =
    !skill.creator_username?.trim() &&
    !(skill.scope === "personal" && skill.owner_username?.trim());
  const needsUpdaters = formatServerSkillRecentUpdaterLabels(skill).length === 0;
  return needsCreator || needsUpdaters;
}

/** Fill creator / recent updaters from audit history when list API omits them (older central server). */
export async function enrichServerSkillsFromHistory(
  baseUrl: string,
  token: string,
  skills: ServerSkill[]
): Promise<ServerSkill[]> {
  const targets = skills.filter(needsHistoryEnrichment);
  if (targets.length === 0) return skills;

  const historyBySkillId = new Map<string, Awaited<ReturnType<typeof fetchSkillHistory>>>();
  await Promise.all(
    targets.map(async (skill) => {
      try {
        const history = await fetchSkillHistory(baseUrl, token, skill.id);
        historyBySkillId.set(skill.id, history);
      } catch {
        historyBySkillId.set(skill.id, []);
      }
    })
  );

  return skills.map((skill) => {
    const history = historyBySkillId.get(skill.id);
    if (!history) return skill;

    let creator_username = skill.creator_username ?? null;
    let creator_display_name = skill.creator_display_name ?? null;
    if (!creator_username?.trim()) {
      const created = history.find((entry) => entry.action === "skill.create");
      if (created?.username) {
        creator_username = created.username;
        creator_display_name = created.display_name;
      }
    }

    let recent_updaters: ServerSkillUpdater[] = skill.recent_updaters ?? [];
    if (recent_updaters.length === 0) {
      recent_updaters = history
        .filter((entry) => UPDATE_ACTIONS.has(entry.action))
        .slice(0, 2)
        .map((entry) => ({
          username: entry.username,
          display_name: entry.display_name,
          action: entry.action,
          created_at: entry.created_at,
        }));
    }

    if (
      creator_username === skill.creator_username &&
      creator_display_name === skill.creator_display_name &&
      recent_updaters === skill.recent_updaters
    ) {
      return skill;
    }

    return {
      ...skill,
      creator_username,
      creator_display_name,
      recent_updaters,
    };
  });
}
