/** When personal + org both have the same provider id, org auth is exposed under this suffix. */
export const SKILLS_SHARED_SUFFIX = ".skills-shared"

export function isSkillsSharedProviderID(id: string): boolean {
  return id.trim().toLowerCase().endsWith(SKILLS_SHARED_SUFFIX)
}

export function skillsBaseProviderID(id: string): string {
  const normalized = id.trim().toLowerCase()
  if (!normalized.endsWith(SKILLS_SHARED_SUFFIX)) return id.trim()
  return id.trim().slice(0, -SKILLS_SHARED_SUFFIX.length)
}

export function skillsSharedProviderID(base: string): string {
  return `${base.trim()}${SKILLS_SHARED_SUFFIX}`
}
