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

/// Stop running OpenCode Desktop processes so the next launch picks up new
/// policy files / a freshly installed binary after Skills updates.
#[tauri::command]
pub async fn terminate_opencode_editors() -> Result<u32, AppError> {
    tauri::async_runtime::spawn_blocking(terminate_opencode_editors_blocking)
        .await
        .map_err(|e| AppError::io(format!("join error: {e}")))?
}

fn terminate_opencode_editors_blocking() -> Result<u32, AppError> {
    #[cfg(windows)]
    {
        let mut killed = 0u32;
        for name in ["OpenCode.exe", "OpenCode Dev.exe"] {
            let status = Command::new("taskkill")
                .args(["/IM", name, "/F", "/T"])
                .output();
            match status {
                Ok(out) if out.status.success() => killed += 1,
                _ => {}
            }
        }
        return Ok(killed);
    }
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("pkill").args(["-f", "OpenCode"]).output();
        return Ok(0);
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = Command::new("pkill").args(["-f", "opencode"]).output();
        Ok(0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeModelPolicyDto {
    pub mode: String,
    #[serde(default)]
    pub requirements_only_models: Vec<String>,
    #[serde(default)]
    pub coding_vision_model: Option<String>,
    #[serde(default)]
    pub coding_ocr_url: Option<String>,
    #[serde(default)]
    pub coding_image_priority: Option<String>,
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
            return PathBuf::from(trimmed).join("xh-skills");
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config")
        .join("xh-skills")
}

fn opencode_managed_config_dir() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(program_data) = std::env::var("ProgramData") {
            return PathBuf::from(program_data).join("xh-skills");
        }
        return PathBuf::from(r"C:\ProgramData\xh-skills");
    }
    #[cfg(target_os = "macos")]
    {
        return PathBuf::from("/Library/Application Support/xh-skills");
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        PathBuf::from("/etc/xh-skills")
    }
}

/// Expand policy entries so OpenCode can match real runtime IDs.
/// Admin often writes `opencode/qwen3.7-plus` or `alibaba/...`, while the live
/// provider on CN desktops is often `alibaba-cn/<same-model>`.
fn expand_requirements_only_models(models: &[String]) -> Vec<String> {
    const ALIASES: &[&str] = &["alibaba", "alibaba-cn", "opencode"];
    let mut out: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::<String>::new();
    let mut push = |value: String| {
        let key = value.to_ascii_lowercase();
        if seen.insert(key) {
            out.push(value);
        }
    };

    for raw in models {
        let entry = raw.trim();
        if entry.is_empty() {
            continue;
        }
        push(entry.to_string());

        let (provider, model) = match entry.split_once('/') {
            Some((p, m)) => (Some(p.trim()), m.trim()),
            None => (None, entry),
        };
        if model.is_empty() {
            continue;
        }
        push(model.to_string());

        let expand_aliases = match provider {
            None => true,
            Some(p) => ALIASES.iter().any(|a| a.eq_ignore_ascii_case(p)),
        };
        if expand_aliases {
            for alias in ALIASES {
                push(format!("{alias}/{model}"));
            }
        }
    }
    out
}

fn json_text_equal(existing: &str, next: &str) -> bool {
    let left = existing.trim();
    let right = next.trim();
    if left == right {
        return true;
    }
    match (
        serde_json::from_str::<serde_json::Value>(left),
        serde_json::from_str::<serde_json::Value>(right),
    ) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

fn write_if_changed(path: &Path, text: &str) -> std::io::Result<bool> {
    if let Ok(existing) = std::fs::read_to_string(path) {
        if json_text_equal(&existing, text) {
            return Ok(false);
        }
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let payload = if text.ends_with('\n') {
        text.to_string()
    } else {
        format!("{text}\n")
    };
    std::fs::write(path, payload)?;
    Ok(true)
}

fn write_policy_file(dir: &Path, policy: &OpenCodeModelPolicyDto) -> Result<(), AppError> {
    std::fs::create_dir_all(dir)
        .map_err(|e| AppError::io(format!("create opencode config dir failed: {e}")))?;
    let path = dir.join("skills-model-policy.json");
    let mode = match policy.mode.trim().to_ascii_lowercase().as_str() {
        "restricted" => "restricted",
        _ => "open",
    };
    let models = expand_requirements_only_models(&policy.requirements_only_models);
    let coding_vision = policy
        .coding_vision_model
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());
    let coding_ocr = policy
        .coding_ocr_url
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());
    let coding_priority = policy
        .coding_image_priority
        .as_deref()
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| {
            matches!(
                s.as_str(),
                "ocr_then_vl" | "vl_then_ocr" | "ocr_only" | "vl_only"
            )
        });
    let body = serde_json::json!({
        "mode": mode,
        "requirements_only_models": models,
        "coding_vision_model": coding_vision,
        "coding_ocr_url": coding_ocr,
        "coding_image_priority": coding_priority,
        "updated_by": "skills-manager",
    });
    let text = serde_json::to_string_pretty(&body)
        .map_err(|e| AppError::internal(format!("serialize model policy failed: {e}")))?;
    write_if_changed(&path, &text)
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

fn write_user_image_policy_file(dir: &Path, priority: Option<&str>) -> Result<(), AppError> {
    std::fs::create_dir_all(dir)
        .map_err(|e| AppError::io(format!("create opencode config dir failed: {e}")))?;
    let path = dir.join("skills-model-user-policy.json");
    let normalized = priority
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| {
            matches!(
                s.as_str(),
                "ocr_then_vl" | "vl_then_ocr" | "ocr_only" | "vl_only"
            )
        });
    if normalized.is_none() {
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|e| AppError::io(format!("remove {}: {e}", path.display())))?;
        }
        return Ok(());
    }
    let body = serde_json::json!({
        "coding_image_priority": normalized,
        "updated_by": "skills-manager-user",
    });
    let text = serde_json::to_string_pretty(&body)
        .map_err(|e| AppError::internal(format!("serialize user image policy failed: {e}")))?;
    std::fs::write(&path, text)
        .map_err(|e| AppError::io(format!("write {}: {e}", path.display())))?;
    Ok(())
}

/// Write or clear per-user image-priority overlay for OpenCode (org policy stays separate).
#[tauri::command]
pub async fn sync_opencode_user_image_policy(
    coding_image_priority: Option<String>,
) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let priority = coding_image_priority
            .as_deref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty());
        let user_dir = opencode_user_config_dir();
        write_user_image_policy_file(&user_dir, priority)?;
        let mut written = vec![user_dir
            .join("skills-model-user-policy.json")
            .display()
            .to_string()];

        let managed_dir = opencode_managed_config_dir();
        if write_user_image_policy_file(&managed_dir, priority).is_ok() {
            written.push(
                managed_dir
                    .join("skills-model-user-policy.json")
                    .display()
                    .to_string(),
            );
        }

        Ok(written.join("; "))
    })
    .await
    .map_err(|e| AppError::io(format!("join error: {e}")))?
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeProviderAuthEntryDto {
    #[serde(rename = "type")]
    pub cred_type: String,
    pub key: String,
    /// Allowed model ids for this shared provider (required for org sync).
    #[serde(default)]
    pub models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeProviderAuthDto {
    /// Map of provider id → { type, key, models }.
    pub providers: std::collections::HashMap<String, OpenCodeProviderAuthEntryDto>,
}

fn opencode_user_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("OPENCODE_DATA_DIR") {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
        let trimmed = xdg.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed).join("xh-skills");
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".local")
        .join("share")
        .join("xh-skills")
}

/// Pretty-print a model id for OpenCode model picker labels.
fn model_display_name(model_id: &str) -> String {
    let trimmed = model_id.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("glm-") {
        let mut out = String::from("GLM-");
        let rest: Vec<char> = lower[4..].chars().collect();
        for i in 0..rest.len() {
            let ch = rest[i];
            if ch == 'v' && i > 0 && rest[i - 1].is_ascii_digit() {
                out.push('V');
                continue;
            }
            if i == 0 || rest[i - 1] == '-' || rest[i - 1] == '_' {
                for c in ch.to_uppercase() {
                    out.push(c);
                }
                continue;
            }
            out.push(ch);
        }
        return out;
    }
    // Keep known product casing when possible (e.g. qwen-plus → Qwen-Plus).
    let mut out = String::with_capacity(trimmed.len());
    let mut upper = true;
    for ch in trimmed.chars() {
        if ch == '-' || ch == '_' {
            out.push(ch);
            upper = true;
            continue;
        }
        if upper {
            for c in ch.to_uppercase() {
                out.push(c);
            }
            upper = false;
        } else {
            out.push(ch);
        }
    }
    out
}

/// Heuristic: multimodal / vision-capable model ids (GLM-*-V*, *-vl*, vision, …).
fn looks_like_vision_model(model_id: &str) -> bool {
    let id = model_id.trim().to_ascii_lowercase();
    if id.is_empty() {
        return false;
    }
    if id.contains("vision") || id.contains("vlm") || id.contains("-vl") || id.contains("_vl") {
        return true;
    }
    // glm-4.6v / glm-4.6v-flash / qwen2.5-vl-…
    let bytes = id.as_bytes();
    for i in 0..bytes.len() {
        if bytes[i] != b'v' {
            continue;
        }
        let prev_digit = i > 0 && bytes[i - 1].is_ascii_digit();
        let next_ok = i + 1 >= bytes.len() || matches!(bytes[i + 1], b'-' | b'_' | b'.');
        if prev_digit && next_ok {
            return true;
        }
    }
    false
}

fn model_config_entry(model_id: &str) -> serde_json::Value {
    let name = model_display_name(model_id);
    if looks_like_vision_model(model_id) {
        return serde_json::json!({
            "name": name,
            "attachment": true,
            "tool_call": true,
            "modalities": {
                "input": ["text", "image"],
                "output": ["text"]
            }
        });
    }
    serde_json::json!({
        "name": name,
        "tool_call": true
    })
}

/// Merge org-shared provider model definitions into an OpenCode config JSON object.
/// Only upserts `provider.<id>.models.<model>`; preserves unrelated user settings.
fn merge_org_provider_models_into_config(
    existing: &serde_json::Value,
    models_by_provider: &serde_json::Map<String, serde_json::Value>,
) -> serde_json::Value {
    let mut root = if existing.is_object() {
        existing.clone()
    } else {
        serde_json::json!({})
    };
    let obj = root.as_object_mut().expect("root object");
    obj.entry("$schema")
        .or_insert_with(|| serde_json::json!("https://opencode.ai/config.json"));

    let provider = obj
        .entry("provider")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut();
    let Some(provider) = provider else {
        return root;
    };

    for (provider_id, models_value) in models_by_provider {
        let Some(models) = models_value.as_array() else {
            continue;
        };
        let provider_obj = provider
            .entry(provider_id.clone())
            .or_insert_with(|| serde_json::json!({}))
            .as_object_mut();
        let Some(provider_obj) = provider_obj else {
            continue;
        };
        let models_obj = provider_obj
            .entry("models")
            .or_insert_with(|| serde_json::json!({}))
            .as_object_mut();
        let Some(models_obj) = models_obj else {
            continue;
        };
        for model in models {
            let Some(model_id) = model.as_str().map(str::trim).filter(|s| !s.is_empty()) else {
                continue;
            };
            models_obj.insert(model_id.to_string(), model_config_entry(model_id));
        }
    }

    root
}

fn strip_personal_auth_for_org_providers(org_ids: &[String]) -> Option<String> {
    if org_ids.is_empty() {
        return None;
    }
    let path = opencode_user_data_dir().join("auth.json");
    let Ok(text) = std::fs::read_to_string(&path) else {
        return None;
    };
    let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&text) else {
        return None;
    };
    let Some(obj) = value.as_object_mut() else {
        return None;
    };
    let org_set: std::collections::HashSet<String> = org_ids
        .iter()
        .map(|id| id.trim().to_ascii_lowercase())
        .filter(|id| !id.is_empty())
        .collect();
    let remove_keys: Vec<String> = obj
        .keys()
        .filter(|key| org_set.contains(&key.trim().to_ascii_lowercase()))
        .cloned()
        .collect();
    if remove_keys.is_empty() {
        return None;
    }
    let backup = path.with_extension("json.bak-skills");
    let _ = std::fs::write(&backup, &text);
    for key in &remove_keys {
        obj.remove(key);
    }
    let Ok(next) = serde_json::to_string_pretty(&value) else {
        return None;
    };
    if std::fs::write(&path, format!("{next}\n")).is_ok() {
        Some(format!(
            "stripped personal auth for {} (backup {})",
            remove_keys.join(","),
            backup.display()
        ))
    } else {
        None
    }
}

fn write_org_provider_models_config(
    models_by_provider: &serde_json::Map<String, serde_json::Value>,
) -> Vec<String> {
    if models_by_provider.is_empty() {
        return Vec::new();
    }
    let mut written = Vec::new();
    for path in [
        opencode_user_config_dir().join("opencode.json"),
        opencode_managed_config_dir().join("opencode.json"),
    ] {
        let existing = std::fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
            .unwrap_or_else(|| serde_json::json!({}));
        let merged = merge_org_provider_models_into_config(&existing, models_by_provider);
        let Ok(text) = serde_json::to_string_pretty(&merged) else {
            continue;
        };
        match write_if_changed(&path, &text) {
            Ok(true) => written.push(path.display().to_string()),
            _ => {}
        }
    }
    written
}

/// Write org provider API keys to a separate file (skills-org-auth.json).
/// Org credentials own the canonical provider id; colliding personal keys in auth.json
/// are stripped (backup: auth.json.bak-skills) so stale OpenCode leftovers cannot block sync.
/// Also merges org model definitions into user/managed `opencode.json` so models missing from
/// models.dev (e.g. glm-4.6v-flash) appear for every synced client.
#[tauri::command]
pub async fn sync_opencode_provider_auth(
    auth: OpenCodeProviderAuthDto,
) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut org_map = serde_json::Map::new();
        let mut org_ids: Vec<String> = Vec::new();
        let mut models_map = serde_json::Map::new();
        for (provider_id, entry) in &auth.providers {
            let id = provider_id.trim();
            if id.is_empty() {
                continue;
            }
            let key = entry.key.trim();
            if key.is_empty() {
                continue;
            }
            let models: Vec<String> = entry
                .models
                .iter()
                .map(|m| m.trim().to_string())
                .filter(|m| !m.is_empty())
                .collect();
            if models.is_empty() {
                continue;
            }
            let cred_type = if entry.cred_type.trim().is_empty() {
                "api".to_string()
            } else {
                entry.cred_type.trim().to_string()
            };
            org_map.insert(
                id.to_string(),
                serde_json::json!({
                    "type": cred_type,
                    "key": key,
                }),
            );
            org_ids.push(id.to_string());
            models_map.insert(
                id.to_string(),
                serde_json::Value::Array(
                    models
                        .into_iter()
                        .map(serde_json::Value::String)
                        .collect(),
                ),
            );
        }

        let body = serde_json::json!({
            "providers": org_map,
            "updated_by": "skills-manager",
        });
        let text = serde_json::to_string_pretty(&body)
            .map_err(|e| AppError::internal(format!("serialize org auth failed: {e}")))?;

        let mut written: Vec<String> = Vec::new();
        let auth_paths = [
            opencode_user_data_dir().join("skills-org-auth.json"),
            opencode_user_config_dir().join("skills-org-auth.json"),
            opencode_managed_config_dir().join("skills-org-auth.json"),
        ];
        for path in &auth_paths {
            match write_if_changed(path, &text) {
                Ok(_) => written.push(path.display().to_string()),
                Err(_) => {}
            }
        }
        if written.is_empty() {
            return Err(AppError::io("failed to write skills-org-auth.json".to_string()));
        }

        // Marker for UI「共享」badge + allowed models (no secrets).
        let marker = serde_json::json!({
            "provider_ids": org_ids,
            "models": models_map,
            "updated_by": "skills-manager",
        });
        let marker_text = serde_json::to_string_pretty(&marker)
            .map_err(|e| AppError::internal(format!("serialize org providers marker failed: {e}")))?;
        for marker_path in [
            opencode_user_config_dir().join("skills-org-providers.json"),
            opencode_managed_config_dir().join("skills-org-providers.json"),
            opencode_user_data_dir().join("skills-org-providers.json"),
        ] {
            let _ = write_if_changed(&marker_path, &marker_text);
        }

        let config_written = write_org_provider_models_config(&models_map);
        if !config_written.is_empty() {
            written.extend(config_written);
        }

        if let Some(stripped) = strip_personal_auth_for_org_providers(&org_ids) {
            written.push(stripped);
        }

        Ok(format!(
            "{} ({} shared providers)",
            written.join("; "),
            org_ids.len()
        ))
    })
    .await
    .map_err(|e| AppError::io(format!("join error: {e}")))?
}

#[cfg(test)]
mod org_provider_models_config_tests {
    use super::{
        looks_like_vision_model, merge_org_provider_models_into_config, model_display_name,
    };
    use serde_json::json;

    #[test]
    fn display_name_title_cases_segments() {
        assert_eq!(model_display_name("glm-4.6v-flash"), "GLM-4.6V-Flash");
        assert_eq!(model_display_name("glm-5.2"), "GLM-5.2");
    }

    #[test]
    fn vision_heuristic_matches_glm_v_flash() {
        assert!(looks_like_vision_model("glm-4.6v-flash"));
        assert!(looks_like_vision_model("glm-4.6v"));
        assert!(!looks_like_vision_model("glm-5.2"));
        assert!(!looks_like_vision_model("qwen-plus"));
    }

    #[test]
    fn merge_upserts_models_without_wiping_other_keys() {
        let existing = json!({
            "$schema": "https://opencode.ai/config.json",
            "theme": "dark",
            "provider": {
                "zhipuai": {
                    "models": {
                        "glm-5.2": { "name": "Keep Me" }
                    }
                }
            }
        });
        let mut models = serde_json::Map::new();
        models.insert(
            "zhipuai".into(),
            json!(["glm-4.6v-flash", "glm-5.2"]),
        );
        let merged = merge_org_provider_models_into_config(&existing, &models);
        assert_eq!(merged["theme"], "dark");
        assert_eq!(
            merged["provider"]["zhipuai"]["models"]["glm-4.6v-flash"]["name"],
            "GLM-4.6V-Flash"
        );
        assert_eq!(
            merged["provider"]["zhipuai"]["models"]["glm-4.6v-flash"]["attachment"],
            true
        );
        // Org sync overwrites the shared model entry with generated metadata.
        assert_eq!(
            merged["provider"]["zhipuai"]["models"]["glm-5.2"]["name"],
            "GLM-5.2"
        );
    }
}
