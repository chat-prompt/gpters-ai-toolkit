# @gpters-internal/opencode

GPTers OpenCode Plugin - OpenCode 확장 플러그인

## 설치

```bash
# opencode.json에 추가
{
  "plugins": ["@gpters-internal/opencode"]
}
```

## 개발

```bash
# 의존성 설치
pnpm install

# 빌드
pnpm build

# 개발 모드 (watch)
pnpm dev

# 타입 체크
pnpm typecheck

### 로컬 설치


```bash
# opencode.json에 추가
{
  "plugin": [
    "file:///absolute/path/to/oh-my-opencode/dist/index.js"
  ]
}
```

## 기능

- Event hooks (session, message, tool events)
- Custom tools (확장 가능)
- Stop hook (워크플로우 강제)

## 배포

main 브랜치에 merge 시 자동으로 Verdaccio에 배포됩니다.

```bash
# 변경사항 추가
pnpm changeset

# PR 생성 후 merge → 자동 배포
```
