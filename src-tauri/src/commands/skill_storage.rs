use std::path::PathBuf;
use std::sync::Arc;

use tauri::State;

use crate::commands::server_auth::{get_bytes_blocking, put_bytes_blocking};
use crate::core::error::AppError;
use crate::core::skill_archive::{unzip_to_directory, zip_directory};
use crate::core::skill_store::SkillStore;

#[tauri::command]
pub async fn upload_skill_content_to_server(
    base_url: String,
    token: String,
    local_skill_id: String,
    server_skill_id: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let skill = store
            .get_skill_by_id(&local_skill_id)
            .map_err(AppError::db)?
            .ok_or_else(|| AppError::invalid_input("skill not found"))?;
        let zip_bytes = zip_directory(PathBuf::from(&skill.central_path).as_path())
            .map_err(|e| AppError::io(e.to_string()))?;
        put_bytes_blocking(
            &base_url,
            &token,
            &format!("/api/v1/skills/{server_skill_id}/content"),
            "application/zip",
            skill.content_hash.as_deref(),
            skill.source_revision.as_deref(),
            skill.source_branch.as_deref(),
            zip_bytes,
        )
    })
    .await
    .map_err(|e| AppError::internal(format!("upload task failed: {e}")))??;
    Ok(())
}

#[tauri::command]
pub async fn download_skill_content_from_server(
    base_url: String,
    token: String,
    local_skill_id: String,
    server_skill_id: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    let central_path = tauri::async_runtime::spawn_blocking(move || {
        let skill = store
            .get_skill_by_id(&local_skill_id)
            .map_err(AppError::db)?
            .ok_or_else(|| AppError::invalid_input("skill not found"))?;
        Ok::<_, AppError>(skill.central_path)
    })
    .await
    .map_err(|e| AppError::internal(format!("lookup task failed: {e}")))??;

    let data = tauri::async_runtime::spawn_blocking(move || {
        get_bytes_blocking(
            &base_url,
            &token,
            &format!("/api/v1/skills/{server_skill_id}/content"),
        )
    })
    .await
    .map_err(|e| AppError::internal(format!("download task failed: {e}")))??;

    tauri::async_runtime::spawn_blocking(move || {
        let dest = PathBuf::from(&central_path);
        if dest.exists() {
            return Err(AppError::invalid_input(
                "skill directory already exists; remove local copy first",
            ));
        }
        unzip_to_directory(&data, &dest).map_err(|e| AppError::io(e.to_string()))
    })
    .await
    .map_err(|e| AppError::internal(format!("extract task failed: {e}")))??;
    Ok(())
}
