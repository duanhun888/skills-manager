#!/usr/bin/env sh
# 芯宏 Skills 中央仓库 — 提交/合并代码审查脚本
# 从中央 API 拉取 org Skill，将 diff 送 Review Service，符合则 exit 0，不符合则 exit 1
#
# 环境变量（GitLab CI / 本地 hook 共用）:
#   SKILLS_SERVER_URL
#   SKILLS_CI_USERNAME / SKILLS_CI_PASSWORD
#   REVIEW_SERVICE_URL   可选；未设置时使用 SKILLS_SERVER_URL/api/v1/review
#   SKILLS_REVIEW_SKILL_NAME   默认 org-code-review
#   SKILLS_REVIEW_SKILL_HASH   可选 pin
#   SKILLS_REVIEW_FAIL_ON      blocker | major（默认 blocker）
#   SKILLS_REVIEW_EVENT        push | merge（由 CI 传入）
#   SKILLS_REVIEW_BASE_SHA / SKILLS_REVIEW_HEAD_SHA / SKILLS_REVIEW_REF
#   CI_PROJECT_URL / CI_MERGE_REQUEST_IID（可选）

set -eu

SKILLS_REVIEW_SKILL_NAME="${SKILLS_REVIEW_SKILL_NAME:-org-code-review}"
SKILLS_REVIEW_FAIL_ON="${SKILLS_REVIEW_FAIL_ON:-blocker}"
REPORT_FILE="${SKILLS_REVIEW_REPORT:-review-report.json}"

die() { echo "skills-review: $*" >&2; exit 1; }

need() { test -n "${!1:-}" || die "missing env: $1"; }

need SKILLS_SERVER_URL
need SKILLS_CI_USERNAME
need SKILLS_CI_PASSWORD

BASE_URL="${SKILLS_SERVER_URL%/}"
REVIEW_URL="${REVIEW_SERVICE_URL:-${BASE_URL}/api/v1/review}"
EVENT="${SKILLS_REVIEW_EVENT:-push}"

echo "=== Skills review ($EVENT) ==="
echo "skill: $SKILLS_REVIEW_SKILL_NAME"
echo "review: $REVIEW_URL"

TOKEN=$(curl -sf -X POST "${BASE_URL}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${SKILLS_CI_USERNAME}\",\"password\":\"${SKILLS_CI_PASSWORD}\"}" \
  | jq -r '.access_token') || die "login failed"
test -n "$TOKEN" && test "$TOKEN" != "null" || die "empty token"

SKILL_ID=$(curl -sf "${BASE_URL}/api/v1/skills?scope=org" \
  -H "Authorization: Bearer ${TOKEN}" \
  | jq -r --arg n "$SKILLS_REVIEW_SKILL_NAME" '.[] | select(.name==$n) | .id' | head -1)
test -n "$SKILL_ID" || die "org skill not found: $SKILLS_REVIEW_SKILL_NAME"

if [ -n "${SKILLS_REVIEW_SKILL_HASH:-}" ]; then
  SKILL_HASH="$SKILLS_REVIEW_SKILL_HASH"
else
  SKILL_HASH=$(curl -sf "${BASE_URL}/api/v1/skills/${SKILL_ID}" \
    -H "Authorization: Bearer ${TOKEN}" | jq -r '.content_hash // empty')
fi
echo "skill_id: $SKILL_ID  hash: ${SKILL_HASH:-latest}"

BASE_SHA="${SKILLS_REVIEW_BASE_SHA:-}"
HEAD_SHA="${SKILLS_REVIEW_HEAD_SHA:-}"
REF="${SKILLS_REVIEW_REF:-}"

if [ -z "$BASE_SHA" ] || [ -z "$HEAD_SHA" ]; then
  die "set SKILLS_REVIEW_BASE_SHA and SKILLS_REVIEW_HEAD_SHA"
fi

git fetch origin "$BASE_SHA" "$HEAD_SHA" 2>/dev/null || true
DIFF=$(git diff "$BASE_SHA" "$HEAD_SHA" -- . \
  ':(exclude)*.lock' ':(exclude)*.min.js' || true)

if [ -z "$DIFF" ]; then
  echo '{"passed":true,"summary":"无代码变更","findings":[]}' | jq . | tee "$REPORT_FILE"
  echo "=== PASSED (empty diff) ==="
  exit 0
fi

PAYLOAD=$(jq -n \
  --arg skill_id "$SKILL_ID" \
  --arg skill_hash "$SKILL_HASH" \
  --arg repo "${CI_PROJECT_URL:-}" \
  --arg base "$BASE_SHA" \
  --arg head "$HEAD_SHA" \
  --arg ref "$REF" \
  --arg mr "${CI_MERGE_REQUEST_IID:-}" \
  --arg event "$EVENT" \
  --arg diff "$DIFF" \
  --arg fail_on "$SKILLS_REVIEW_FAIL_ON" \
  '{
    skill_id: $skill_id,
    skill_hash: $skill_hash,
    repo_url: $repo,
    base_sha: $base,
    head_sha: $head,
    ref: $ref,
    merge_request_iid: $mr,
    event: $event,
    diff: $diff,
    fail_on: $fail_on
  }')

REPORT=$(curl -sf -X POST "${REVIEW_URL%/}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "$PAYLOAD") || die "review request failed ($REVIEW_URL)"

echo "$REPORT" | jq . | tee "$REPORT_FILE"
PASSED=$(echo "$REPORT" | jq -r '.passed')

if [ "$PASSED" = "true" ]; then
  echo "=== PASSED ==="
  exit 0
fi

echo "=== FAILED — 不符合中央仓库审查 Skill，提交/合并被拒绝 ===" >&2
jq -r '.findings[]? | select(.severity=="blocker" or .severity=="major") | "- [\(.severity)] \(.file):\(.line) \(.message)"' "$REPORT_FILE" >&2 || true
exit 1
