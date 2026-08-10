/** When personal + org both have the same provider id:
 * - Org keeps the real id (central Skills Manager config wins).
 * - Personal is exposed under `{id}.skills-personal` so users can still switch.
 * Legacy `{id}.skills-shared` aliases (old clients) are still recognized.
 */
export const SKILLS_SHARED_SUFFIX = ".skills-shared"
export const SKILLS_PERSONAL_SUFFIX = ".skills-personal"

export function isSkillsSharedProviderID(id: string): boolean {
  return id.trim().toLowerCase().endsWith(SKILLS_SHARED_SUFFIX)
}

export function isSkillsPersonalProviderID(id: string): boolean {
  return id.trim().toLowerCase().endsWith(SKILLS_PERSONAL_SUFFIX)
}

export function skillsBaseProviderID(id: string): string {
  const normalized = id.trim().toLowerCase()
  if (normalized.endsWith(SKILLS_SHARED_SUFFIX)) {
    return id.trim().slice(0, -SKILLS_SHARED_SUFFIX.length)
  }
  if (normalized.endsWith(SKILLS_PERSONAL_SUFFIX)) {
    return id.trim().slice(0, -SKILLS_PERSONAL_SUFFIX.length)
  }
  return id.trim()
}

export function skillsSharedProviderID(base: string): string {
  return `${base.trim()}${SKILLS_SHARED_SUFFIX}`
}

export function skillsPersonalProviderID(base: string): string {
  return `${base.trim()}${SKILLS_PERSONAL_SUFFIX}`
}
