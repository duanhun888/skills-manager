use serde::{Deserialize, Serialize};

use crate::core::error::AppError;

#[derive(Debug, Serialize, Deserialize)]
pub struct ServerUserDto {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub roles: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServerLoginResponse {
    pub user: ServerUserDto,
    pub access_token: String,
    pub token_type: String,
    pub expires_in: i64,
}

fn normalize_base_url(base_url: &str) -> String {
    base_url.trim().trim_end_matches('/').to_string()
}

fn build_client() -> Result<reqwest::blocking::Client, AppError> {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| AppError::network(e))
}

fn build_binary_client() -> Result<reqwest::blocking::Client, AppError> {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| AppError::network(e))
}

#[tauri::command]
pub async fn server_login(
    base_url: String,
    username: String,
    password: String,
) -> Result<ServerLoginResponse, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let url = format!("{}/api/v1/auth/login", normalize_base_url(&base_url));
        let client = build_client()?;
        let resp = client
            .post(&url)
            .json(&serde_json::json!({
                "username": username,
                "password": password,
            }))
            .send()
            .map_err(|e| AppError::network(format!("无法连接中央服务: {e}")))?;

        if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(AppError::invalid_input("unauthorized"));
        }
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().unwrap_or_default();
            return Err(AppError::network(format!("登录失败 ({status}): {body}")));
        }

        resp.json::<ServerLoginResponse>()
            .map_err(|e| AppError::internal(format!("invalid login response: {e}")))
    })
    .await
    .map_err(|e| AppError::internal(format!("login task failed: {e}")))?
}

#[tauri::command]
pub async fn server_fetch_me(base_url: String, token: String) -> Result<ServerUserDto, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let url = format!("{}/api/v1/auth/me", normalize_base_url(&base_url));
        let client = build_client()?;
        let resp = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token.trim()))
            .send()
            .map_err(|e| AppError::network(format!("无法连接中央服务: {e}")))?;

        if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(AppError::invalid_input("unauthorized"));
        }
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().unwrap_or_default();
            return Err(AppError::network(format!("fetch me failed ({status}): {body}")));
        }

        resp.json::<ServerUserDto>()
            .map_err(|e| AppError::internal(format!("invalid me response: {e}")))
    })
    .await
    .map_err(|e| AppError::internal(format!("fetch me task failed: {e}")))?
}

#[tauri::command]
pub async fn server_api_request(
    base_url: String,
    token: String,
    method: String,
    path: String,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = if path.starts_with('/') {
            path
        } else {
            format!("/{path}")
        };
        let url = format!("{}{}", normalize_base_url(&base_url), path);
        let client = build_client()?;
        let method_upper = method.to_uppercase();
        let mut req = match method_upper.as_str() {
            "GET" => client.get(&url),
            "POST" => client.post(&url),
            "PATCH" => client.patch(&url),
            "PUT" => client.put(&url),
            "DELETE" => client.delete(&url),
            _ => return Err(AppError::invalid_input("unsupported HTTP method")),
        };
        req = req.header("Authorization", format!("Bearer {}", token.trim()));
        if let Some(ref payload) = body {
            req = req.json(payload);
        }
        let resp = req
            .send()
            .map_err(|e| AppError::network(format!("无法连接中央服务: {e}")))?;

        if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(AppError::invalid_input("unauthorized"));
        }
        if resp.status() == reqwest::StatusCode::FORBIDDEN {
            return Err(AppError::invalid_input("forbidden"));
        }
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().unwrap_or_default();
            return Err(AppError::network(format!("请求失败 ({status}): {text}")));
        }
        if resp.status() == reqwest::StatusCode::NO_CONTENT {
            return Ok(serde_json::Value::Null);
        }
        resp.json::<serde_json::Value>()
            .map_err(|e| AppError::internal(format!("invalid JSON response: {e}")))
    })
    .await
    .map_err(|e| AppError::internal(format!("api request task failed: {e}")))?
}

pub(crate) fn get_json_blocking<T: serde::de::DeserializeOwned>(
    base_url: &str,
    token: &str,
    path: &str,
) -> Result<T, AppError> {
    let path = if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    };
    let url = format!("{}{}", normalize_base_url(base_url), path);
    let client = build_client()?;
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token.trim()))
        .send()
        .map_err(|e| AppError::network(format!("无法连接中央服务: {e}")))?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(AppError::invalid_input("unauthorized"));
    }
    if resp.status() == reqwest::StatusCode::FORBIDDEN {
        return Err(AppError::invalid_input("forbidden"));
    }
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(AppError::invalid_input("not_found"));
    }
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        return Err(AppError::network(format!("请求失败 ({status}): {text}")));
    }

    resp.json::<T>()
        .map_err(|e| AppError::internal(format!("invalid JSON response: {e}")))
}

pub(crate) fn put_bytes_blocking(
    base_url: &str,
    token: &str,
    path: &str,
    content_type: &str,
    content_hash: Option<&str>,
    git_commit: Option<&str>,
    git_branch: Option<&str>,
    data: Vec<u8>,
) -> Result<(), AppError> {
    let path = if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    };
    let url = format!("{}{}", normalize_base_url(base_url), path);
    let client = build_binary_client()?;
    let mut req = client
        .put(&url)
        .header("Authorization", format!("Bearer {}", token.trim()))
        .header("Content-Type", content_type)
        .body(data);
    if let Some(hash) = content_hash {
        if !hash.trim().is_empty() {
            req = req.header("X-Content-Hash", hash.trim());
        }
    }
    if let Some(commit) = git_commit {
        if !commit.trim().is_empty() {
            req = req.header("X-Git-Commit", commit.trim());
        }
    }
    if let Some(branch) = git_branch {
        if !branch.trim().is_empty() {
            req = req.header("X-Git-Branch", branch.trim());
        }
    }
    let resp = req
        .send()
        .map_err(|e| AppError::network(format!("无法连接中央服务: {e}")))?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(AppError::invalid_input("unauthorized"));
    }
    if resp.status() == reqwest::StatusCode::FORBIDDEN {
        return Err(AppError::invalid_input("forbidden"));
    }
    if resp.status() == reqwest::StatusCode::SERVICE_UNAVAILABLE {
        return Err(AppError::invalid_input("obs_not_configured"));
    }
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        return Err(AppError::network(format!("上传失败 ({status}): {text}")));
    }
    Ok(())
}

pub(crate) fn get_bytes_blocking(
    base_url: &str,
    token: &str,
    path: &str,
) -> Result<Vec<u8>, AppError> {
    let path = if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    };
    let url = format!("{}{}", normalize_base_url(base_url), path);
    let client = build_binary_client()?;
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token.trim()))
        .send()
        .map_err(|e| AppError::network(format!("无法连接中央服务: {e}")))?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(AppError::invalid_input("unauthorized"));
    }
    if resp.status() == reqwest::StatusCode::FORBIDDEN {
        return Err(AppError::invalid_input("forbidden"));
    }
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(AppError::invalid_input("not_found"));
    }
    if resp.status() == reqwest::StatusCode::SERVICE_UNAVAILABLE {
        return Err(AppError::invalid_input("obs_not_configured"));
    }
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        return Err(AppError::network(format!("下载失败 ({status}): {text}")));
    }

    resp.bytes()
        .map(|b| b.to_vec())
        .map_err(|e| AppError::network(format!("read response body failed: {e}")))
}

#[tauri::command]
pub async fn server_upload_bytes(
    base_url: String,
    token: String,
    path: String,
    content_type: String,
    content_hash: Option<String>,
    data: Vec<u8>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        put_bytes_blocking(
            &base_url,
            &token,
            &path,
            &content_type,
            content_hash.as_deref(),
            None,
            None,
            data,
        )
    })
    .await
    .map_err(|e| AppError::internal(format!("upload task failed: {e}")))?
}

#[tauri::command]
pub async fn server_download_bytes(
    base_url: String,
    token: String,
    path: String,
) -> Result<Vec<u8>, AppError> {
    tauri::async_runtime::spawn_blocking(move || get_bytes_blocking(&base_url, &token, &path))
        .await
        .map_err(|e| AppError::internal(format!("download task failed: {e}")))?
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServerPublicConfigDto {
    pub obs_enabled: bool,
    pub max_content_bytes: u64,
    #[serde(default = "default_model_policy_mode")]
    pub model_policy_mode: String,
    #[serde(default)]
    pub requirements_only_models: Vec<String>,
}

fn default_model_policy_mode() -> String {
    "open".into()
}

#[tauri::command]
pub async fn server_fetch_public_config(
    base_url: String,
) -> Result<ServerPublicConfigDto, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let url = format!(
            "{}/api/v1/server/config",
            normalize_base_url(&base_url)
        );
        let client = build_client()?;
        let resp = client
            .get(&url)
            .send()
            .map_err(|e| AppError::network(format!("无法连接中央服务: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().unwrap_or_default();
            return Err(AppError::network(format!(
                "fetch config failed ({status}): {body}"
            )));
        }

        resp.json::<ServerPublicConfigDto>()
            .map_err(|e| AppError::internal(format!("invalid config response: {e}")))
    })
    .await
    .map_err(|e| AppError::internal(format!("config task failed: {e}")))?
}

#[tauri::command]
pub async fn server_health(base_url: String) -> Result<bool, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let url = format!("{}/health", normalize_base_url(&base_url));
        let client = build_client()?;
        let resp = client
            .get(&url)
            .send()
            .map_err(|e| AppError::network(format!("无法连接中央服务: {e}")))?;
        Ok(resp.status().is_success())
    })
    .await
    .map_err(|e| AppError::internal(format!("health task failed: {e}")))?
}
