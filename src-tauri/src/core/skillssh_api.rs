use anyhow::{Context, Result};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsShSkill {
    pub id: String,
    pub skill_id: String,
    pub name: String,
    pub source: String,
    pub installs: u64,
}

#[derive(Debug, Clone, Copy)]
pub enum LeaderboardType {
    AllTime,
    Trending,
    Hot,
}

impl LeaderboardType {
    pub fn from_str(s: &str) -> Self {
        match s {
            "trending" => Self::Trending,
            "hot" => Self::Hot,
            _ => Self::AllTime,
        }
    }

    fn url(&self) -> &str {
        match self {
            Self::AllTime => "https://skills.sh/",
            Self::Trending => "https://skills.sh/trending",
            Self::Hot => "https://skills.sh/hot",
        }
    }
}

pub fn build_http_client(proxy_url: Option<&str>, timeout_secs: u64) -> reqwest::blocking::Client {
    let mut builder = reqwest::blocking::Client::builder()
        .user_agent("xinhong-skills")
        .timeout(std::time::Duration::from_secs(timeout_secs));
    if let Some(proxy) = proxy_url.filter(|s| !s.is_empty()) {
        if let Ok(p) = reqwest::Proxy::all(proxy) {
            builder = builder.proxy(p);
        }
    }
    builder.build().unwrap_or_default()
}

const LEADERBOARD_TIMEOUT_SECS: u64 = 45;
const SEARCH_TIMEOUT_SECS: u64 = 20;

pub fn fetch_leaderboard(
    board: LeaderboardType,
    proxy_url: Option<&str>,
) -> Result<Vec<SkillsShSkill>> {
    let client = build_http_client(proxy_url, LEADERBOARD_TIMEOUT_SECS);

    let html = client
        .get(board.url())
        .send()
        .context("Failed to fetch skills.sh")?
        .text()
        .context("Failed to read response")?;

    parse_leaderboard_html(&html)
}

fn parse_leaderboard_html(html: &str) -> Result<Vec<SkillsShSkill>> {
    if let Ok(skills) = parse_initial_skills_rsc(html) {
        if !skills.is_empty() {
            return Ok(skills);
        }
    }

    if let Ok(skills) = parse_next_data(html) {
        if !skills.is_empty() {
            return Ok(skills);
        }
    }

    let skills = parse_embedded_skill_objects(html)?;
    if skills.is_empty() {
        log::warn!("Could not find skills in skills.sh HTML");
    }
    Ok(skills)
}

/// Parse skills embedded in Next.js RSC payloads (`initialSkills` array).
fn parse_initial_skills_rsc(html: &str) -> Result<Vec<SkillsShSkill>> {
    for marker in [r#""initialSkills":"#, r#"\"initialSkills\":"#] {
        if let Some(raw) = extract_bracket_array(html, marker) {
            let json = unescape_rsc_json(&raw);
            if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&json) {
                let skills = parse_skills_array(&arr);
                if !skills.is_empty() {
                    return Ok(skills);
                }
            }
        }
    }
    Ok(Vec::new())
}

fn extract_bracket_array(html: &str, marker: &str) -> Option<String> {
    let idx = html.find(marker)?;
    let rest = &html[idx + marker.len()..];
    let bracket_offset = rest.find('[')?;
    let start = idx + marker.len() + bracket_offset;
    let bytes = html.as_bytes();
    let mut depth = 0usize;
    for (offset, &byte) in bytes[start..].iter().enumerate() {
        match byte {
            b'[' => depth += 1,
            b']' => {
                depth -= 1;
                if depth == 0 {
                    return Some(html[start..start + offset + 1].to_string());
                }
            }
            _ => {}
        }
    }
    None
}

fn unescape_rsc_json(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.peek() {
                Some('"') => {
                    chars.next();
                    out.push('"');
                }
                Some('\\') => {
                    chars.next();
                    out.push('\\');
                }
                _ => out.push(c),
            }
        } else {
            out.push(c);
        }
    }
    out
}

fn parse_next_data(html: &str) -> Result<Vec<SkillsShSkill>> {
    let marker = r#"<script id="__NEXT_DATA__" type="application/json">"#;
    let start = html
        .find(marker)
        .ok_or_else(|| anyhow::anyhow!("__NEXT_DATA__ not found"))?
        + marker.len();

    let end = html[start..]
        .find("</script>")
        .ok_or_else(|| anyhow::anyhow!("Closing script tag not found"))?
        + start;

    let json_str = &html[start..end];
    let data: serde_json::Value =
        serde_json::from_str(json_str).context("Failed to parse __NEXT_DATA__ JSON")?;

    let skills_array = data
        .pointer("/props/pageProps/initialSkills")
        .or_else(|| data.pointer("/props/pageProps/skills"))
        .or_else(|| data.pointer("/props/pageProps/items"))
        .and_then(|v| v.as_array());

    match skills_array {
        Some(arr) => Ok(parse_skills_array(arr)),
        None => Ok(Vec::new()),
    }
}

fn parse_skills_array(arr: &[serde_json::Value]) -> Vec<SkillsShSkill> {
    let mut seen = HashSet::new();
    let mut skills = Vec::new();

    for item in arr {
        let source = item
            .get("source")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let skill_id = item
            .get("skillId")
            .or_else(|| item.get("skill_id"))
            .or_else(|| item.get("id"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        if source.is_empty() || skill_id.is_empty() {
            continue;
        }

        let id = format!("{}/{}", source, skill_id);
        if !seen.insert(id.clone()) {
            continue;
        }

        let name = item
            .get("name")
            .and_then(|v| v.as_str())
            .filter(|v| !v.is_empty())
            .unwrap_or(&skill_id)
            .to_string();
        let installs = item.get("installs").and_then(|v| v.as_u64()).unwrap_or(0);

        skills.push(SkillsShSkill {
            id,
            skill_id,
            name,
            source,
            installs,
        });
    }

    skills
}

fn parse_embedded_skill_objects(html: &str) -> Result<Vec<SkillsShSkill>> {
    let pattern = Regex::new(
        r#"(?:\\)?\"source(?:\\)?\":(?:\\)?\"(?P<source>[^"\\]+)(?:\\)?\",(?:[^{}]|\\.)*?(?:(?:\\)?\"skillId(?:\\)?\"|(?:\\)?\"skill_id(?:\\)?\"):(?:\\)?\"(?P<skill_id>[^"\\]+)(?:\\)?\",(?:[^{}]|\\.)*?(?:\\)?\"name(?:\\)?\":(?:\\)?\"(?P<name>[^"\\]*)(?:\\)?\",(?:[^{}]|\\.)*?(?:\\)?\"installs(?:\\)?\":(?P<installs>\d+)"#,
    )
    .context("Failed to build skills.sh regex")?;

    let fallback_pattern = Regex::new(
        r#"\{"source":"(?P<source>[^"]+)","skill_id":"(?P<skill_id>[^"]+)"(?:,"name":"(?P<name>[^"]*)")?(?:.*?"installs":(?P<installs>\d+))?\}"#,
    )
    .context("Failed to build fallback skills.sh regex")?;

    let mut skills = parse_embedded_with_regex(html, &pattern);
    if skills.is_empty() {
        skills = parse_embedded_with_regex(html, &fallback_pattern);
    }

    Ok(skills)
}

fn parse_embedded_with_regex(html: &str, pattern: &Regex) -> Vec<SkillsShSkill> {
    let mut seen = HashSet::new();
    let mut skills = Vec::new();

    for caps in pattern.captures_iter(html) {
        let source = match caps.name("source") {
            Some(v) => v.as_str().replace(r#"\""#, "\""),
            None => continue,
        };
        let skill_id = match caps.name("skill_id") {
            Some(v) => v.as_str().replace(r#"\""#, "\""),
            None => continue,
        };

        let id = format!("{}/{}", source, skill_id);
        if !seen.insert(id.clone()) {
            continue;
        }

        let name = caps
            .name("name")
            .map(|v| v.as_str().replace(r#"\""#, "\""))
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| skill_id.clone());
        let installs = caps
            .name("installs")
            .and_then(|v| v.as_str().parse::<u64>().ok())
            .unwrap_or(0);

        skills.push(SkillsShSkill {
            id,
            skill_id,
            name,
            source,
            installs,
        });
    }

    skills
}

pub fn search_skills(
    query: &str,
    limit: usize,
    proxy_url: Option<&str>,
) -> Result<Vec<SkillsShSkill>> {
    let client = build_http_client(proxy_url, SEARCH_TIMEOUT_SECS);

    let url = format!(
        "https://skills.sh/api/search?q={}&limit={}",
        urlencoding::encode(query),
        limit
    );

    let resp: serde_json::Value = client
        .get(&url)
        .send()
        .context("Failed to search skills.sh")?
        .json()
        .context("Failed to parse search response")?;

    if let Some(arr) = resp.as_array() {
        return Ok(parse_skills_array(arr));
    }

    let skills_array = resp.get("skills").and_then(|v| v.as_array());
    match skills_array {
        Some(arr) => Ok(parse_skills_array(arr)),
        None => Ok(Vec::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_embedded_skill_objects, parse_next_data};

    #[test]
    fn parses_legacy_next_data_payload() {
        let html = r#"
        <html>
          <script id="__NEXT_DATA__" type="application/json">
            {"props":{"pageProps":{"initialSkills":[{"source":"antfu/skills","skillId":"vite","name":"vite","installs":152}]}}}
          </script>
        </html>
        "#;

        let skills = parse_next_data(html).expect("legacy payload should parse");
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].id, "antfu/skills/vite");
    }

    #[test]
    fn parses_initial_skills_rsc_payload() {
        let html = r#"
        self.__next_f.push([1,"{\"initialSkills\":[{\"source\":\"halt-catch-fire/skills\",\"skillId\":\"ai-video-generation\",\"name\":\"ai-video-generation\",\"installs\":21421},{\"source\":\"vercel-labs/agent-skills\",\"skillId\":\"find-skills\",\"name\":\"find-skills\",\"installs\":528085}]}\n"])
        "#;

        let skills = super::parse_initial_skills_rsc(html).expect("initialSkills payload should parse");
        assert_eq!(skills.len(), 2);
        assert_eq!(skills[0].id, "halt-catch-fire/skills/ai-video-generation");
        assert_eq!(skills[1].id, "vercel-labs/agent-skills/find-skills");
    }

    #[test]
    fn parses_current_rsc_payload() {
        let html = r#"
        <script>self.__next_f.push([1,"...\n[{\"source\":\"anthropics/skills\",\"skillId\":\"template-skill\",\"name\":\"template-skill\",\"installs\":238},{\"source\":\"vercel/ai\",\"skillId\":\"ai-sdk\",\"name\":\"ai-sdk\",\"installs\":265}]...\n"])</script>
        "#;

        let skills = parse_embedded_skill_objects(html).expect("rsc payload should parse");
        assert_eq!(skills.len(), 2);
        assert_eq!(skills[0].id, "anthropics/skills/template-skill");
        assert_eq!(skills[1].id, "vercel/ai/ai-sdk");
    }

    #[test]
    fn parses_legacy_embedded_payload() {
        let html = r#"
        {"source":"openai/skills","skill_id":"playwright","name":"playwright","installs":2}
        "#;

        let skills = parse_embedded_skill_objects(html).expect("legacy fallback should parse");
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].id, "openai/skills/playwright");
    }
}
