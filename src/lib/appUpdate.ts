import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { openUrl } from "@tauri-apps/plugin-opener";
import { terminateOpenCodeEditors } from "./tauri";

export const APP_RELEASES_URL =
  "https://github.com/duanhun888/skills-manager/releases/latest";

/** Returns an update object when a newer signed release is available. */
export async function checkAppUpdate(): Promise<Update | null> {
  return check();
}

export async function installAppUpdateAndRelaunch(update: Update): Promise<void> {
  // OpenCode is a separate process; leave it running and Skills "relaunch"
  // alone keeps the old OpenCode session (stale policy / old UI) until quit.
  try {
    await terminateOpenCodeEditors();
  } catch {
    // Best-effort — continue with Skills update even if kill fails.
  }
  await update.downloadAndInstall();
  await relaunch();
}

export async function openAppDownloadPage(): Promise<void> {
  await openUrl(APP_RELEASES_URL);
}
