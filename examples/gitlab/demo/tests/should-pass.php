<?php
/**
 * Demo: 应通过审查的示例（无安全问题）
 */
function greet(string $name): string
{
    return 'Hello, ' . htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
}
