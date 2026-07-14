# 组织禁用依赖与 API（banned-deps）

维护本清单后，在 `SKILL.md` 的「禁止依赖/API」中引用本文。审查员命中时输出 `rule: dependency/banned`。

## 危险 API / 模式

| 模式 | 语言/框架 | 说明 |
|------|-----------|------|
| `eval(` | JS/TS/Python | 动态执行不可信输入 |
| `innerHTML =` + 用户输入 | 浏览器 | XSS 风险 |
| `document.write(` | 浏览器 | 遗留 XSS 面 |
| 字符串拼接 SQL | 任意 | 应使用参数化查询 |
| `shell=True` + 用户输入 | Python subprocess | 命令注入 |

## 禁用 npm 包（示例）

> 按组织安全扫描结果维护，以下为占位示例。

| 包名 | 原因 | 替代 |
|------|------|------|
| `request` | 已废弃、无维护 | `axios` / `node-fetch` |
| （示例）`lodash` `<4.17.21` | 已知原型污染 CVE | 升级至修复版本 |

## 禁用 Rust crate（示例）

| crate | 原因 |
|-------|------|
| （按 cargo-audit 结果填写） | |

## 禁用 Python 包（示例）

| 包名 | 原因 |
|------|------|
| （按 pip-audit 结果填写） | |

## 维护流程

1. 安全团队 / 平台组更新本文件
2. bump `SKILL.md` → `metadata.version`
3. 上传中央仓库
4. 可选：在 `references/fixtures/` 增加对应 Golden 样例
