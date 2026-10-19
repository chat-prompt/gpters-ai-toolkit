# pii-mask

도구가 돌아간 뒤, Claude가 결과를 읽기 **직전에** 민감정보를 가리는 mod. 원본 파일·DB는 건드리지 않는다. 슬랙 봇(OpenClaw) 기준으로 만들었다.

| 상황 | 가리는 것 |
|---|---|
| 평소 (권한 있는 사람의 업무 요청·자동화) | API 키·토큰·비밀번호만 |
| 개인정보 권한 없는 요청자 / 외부 슬랙 워크스페이스 / 디스코드·텔레그램 등 외부 메신저 / 메시지에 "가림모드" | 위 + 전화번호(뒤 4자리만 남김)·이메일(첫 글자+도메인)·주민번호 뒷자리 |
| 세션 첫 메시지를 아직 못 봤을 때 | 안전하게 개인정보까지 |

- 한 번 개인정보까지 가리는 모드가 된 세션은 끝까지 그 모드를 유지한다.
- 가린 값은 기록에 남지 않고 건수만 로그에 남는다.
- 마스킹 중 오류가 나면 원문을 흘리지 않고 결과를 통째로 숨긴다.

## 설치

터미널 세션 프롬프트에서:

```
/plugin install pii-mask --marketplace chat-prompt/gpters-ai-toolkit
```

셸에서:

```bash
claude plugin install pii-mask --marketplace chat-prompt/gpters-ai-toolkit
```

이미 `gpters-ai-toolkit` 플러그인을 쓰고 있으면 `/plugin install pii-mask@chat-prompt-gpters-ai-toolkit` 로도 된다. 설치 전부터 떠 있던 Claude·봇 세션은 재시작해야 적용된다.

확인: 봇에게 `echo "Bearer abcdefghijklmnop1234"` 를 시켜 결과가 `Bearer [토큰 가림]` 으로 보이면 정상.

## 개인 설정

설치할 때 나오는 화면이나 `/config` 에서 바꾼다. `~/.claude/settings.json` 에 직접 쓸 때는 `pluginConfigs["pii-mask@chat-prompt-gpters-ai-toolkit"].options`.

| 설정 | 기본값 | 뜻 |
|---|---|---|
| `piiAllowedIds` | (비어 있음) | 개인정보를 그대로 봐도 되는 슬랙 User ID. 쉼표로 구분. 예: `U0XXXXXXXXX,U0YYYYYYYYY` |
| `homeWorkspaceId` | (비어 있음) | 우리 슬랙 워크스페이스 Team ID. 이 밖에서 온 요청은 발신자와 상관없이 개인정보까지 가린다 |

**`piiAllowedIds` 를 비워 두면 사람이 보낸 슬랙 요청은 전부 개인정보까지 가린다.** 업무에서 번호·메일이 필요하면 채운다. 관리자가 번호를 보려면 `homeWorkspaceId` 도 채워야 한다 — 비어 있으면 워크스페이스 정보가 붙은 메시지는 모두 외부로 본다. 토큰·키는 설정과 상관없이 항상 가린다.

설정과 상관없이 토큰·키만 가리는 경우가 둘 있다: 발신자가 봇(`is_bot: true`, 형제봇·자동화)일 때, 메시지에 발신자 정보(`sender`)가 없을 때(터미널에서 직접 쓰는 세션 등). 단 외부 워크스페이스·외부 메신저·"가림모드"이거나, 세션이 이미 개인정보까지 가리는 모드가 됐으면 이때도 개인정보까지 가린다.

## 끄기·지우기

```bash
claude plugin disable pii-mask@chat-prompt-gpters-ai-toolkit
claude plugin uninstall pii-mask@chat-prompt-gpters-ai-toolkit
```

## 고치기

- 가리는 규칙은 `hooks/mask.ts` 의 `RULES`. 위에서부터 차례로 적용하고, 토큰을 먼저 가려 숫자 오인을 막는다.
- 발신자·워크스페이스 판정은 슬랙 메시지 메타데이터(`sender`, `group_space`) 기준이다.

```bash
claude plugin validate apps/claude-code-mods/pii-mask
claude plugin test apps/claude-code-mods/pii-mask
```

참고 사례글: https://www.gpters.org/ax-lab/post/claude-code-mod-pii-mask-PFBmhxen9IuDBuP
