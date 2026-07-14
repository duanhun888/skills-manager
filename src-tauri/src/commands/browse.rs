use std::sync::Arc;
use tauri::State;

use crate::core::{
    error::AppError,
    skill_store::SkillStore,
    skillssh_api::{self, LeaderboardType, SkillsShSkill},
};

const LEADERBOARD_CACHE_TTL: i64 = 300; // 5 minutes
const LEADERBOARD_STALE_TTL: i64 = 86_400; // 24 hours — instant display while refreshing

#[tauri::command]
pub async fn fetch_leaderboard(
    board: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<Vec<SkillsShSkill>, AppError> {
    let cache_key = format!("leaderboard_{}", board);

    if let Ok(Some(cached)) = store.get_cache(&cache_key, LEADERBOARD_CACHE_TTL) {
        if let Ok(skills) = serde_json::from_str::<Vec<SkillsShSkill>>(&cached) {
            return Ok(skills);
        }
    }

    let board_type = LeaderboardType::from_str(&board);
    let stale_json = store.get_cache(&cache_key, LEADERBOARD_STALE_TTL).ok().flatten();

    if let Some(stale) = stale_json {
        if let Ok(skills) = serde_json::from_str::<Vec<SkillsShSkill>>(&stale) {
            let store_bg = Arc::clone(&store);
            let cache_key_bg = cache_key.clone();
            let proxy_url = store.proxy_url();
            tauri::async_runtime::spawn(async move {
                let fetched = tauri::async_runtime::spawn_blocking(move || {
                    skillssh_api::fetch_leaderboard(board_type, proxy_url.as_deref())
                        .map_err(AppError::network)
                })
                .await;

                if let Ok(Ok(fresh)) = fetched {
                    if let Ok(json) = serde_json::to_string(&fresh) {
                        store_bg.set_cache(&cache_key_bg, &json).ok();
                    }
                }
            });
            return Ok(skills);
        }
    }

    let proxy_url = store.proxy_url();
    let skills = tauri::async_runtime::spawn_blocking(move || {
        skillssh_api::fetch_leaderboard(board_type, proxy_url.as_deref()).map_err(AppError::network)
    })
    .await??;

    if let Ok(json) = serde_json::to_string(&skills) {
        store.set_cache(&cache_key, &json).ok();
    }

    Ok(skills)
}

#[tauri::command]
pub async fn search_skillssh(
    query: String,
    limit: Option<usize>,
    store: State<'_, Arc<SkillStore>>,
) -> Result<Vec<SkillsShSkill>, AppError> {
    let proxy_url = store.proxy_url();
    let requested = limit.unwrap_or(60);
    let bounded = requested.clamp(1, 300);
    tauri::async_runtime::spawn_blocking(move || {
        skillssh_api::search_skills(&query, bounded, proxy_url.as_deref())
            .map_err(AppError::network)
    })
    .await?
}

