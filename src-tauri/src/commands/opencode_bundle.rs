//! Bundled OpenCode Desktop installer + launch helpers.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};

use crate::core::error::AppError;

const BUNDLED_INSTALLER_REL: &str = "opencode/opencode-desktop-win-x64.exe";

#[derive(Debug, Serialize)]
pub struct OpenCodeBundleStatus {
    pub bundled_installer_present: bool,
    pub bundled_installer_path: Option<String>,
    pub desktop_installed: bool,
    pub desktop_path: Option<String>,
    pub cli_on_path: bool,
}

fn bundled_installer_path(app: &AppHandle) -> Option<PathBuf> {
    let resolver = app.path();
    if let Ok(p) = resolver.resolve(
        BUNDLED_INSTALLER_REL,
        tauri::path::BaseDirectory::Resource,
    ) {
        if p.is_file() {
            return Some(p);
        }
    }
    // Dev / portable fallbacks next to the executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for candidate in [
                dir.join("opencode").join("opencode-desktop-win-x64.exe"),
                dir.join("resources")
                    .join("opencode")
                    .join("opencode-desktop-win-x64.exe"),
                dir.join("../resources/opencode/opencode-desktop-win-x64.exe"),
            ] {
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

fn which_opencode_cli() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let output = Command::new("where").arg("opencode").output().ok()?;
        if !output.status.success() {
            return None;
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let first = stdout.lines().next()?.trim();
        if first.is_empty() {
            return None;
        }
        let p = PathBuf::from(first);
        if p.is_file() {
            return Some(p);
        }
        None
    }
    #[cfg(not(windows))]
    {
        let output = Command::new("which").arg("opencode").output().ok()?;
        if !output.status.success() {
            return None;
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let first = stdout.lines().next()?.trim();
        let p = PathBuf::from(first);
        if p.is_file() {
            Some(p)
        } else {
            None
        }
    }
}

fn find_desktop_exe() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Some(local) = dirs::data_local_dir() {
        // Prefer current productName "OpenCode"; keep legacy "OpenCode Dev" paths.
        candidates.push(local.join("Programs").join("OpenCode").join("OpenCode.exe"));
        candidates.push(
            local
                .join("Programs")
                .join("OpenCode Dev")
                .join("OpenCode Dev.exe"),
        );
        candidates.push(local.join("Programs").join("opencode").join("OpenCode.exe"));
        candidates.push(
            local
                .join("Programs")
                .join("opencode-desktop")
                .join("OpenCode.exe"),
        );
        candidates.push(
            local
                .join("Programs")
                .join("opencode-dev")
                .join("OpenCode.exe"),
        );
        candidates.push(
            local
                .join("Programs")
                .join("opencode-dev")
                .join("OpenCode Dev.exe"),
        );
    }
    if let Some(home) = dirs::home_dir() {
        candidates.push(
            home.join("AppData")
                .join("Local")
                .join("Programs")
                .join("OpenCode")
                .join("OpenCode.exe"),
        );
        candidates.push(
            home.join("AppData")
                .join("Local")
                .join("Programs")
                .join("OpenCode Dev")
                .join("OpenCode Dev.exe"),
        );
        candidates.push(
            home
                .join("scoop")
                .join("apps")
                .join("opencode-desktop")
                .join("current")
                .join("OpenCode.exe"),
        );
    }

    // Custom override from settings file path env (optional)
    if let Ok(custom) = std::env::var("SKILLS_OPENCODE_DESKTOP") {
        candidates.insert(0, PathBuf::from(custom));
    }

    candidates.into_iter().find(|p| p.is_file())
}

fn spawn_detached(path: &Path, args: &[&str]) -> Result<(), AppError> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        const DETACHED_PROCESS: u32 = 0x00000008;
        Command::new(path)
            .args(args)
            .creation_flags(CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS)
            .spawn()
            .map_err(|e| AppError::io(format!("Failed to launch {}: {e}", path.display())))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Command::new(path)
            .args(args)
            .spawn()
            .map_err(|e| AppError::io(format!("Failed to launch {}: {e}", path.display())))?;
        Ok(())
    }
}

#[tauri::command]
pub async fn get_opencode_bundle_status(app: AppHandle) -> Result<OpenCodeBundleStatus, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let bundled = bundled_installer_path(&app);
        let desktop = find_desktop_exe();
        let cli = which_opencode_cli();
        Ok(OpenCodeBundleStatus {
            bundled_installer_present: bundled.is_some(),
            bundled_installer_path: bundled.map(|p| p.display().to_string()),
            desktop_installed: desktop.is_some(),
            desktop_path: desktop.map(|p| p.display().to_string()),
            cli_on_path: cli.is_some(),
        })
    })
    .await
    .map_err(|e| AppError::io(format!("join error: {e}")))?
}

#[tauri::command]
pub async fn install_bundled_opencode(app: AppHandle) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let installer = bundled_installer_path(&app).ok_or_else(|| {
            AppError::not_found(
                "Bundled OpenCode installer not found. Rebuild with scripts/build-opencode-desktop.ps1",
            )
        })?;
        spawn_detached(&installer, &[])?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::io(format!("join error: {e}")))?
}

#[tauri::command]
pub async fn open_opencode_editor(
    app: AppHandle,
    project_path: Option<String>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let args: Vec<String> = project_path
            .filter(|p| !p.trim().is_empty())
            .map(|p| vec![p])
            .unwrap_or_default();
        let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

        if let Some(desktop) = find_desktop_exe() {
            return spawn_detached(&desktop, &arg_refs);
        }
        if let Some(cli) = which_opencode_cli() {
            return spawn_detached(&cli, &arg_refs);
        }
        // Offer bundled installer when editor missing
        if bundled_installer_path(&app).is_some() {
            return Err(AppError::not_found(
                "OpenCode editor not installed. Use install_bundled_opencode first.",
            ));
        }
        Err(AppError::not_found(
            "OpenCode not found. Install OpenCode Desktop or add opencode to PATH.",
        ))
    })
    .await
    .map_err(|e| AppError::io(format!("join error: {e}")))?
}
