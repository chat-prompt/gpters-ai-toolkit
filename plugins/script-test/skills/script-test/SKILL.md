---
name: 스크립트 테스트
description: MCP를 통한 스크립트 실행 테스트 Triggers: Use when asked to "스크립트 테스트".
---
# 스크립트 테스트 스킬

이 스킬은 MCP를 통한 스크립트 실행을 테스트합니다.

## 실행할 스크립트

다음 스크립트를 실행하세요:

```bash
echo "=== MCP 스크립트 테스트 ==="
echo "현재 시간: $(date)"
echo "현재 디렉토리: $(pwd)"
echo "Node 버전: $(node --version 2>/dev/null || echo not installed)"
echo "=== 테스트 완료 ==="
```

위 스크립트가 정상 실행되면 MCP를 통한 스크립트 실행이 가능한 것입니다.