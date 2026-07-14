import { writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager";
import { isSkillCategoryId } from "./skillCategories";

export interface UnsetCategoryExportRow {
  name: string;
  scope: string;
  source: string;
  identifier: string;
  description?: string | null;
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function isUncategorizedCategory(category: string | null | undefined): boolean {
  return !category || !isSkillCategoryId(category);
}

export function buildUnsetCategoryCsv(rows: UnsetCategoryExportRow[]): string {
  const header = ["name", "scope", "source", "category", "identifier", "description"];
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        escapeCsvCell(row.name),
        escapeCsvCell(row.scope),
        escapeCsvCell(row.source),
        "",
        escapeCsvCell(row.identifier),
        escapeCsvCell(row.description?.trim() ?? ""),
      ].join(",")
    ),
  ];
  return `\uFEFF${lines.join("\n")}`;
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await clipboardWriteText(text);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}

export async function exportUnsetCategoryReport(
  rows: UnsetCategoryExportRow[],
  filename: string
): Promise<"downloaded" | "clipboard" | "empty"> {
  if (rows.length === 0) return "empty";
  const csv = buildUnsetCategoryCsv(rows);
  downloadTextFile(filename, csv);
  const copied = await copyTextToClipboard(csv);
  return copied ? "clipboard" : "downloaded";
}
