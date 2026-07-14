use std::io::Write;
use std::path::Path;
use std::sync::Arc;

use serde::Deserialize;
use tauri::State;

use crate::commands::server_auth::{get_bytes_blocking, get_json_blocking};
use crate::commands::skills::{
    log_install_outcome, log_update_outcome, managed_skill_by_id, resolve_skill_dir,
    resync_copy_targets, staged_path_for, store_installed_skill_unlocked, swap_skill_directory,
    InstallSourceMetadata, ManagedSkillDto, UpdateSkillResult,
};
use crate::core::error::AppError;
use crate::core::git_fetcher;
use crate::core::installer;
use crate::core::repo_lock::RepoLock;
use crate::core::skill_metadata;
use crate::core::skill_store::{SkillRecord, SkillStore};
use crate::core::sync_metadata;

#[derive(Debug, Deserialize, Clone)]
struct ServerSkillResponse {
    id: String,
    scope: String,
    name: String,
    category: Option<String>,
    git_remote: Option<String>,
    git_path: Option<String>,
    content_hash: Option<String>,
    has_content: bool,
}

#[derive(Debug, serde::Serialize)]
pub struct InstallFromServerResult {
    pub skill_id: String,
    pub skill_name: String,
}

fn fetch_server_skill(
    base_url: &str,
    token: &str,
    server_skill_id: &str,
) -> Result<ServerSkillResponse, AppError> {
    get_json_blocking(
        base_url,
        token,
        &format!("/api/v1/skills/{server_skill_id}"),
    )
}

fn download_server_zip(
    base_url: &str,
    token: &str,
    server_skill_id: &str,
) -> Result<Vec<u8>, AppError> {
    get_bytes_blocking(
        base_url,
        token,
        &format!("/api/v1/skills/{server_skill_id}/content"),
    )
}

fn write_zip_temp(zip_bytes: &[u8]) -> Result<tempfile::NamedTempFile, AppError> {
    let mut temp = tempfile::Builder::new()
        .suffix(".zip")
        .tempfile()
        .map_err(|e| AppError::io(e.to_string()))?;
    temp.write_all(zip_bytes).map_err(AppError::io)?;
    temp.flush().map_err(AppError::io)?;
    Ok(temp)
}

fn install_metadata_from_server(
    meta: &ServerSkillResponse,
    base_url: &str,
    revision: Option<String>,
) -> InstallSourceMetadata {
    InstallSourceMetadata {
        source_type: "server".to_string(),
        source_ref: Some(meta.id.clone()),
        source_ref_resolved: Some(base_url.to_string()),
        source_subpath: meta.git_path.clone(),
        source_branch: None,
        source_revision: revision.clone(),
        remote_revision: revision.or_else(|| meta.content_hash.clone()),
        update_status: "up_to_date".to_string(),
    }
}

fn install_from_server_zip(
    zip_bytes: &[u8],
    install_name: Option<&str>,
) -> Result<installer::InstallResult, AppError> {
    let temp = write_zip_temp(zip_bytes)?;
    installer::install_from_local(temp.path(), install_name).map_err(AppError::io)
}

fn install_from_server_git(
    store: &SkillStore,
    meta: &ServerSkillResponse,
    install_name: Option<&str>,
) -> Result<(installer::InstallResult, InstallSourceMetadata), AppError> {
    let git_remote = meta
        .git_remote
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::invalid_input("no_server_content"))?;

    git_fetcher::validate_git_url(git_remote).map_err(AppError::git)?;
    let proxy_url = store.proxy_url();
    let parsed = git_fetcher::parse_git_source_resolved(git_remote, proxy_url.as_deref());
    let temp_dir = git_fetcher::clone_repo_ref_with_progress(
        &parsed.clone_url,
        parsed.branch.as_deref(),
        None,
        proxy_url.as_deref(),
        None,
    )
    .map_err(AppError::classify_git_error)?;

    let outcome = (|| -> Result<(installer::InstallResult, InstallSourceMetadata), AppError> {
        let subpath = meta
            .git_path
            .as_deref()
            .or(parsed.subpath.as_deref());
        let skill_dir = resolve_skill_dir(&temp_dir, subpath, None)?;
        let revision = git_fetcher::get_head_revision(&temp_dir).map_err(AppError::git)?;
        let result =
            installer::install_from_git_dir(&skill_dir, install_name).map_err(AppError::io)?;
        let remote = meta.content_hash.clone().or_else(|| Some(revision.clone()));
        let metadata = InstallSourceMetadata {
            source_type: "server".to_string(),
            source_ref: Some(meta.id.clone()),
            source_ref_resolved: Some(parsed.original_url.clone()),
            source_subpath: git_fetcher::relative_subpath(&temp_dir, &skill_dir),
            source_branch: parsed.branch.clone(),
            source_revision: remote.clone(),
            remote_revision: remote,
            update_status: "up_to_date".to_string(),
        };
        Ok((result, metadata))
    })();

    git_fetcher::cleanup_temp(&temp_dir);
    outcome
}

fn resolve_server_content(
    base_url: &str,
    token: &str,
    store: &SkillStore,
    meta: &ServerSkillResponse,
    install_name: Option<&str>,
) -> Result<(installer::InstallResult, InstallSourceMetadata), AppError> {
    if meta.has_content {
        let zip_bytes = download_server_zip(base_url, token, &meta.id)?;
        let result = install_from_server_zip(&zip_bytes, install_name)?;
        let metadata = install_metadata_from_server(meta, base_url, meta.content_hash.clone());
        return Ok((result, metadata));
    }

    install_from_server_git(store, meta, install_name)
}

fn server_skill_install_name(meta: &ServerSkillResponse) -> Option<&str> {
    let name = meta.name.trim();
    if name.is_empty() {
        None
    } else {
        Some(name)
    }
}

fn apply_server_zip_to_skill(
    store: &SkillStore,
    skill: &SkillRecord,
    zip_bytes: &[u8],
    meta: &ServerSkillResponse,
) -> Result<bool, AppError> {
    if meta
        .content_hash
        .as_deref()
        .is_some_and(|hash| skill.content_hash.as_deref() == Some(hash))
    {
        store
            .update_skill_check_state(&skill.id, meta.content_hash.as_deref(), "up_to_date", None)
            .map_err(AppError::db)?;
        return Ok(false);
    }

    store
        .update_skill_update_status(&skill.id, "updating")
        .map_err(AppError::db)?;

    let temp = write_zip_temp(zip_bytes)?;
    let staged_path = staged_path_for(&skill.central_path);
    let install_result = installer::install_from_local_to_destination(
        temp.path(),
        Some(&skill.name),
        &staged_path,
    )
    .map_err(AppError::io)?;
    swap_skill_directory(&staged_path, Path::new(&skill.central_path))?;

    store
        .update_skill_after_install(
            &skill.id,
            &skill.name,
            install_result.description.as_deref(),
            meta.content_hash.as_deref(),
            meta.content_hash.as_deref(),
            Some(&install_result.content_hash),
            "up_to_date",
        )
        .map_err(AppError::db)?;

    if skill.scope != meta.scope {
        store
            .update_skill_scope(&skill.id, &meta.scope)
            .map_err(AppError::db)?;
    }

    resync_copy_targets(store, &skill.id)?;
    let _ = skill_metadata::persist_metadata_from_disk(store, &skill.id, Path::new(&skill.central_path));
    apply_server_category_fallback(store, &skill.id, &skill.central_path, meta)?;
    sync_metadata::write_all_from_db_unlocked(store).map_err(AppError::db)?;
    Ok(true)
}

fn require_linked_server_skill(skill: &SkillRecord) -> Result<&str, AppError> {
    if skill.source_type != "server" {
        return Err(AppError::invalid_input(
            "Only central-server skills can be synced this way",
        ));
    }
    skill
        .server_skill_id
        .as_deref()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::invalid_input("Skill is not linked to the central server"))
}

fn apply_server_category_fallback(
    store: &SkillStore,
    skill_id: &str,
    central_path: &str,
    meta: &ServerSkillResponse,
) -> Result<(), AppError> {
    let skill = store
        .get_skill_by_id(skill_id)
        .map_err(AppError::db)?
        .ok_or_else(|| AppError::not_found("Skill not found"))?;
    if skill.category.is_some() {
        return Ok(());
    }
    let Some(cat) = meta
        .category
        .as_deref()
        .and_then(crate::core::skill_categories::normalize_category)
    else {
        return Ok(());
    };
    store
        .update_skill_category(skill_id, Some(&cat))
        .map_err(AppError::db)?;
    let _ = skill_metadata::write_category_to_skill_md(Path::new(central_path), Some(&cat));
    Ok(())
}

#[tauri::command]
pub async fn install_from_server(
    base_url: String,
    token: String,
    server_skill_id: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<InstallFromServerResult, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let outcome = (|| -> Result<InstallFromServerResult, AppError> {
            if store
                .get_skill_by_server_skill_id(&server_skill_id)
                .map_err(AppError::db)?
                .is_some()
            {
                return Err(AppError::invalid_input("already_installed"));
            }

            let meta = fetch_server_skill(&base_url, &token, &server_skill_id)?;
            let install_name = server_skill_install_name(&meta);
            let _lock =
                RepoLock::acquire_foreground("install server skill").map_err(AppError::db)?;
            let (result, metadata) =
                resolve_server_content(&base_url, &token, &store, &meta, install_name)?;

            let local_id = store_installed_skill_unlocked(&store, &result, &metadata, None)?;
            store
                .set_server_skill_id(&local_id, Some(&meta.id))
                .map_err(AppError::db)?;
            store
                .update_skill_scope(&local_id, &meta.scope)
                .map_err(AppError::db)?;
            if let Ok(record) = store.get_skill_by_id(&local_id).map_err(AppError::db) {
                if let Some(skill) = record {
                    apply_server_category_fallback(&store, &local_id, &skill.central_path, &meta)?;
                }
            }

            Ok(InstallFromServerResult {
                skill_id: local_id,
                skill_name: result.name,
            })
        })();

        match &outcome {
            Ok(result) => log_install_outcome(
                &store,
                "server",
                Ok(&(result.skill_id.clone(), result.skill_name.clone())),
            ),
            Err(error) => log_install_outcome(&store, "server", Err(error)),
        }
        outcome
    })
    .await
    .map_err(|e| AppError::internal(format!("install task failed: {e}")))?
}

#[tauri::command]
pub async fn check_server_skill_update(
    base_url: String,
    token: String,
    skill_id: String,
    force: Option<bool>,
    store: State<'_, Arc<SkillStore>>,
) -> Result<ManagedSkillDto, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = RepoLock::acquire_foreground("check server skill update").map_err(AppError::db)?;
        let skill = store
            .get_skill_by_id(&skill_id)
            .map_err(AppError::db)?
            .ok_or_else(|| AppError::not_found("Skill not found"))?;
        let server_skill_id = require_linked_server_skill(&skill)?.to_string();

        if !force.unwrap_or(false) {
            if let Some(last_checked) = skill.last_checked_at {
                let now = chrono::Utc::now().timestamp_millis();
                if now - last_checked < 15 * 60 * 1000 {
                    return managed_skill_by_id(&store, &skill_id);
                }
            }
        }

        let meta = fetch_server_skill(&base_url, &token, &server_skill_id)?;
        let update_status = if !meta.has_content && meta.git_remote.as_deref().is_none_or(str::is_empty) {
            "unknown"
        } else {
            match (skill.content_hash.as_deref(), meta.content_hash.as_deref()) {
                (Some(local), Some(remote)) if local == remote => "up_to_date",
                (None, None) if !meta.has_content => "unknown",
                _ => "update_available",
            }
        };

        store
            .update_skill_check_state(
                &skill.id,
                meta.content_hash.as_deref(),
                update_status,
                None,
            )
            .map_err(AppError::db)?;

        managed_skill_by_id(&store, &skill_id)
    })
    .await
    .map_err(|e| AppError::internal(format!("check task failed: {e}")))?
}

#[tauri::command]
pub async fn update_skill_from_server(
    base_url: String,
    token: String,
    skill_id: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<UpdateSkillResult, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let outcome = (|| -> Result<UpdateSkillResult, AppError> {
            let skill = store
                .get_skill_by_id(&skill_id)
                .map_err(AppError::db)?
                .ok_or_else(|| AppError::not_found("Skill not found"))?;
            let server_skill_id = require_linked_server_skill(&skill)?.to_string();
            let meta = fetch_server_skill(&base_url, &token, &server_skill_id)?;

            if !meta.has_content {
                return Err(AppError::invalid_input("no_server_content"));
            }

            let zip_bytes = download_server_zip(&base_url, &token, &server_skill_id)?;
            let _lock =
                RepoLock::acquire_foreground("update server skill").map_err(AppError::db)?;
            let content_changed = apply_server_zip_to_skill(&store, &skill, &zip_bytes, &meta)?;
            let skill = managed_skill_by_id(&store, &skill_id)?;
            Ok(UpdateSkillResult {
                skill,
                content_changed,
            })
        })();

        match &outcome {
            Ok(result) => log_update_outcome(&store, &skill_id, "server", Ok(result)),
            Err(error) => log_update_outcome(&store, &skill_id, "server", Err(error)),
        }
        outcome
    })
    .await
    .map_err(|e| AppError::internal(format!("update task failed: {e}")))?
}
