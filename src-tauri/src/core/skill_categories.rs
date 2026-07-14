/// Canonical business categories for Skills (see docs / SKILL.md `category` field).
pub const CATEGORY_IDS: &[&str] = &[
    "code-style",
    "project-structure",
    "dev-workflow",
    "testing",
    "product",
    "ui-design",
    "devops",
    "other",
];

/// Normalize user/frontmatter input to a known category id, or `None` if empty/invalid.
pub fn normalize_category(raw: &str) -> Option<String> {
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }
    let key = s.to_ascii_lowercase().replace('_', "-");
    if CATEGORY_IDS.contains(&key.as_str()) {
        return Some(key);
    }
    // Common Chinese aliases (manual entry / legacy)
    let mapped = match key.as_str() {
        "代码规范" | "code规范" => "code-style",
        "项目结构" | "项目结构规范" => "project-structure",
        "开发流程" | "写代码流程" | "写代码流程规范" | "代码审查" => "dev-workflow",
        "测试" | "测试规则" | "代码测试" => "testing",
        "产品" | "产品需求" => "product",
        "ui" | "ui设计" | "设计" => "ui-design",
        "运维" | "ci" => "devops",
        "其他" => "other",
        _ => return None,
    };
    Some(mapped.to_string())
}
