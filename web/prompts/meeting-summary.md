---
name: meeting-summary
description: 회의 내용을 구조화된 형식으로 정리하는 프롬프트
author: ai-team
tags: [meeting, documentation, productivity]
---

# Meeting Summary Prompt

회의 녹취록이나 메모를 아래 형식으로 정리해주세요.

## Input

[회의 녹취록 또는 메모를 여기에 붙여넣으세요]

## Output Format

다음 형식으로 회의 내용을 정리해주세요:

```markdown
# 회의 요약

**일시**: [날짜 및 시간]
**참석자**: [참석자 목록]
**목적**: [회의 목적]

## 주요 논의 사항

1. **[주제 1]**
   - 논의 내용
   - 결정 사항

2. **[주제 2]**
   - 논의 내용
   - 결정 사항

## Action Items

| 담당자 | 할 일 | 기한 |
|--------|-------|------|
| @name | 작업 내용 | YYYY-MM-DD |

## 다음 회의

- **일시**: [다음 회의 일정]
- **안건**: [다음 회의 안건]
```

## Tips

- 핵심 결정사항을 명확히 기록하세요
- Action Item은 담당자와 기한을 반드시 포함하세요
- 불명확한 부분은 [확인 필요]로 표시하세요
