# @gpters-internal/opencode

GPTers OpenCode Plugin - OpenCode 확장 플러그인

## 설치

### macOS / Linux (Bash)

터미널에서 아래 명령어를 복사해서 실행하세요:

```bash
# 1. Private Registry 설정
mkdir -p ~/.cache/opencode
cat > ~/.cache/opencode/.npmrc << 'EOF'
@gpters-internal:registry=https://verdaccio.gpters.org
//verdaccio.gpters.org/:_authToken=<YOUR_TOKEN>
EOF

# 2. opencode.json에 플러그인 추가 (프로젝트 루트에서 실행)
[ ! -f opencode.json ] && echo '{"$schema":"https://opencode.ai/config.json","plugin":[]}' > opencode.json
bun -e "const fs=require('fs'),f='opencode.json',c=JSON.parse(fs.readFileSync(f,'utf8'));c.plugin=c.plugin||[];c.plugin.includes('@gpters-internal/opencode')||c.plugin.push('@gpters-internal/opencode');fs.writeFileSync(f,JSON.stringify(c,null,2))"
```

### Windows (PowerShell)

PowerShell에서 아래 명령어를 복사해서 실행하세요:

```powershell
# 1. Private Registry 설정
$cacheDir = "$env:LOCALAPPDATA\opencode"
if (!(Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir -Force }
@"
@gpters-internal:registry=https://verdaccio.gpters.org
//verdaccio.gpters.org/:_authToken=<YOUR_TOKEN>
"@ | Set-Content "$cacheDir\.npmrc"

# 2. opencode.json에 플러그인 추가 (프로젝트 루트에서 실행)
if (!(Test-Path "opencode.json")) {
    '{"$schema":"https://opencode.ai/config.json","plugin":[]}' | Set-Content "opencode.json"
}
$config = Get-Content "opencode.json" | ConvertFrom-Json
if (!$config.plugin) { $config | Add-Member -NotePropertyName "plugin" -NotePropertyValue @() }
if ($config.plugin -notcontains "@gpters-internal/opencode") {
    $config.plugin += "@gpters-internal/opencode"
}
$config | ConvertTo-Json -Depth 10 | Set-Content "opencode.json"
```

> `<YOUR_TOKEN>`을 팀에서 제공받은 토큰으로 교체하세요.

### 수동 설치

#### 1. Registry 설정

| OS | 파일 경로 |
|----|----------|
| macOS/Linux | `~/.cache/opencode/.npmrc` |
| Windows | `%LOCALAPPDATA%\opencode\.npmrc` |

위 경로에 아래 내용으로 파일 생성:

```
@gpters-internal:registry=https://verdaccio.gpters.org
//verdaccio.gpters.org/:_authToken=<YOUR_TOKEN>
```

#### 2. Plugin 설정

프로젝트 루트의 `opencode.json`에 추가:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@gpters-internal/opencode"]
}
```

> 이미 `opencode.json`이 있다면 `plugin` 배열에 `"@gpters-internal/opencode"`만 추가하세요.

#### 4. 적용

OpenCode를 재시작하면 자동으로 플러그인이 설치됩니다.

## 기능

- Event hooks (session, message, tool events)
- Custom tools (확장 가능)
- Stop hook (워크플로우 강제)

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
```

### 로컬 테스트

> `file://` 프로토콜은 작동하지 않습니다. plugins 디렉토리 + 심볼릭 링크 방식을 사용하세요.

#### 1. 심볼릭 링크 생성

```bash
# plugins 디렉토리 생성 및 심볼릭 링크
mkdir -p ~/.config/opencode/plugins
ln -sf /absolute/path/to/gpters-ai-toolkit/apps/opencode-plugin/dist/index.js ~/.config/opencode/plugins/gpters-plugin.js
```

#### 2. opencode.json 설정

`~/.config/opencode/opencode.json`의 plugin 배열에 추가:

```json
{
  "plugin": [
    "gpters-plugin"
  ]
}
```

> 파일명(확장자 제외)으로 참조합니다.

#### 3. 개발 워크플로우

```bash
# 코드 수정 후
pnpm build

# OpenCode 재시작 (심볼릭 링크가 자동으로 최신 빌드 참조)
```

#### 4. 배포 버전으로 전환

로컬 테스트 완료 후 배포 버전으로 전환:

```json
{
  "plugin": [
    "@gpters-internal/opencode@latest"
  ]
}
```

> 심볼릭 링크는 삭제하지 않아도 됩니다. 나중에 다시 개발할 때 설정만 바꾸면 됩니다.

## 배포

main 브랜치에 merge 시 자동으로 Verdaccio에 배포됩니다.

또는 Release Action을 수동 트리거하세요.
