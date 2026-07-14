# 规则目录（rule-catalog）

供 CI 审查员引用。`SKILL.md` 只保留摘要；完整说明与示例见本文。

## blocker 规则

| rule ID | 说明 | 典型证据 |
|---------|------|----------|
| `security/hardcoded-secret` | 硬编码密码、API Key、私钥、含真实凭据的连接串 | `.env`、源码中的 `AKIA…`、`sk-…` |
| `security/injection` | SQL/命令/模板拼接未参数化的用户输入 | 字符串拼接 SQL、`exec(userInput)` |
| `security/xss` | 未转义输出到 HTML/DOM | `innerHTML = userData` |
| `security/missing-auth` | 新增/修改 API、路由、CLI 缺少权限校验 | 无 middleware / guard 的新 endpoint |
| `logic/critical-bug` | diff 内可判定的明显逻辑错误 | 空指针、越界、死循环、资源泄漏 |
| `breaking/undocumented` | 破坏性变更且 MR/提交说明未提及 | 删公共 API、改 DB schema 无说明 |
| `dependency/banned` | 引入组织禁用库或危险 API | 见 SKILL.md「禁用清单」 |

## major 规则（默认 warning，可配置 `fail_on=major`）

| rule ID | 说明 |
|---------|------|
| `quality/duplication` | 重复代码块 > 30 行未抽取 |
| `quality/missing-docs` | 公开函数/接口无文档或类型 |
| `quality/missing-tests` | 核心业务复杂分支缺单测 |
| `style/unclear-naming` | 魔法数字、含糊命名（`tmp`, `data1`） |

## minor / info

| rule ID | 说明 |
|---------|------|
| `style/formatting` | 格式不一致（非组织强制 formatter 范围） |
| `info/unverifiable` | diff 不足以判断，不得升格为 blocker |

## 判定原则

1. **仅审查本次 diff**，未变更文件一律忽略。
2. **证据不足 → `info`**，禁止臆造 blocker。
3. **同一问题同一 rule ID**，避免重复 findings。
4. 跳过路径见 `SKILL.md`「审查范围」。
