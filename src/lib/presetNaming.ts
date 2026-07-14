const BUILTIN_PRESET_NAMES = new Set(["default"]);

/** Names like "11" or "a" that are hard to recognize in the sidebar. */
export function isWeakPresetName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (BUILTIN_PRESET_NAMES.has(trimmed.toLowerCase())) return false;
  if (/^\d+$/.test(trimmed)) return true;
  if (/^[a-zA-Z0-9]$/.test(trimmed)) return true;
  return false;
}

export function findWeakPresetNames(presets: { name: string }[]): string[] {
  return presets.filter((preset) => isWeakPresetName(preset.name)).map((preset) => preset.name);
}
