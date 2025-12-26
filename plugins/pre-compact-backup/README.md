# Pre-Compact Transcript Backup

Compaction 전에 현재 세션의 대화 내역(transcript)을 자동으로 백업합니다. 중요한 작업 내역을 보존하여 컨텍스트 손실을 방지합니다.

## Type
Hook

## Event
`PreCompact`

## Author
gpters

## Tags
`automation`, `workflow`, `backup`

## Installation

Add the following to your `~/.claude/settings.json` or `.claude/settings.local.json`:

```json
{
  "hooks": {
    "PreCompact": [
{
            "hooks": [
                  {
                        "type": "command",
                        "command": "mkdir -p ~/claude-backups && cp \"$transcript_path\" ~/claude-backups/transcript-$(echo $session_id | cut -c1-8)-$(date +%Y%m%d-%H%M%S).jsonl",
                        "timeout": 30000,
                        "blocking": true
                  }
            ]
      }
    ]
  }
}
```

---

*Part of [GPTers AI Toolkit](https://github.com/chat-prompt/gpters-ai-toolkit)*
