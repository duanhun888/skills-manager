//! Bundled OpenCode Desktop installer + launch helpers.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};

use crate::core::error::AppError;

const BUNDLED_INSTALLER_REL: &str = "opencode/opencode-desktop-win-x64.exe";
const BUNDLED_VERSION_REL: &str = "opencode/EXPECTED_VERSION.txt";
const BUNDLED_VERSION_META_REL: &str = "opencode/VERSION.txt";

#[derive(Debug, Serialize)]
pub struct OpenCodeBundleStatus {
    pub bundled_installer_present: bool,
    pub bundled_installer_path: Option<String>,
    pub desktop_installed: bool,
    pub desktop_path: Option<String>,
    pub cli_on_path: bool,
    /// Version Skills expects (from OPENCODE_VERSION / bundled EXPECTED_VERSION.txt)
    pub expected_version: Option<String>,
    /// Installed OpenCode Desktop product/file version, if detectable
    pub installed_version: Option<String>,
    /// true when both sides known and normalize-equal; null/None when unknown
    pub version_match: Option<bool>,
}

fn resolve_resource(app: &AppHandle, rel: &str) -> Option<PathBuf> {
    let resolver = app.path();
    if let Ok(p) = resolver.resolve(rel, tauri::path::BaseDirectory::Resource) {
        if p.is_file() {
            return Some(p);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for candidate in [
                dir.join(rel),
                dir.join("resources").join(rel),
                dir.join("../resources").join(rel),
            ] {
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

fn bundled_installer_path(app: &AppHandle) -> Option<PathBuf> {
    resolve_resource(app, BUNDLED_INSTALLER_REL).or_else(|| {
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
    })
}

fn normalize_version(raw: &str) -> String {
    let s = raw.trim().trim_start_matches(['v', 'V']);
    // Take digit.digit... prefix; drop trailing .0 build parts beyond 3 segments if needed later
    let mut parts: Vec<&str> = s
        .split(|c: char| !c.is_ascii_digit() && c != '.')
        .next()
        .unwrap_or(s)
        .split('.')
        .filter(|p| !p.is_empty())
        .collect();
    while parts.len() > 3 && parts.last() == Some(&"0") {
        parts.pop();
    }
    parts.join(".")
}

fn versions_equal(a: &str, b: &str) -> bool {
    normalize_version(a) == normalize_version(b)
}

fn read_expected_version(app: &AppHandle) -> Option<String> {
    // 1) resources/opencode/EXPECTED_VERSION.txt (written by build script)
    if let Some(p) = resolve_resource(app, BUNDLED_VERSION_REL) {
        if let Ok(text) = std::fs::read_to_string(&p) {
            let v = text.trim();
            if !v.is_empty() {
                return Some(normalize_version(v));
            }
        }
    }
    // 2) VERSION.txt pin format: source/1.18.4/dev/win-x64
    if let Some(p) = resolve_resource(app, BUNDLED_VERSION_META_REL) {
        if let Ok(text) = std::fs::read_to_string(&p) {
            let parts: Vec<&str> = text.trim().split('/').collect();
            if parts.len() >= 2 && !parts[1].is_empty() && parts[1] != "unknown" {
                return Some(normalize_version(parts[1]));
            }
        }
    }
    // 3) Dev: repo-root OPENCODE_VERSION next to cwd / exe
    for candidate in [
        PathBuf::from("OPENCODE_VERSION"),
        PathBuf::from("../OPENCODE_VERSION"),
        PathBuf::from("../../OPENCODE_VERSION"),
    ] {
        if let Ok(text) = std::fs::read_to_string(&candidate) {
            let v = text.trim();
            if !v.is_empty() {
                return Some(normalize_version(v));
            }
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf());
        for _ in 0..5 {
            let Some(d) = dir else { break };
            let f = d.join("OPENCODE_VERSION");
            if let Ok(text) = std::fs::read_to_string(&f) {
                let v = text.trim();
                if !v.is_empty() {
                    return Some(normalize_version(v));
                }
            }
            dir = d.parent().map(|p| p.to_path_buf());
        }
    }
    None
}

fn read_windows_file_version(path: &Path) -> Option<String> {
    #[cfg(windows)]
    {
        let path_str = path.to_string_lossy().replace('\'', "''");
        let script = format!(
            "[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); $v=[Diagnostics.FileVersionInfo]::GetVersionInfo('{path_str}'); if($v.ProductVersion){{$v.ProductVersion}}else{{$v.FileVersion}}"
        );
        let output = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if text.is_empty() {
            None
        } else {
            Some(normalize_version(&text))
        }
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        None
    }
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
        let programs = local.join("Programs");
        for rel in [
            "OpenCode/OpenCode.exe",
            "OpenCode Dev/OpenCode Dev.exe",
            "OpenCode Dev/OpenCode.exe",
            "@opencode-aidesktop/OpenCode.exe",
            "@opencode-aidesktop/OpenCode Dev.exe",
            "opencode/OpenCode.exe",
            "opencode-desktop/OpenCode.exe",
            "opencode-dev/OpenCode.exe",
            "opencode-dev/OpenCode Dev.exe",
        ] {
            candidates.push(programs.join(rel));
        }

        if let Ok(entries) = std::fs::read_dir(&programs) {
            for entry in entries.flatten() {
                let dir = entry.path();
                if !dir.is_dir() {
                    continue;
                }
                for name in ["OpenCode.exe", "OpenCode Dev.exe"] {
                    let exe = dir.join(name);
                    if exe.is_file() {
                        candidates.push(exe);
                    }
                }
            }
        }
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
                .join("@opencode-aidesktop")
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
        candidates.push(PathBuf::from("G:/OpenCode/OpenCode.exe"));
    }

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

fn build_status(app: &AppHandle) -> OpenCodeBundleStatus {
    let bundled = bundled_installer_path(app);
    let desktop = find_desktop_exe();
    let cli = which_opencode_cli();
    let expected = read_expected_version(app);
    let installed = desktop.as_ref().and_then(|p| read_windows_file_version(p));
    let version_match = match (&expected, &installed) {
        (Some(e), Some(i)) => Some(versions_equal(e, i)),
        _ => None,
    };
    OpenCodeBundleStatus {
        bundled_installer_present: bundled.is_some(),
        bundled_installer_path: bundled.map(|p| p.display().to_string()),
        desktop_installed: desktop.is_some(),
        desktop_path: desktop.map(|p| p.display().to_string()),
        cli_on_path: cli.is_some(),
        expected_version: expected,
        installed_version: installed,
        version_match,
    }
}

#[tauri::command]
pub async fn get_opencode_bundle_status(app: AppHandle) -> Result<OpenCodeBundleStatus, AppError> {
    tauri::async_runtime::spawn_blocking(move || Ok(build_status(&app)))
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
        if bundled_installer_path(&app).is_some() {
            return Err(AppError::not_found(
                "OpenCode is not installed. Open Settings and install the bundled OpenCode first.",
            ));
        }
        Err(AppError::not_found(
            "OpenCode not found. Install OpenCode Desktop or set SKILLS_OPENCODE_DESKTOP to the exe path.",
        ))
    })
    .await
    .map_err(|e| AppError::io(format!("join error: {e}")))?
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeModelPolicyDto {
    pub mode: String,
    #[serde(default)]
    pub requirements_only_models: Vec<String>,
}

fn opencode_user_config_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("OPENCODE_CONFIG_DIR") {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        let trimmed = xdg.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed).join("opencode");
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config")
        .join("opencode")
}

fn opencode_managed_config_dir() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(program_data) = std::env::var("ProgramData") {
            return PathBuf::from(program_data).join("opencode");
        }
        return PathBuf::from(r"C:\ProgramData\opencode");
    }
    #[cfg(target_os = "macos")]
    {
        return PathBuf::from("/Library/Application Support/opencode");
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        PathBuf::from("/etc/opencode")
    }
}

fn write_policy_file(dir: &Path, policy: &OpenCodeModelPolicyDto) -> Result<(), AppError> {
    std::fs::create_dir_all(dir)
        .map_err(|e| AppError::io(format!("create opencode config dir failed: {e}")))?;
    let path = dir.join("skills-model-policy.json");
    let mode = match policy.mode.trim().to_ascii_lowercase().as_str() {
        "restricted" => "restricted",
        _ => "open",
    };
    let body = serde_json::json!({
        "mode": mode,
        "requirements_only_models": policy.requirements_only_models,
        "updated_by": "skills-manager",
    });
    let text = serde_json::to_string_pretty(&body)
        .map_err(|e| AppError::internal(format!("serialize model policy failed: {e}")))?;
    std::fs::write(&path, text)
        .map_err(|e| AppError::io(format!("write {}: {e}", path.display())))?;
    Ok(())
}

/// Write model policy for OpenCode (user config; try managed dir when writable).
#[tauri::command]
pub async fn sync_opencode_model_policy(
    policy: OpenCodeModelPolicyDto,
) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let user_dir = opencode_user_config_dir();
        write_policy_file(&user_dir, &policy)?;
        let mut written = vec![user_dir.join("skills-model-policy.json").display().to_string()];

        let managed_dir = opencode_managed_config_dir();
        if write_policy_file(&managed_dir, &policy).is_ok() {
            written.push(
                managed_dir
                    .join("skills-model-policy.json")
                    .display()
                    .to_string(),
            );
        }

        Ok(written.join("; "))
    })
    .await
    .map_err(|e| AppError::io(format!("join error: {e}")))?
}
