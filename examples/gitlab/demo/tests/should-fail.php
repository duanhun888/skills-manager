<?php
/**
 * Demo: 应失败审查的示例（硬编码密钥 — 仅用于试点测试）
 * 提交此文件后 skills-review job 应变红
 */
$apiKey = 'sk-live-hardcoded-secret-for-ci-demo-only';

function getConfig(): array
{
    global $apiKey;
    return ['api_key' => $apiKey];
}
