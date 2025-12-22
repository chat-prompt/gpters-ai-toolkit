---
name: GitHub 기초 사용법
description: 저장소 생성, 커밋, 푸시 등 GitHub 기본 워크플로우
author: gpters-team
tags: [git, beginner, setup]
difficulty: easy
estimatedTime: 20분
---

# GitHub 기초 사용법

코드를 저장하고 버전 관리하는 GitHub 기본 사용법입니다.

## 준비물

- [GitHub 계정](https://github.com/signup)
- [Git 설치](https://git-scm.com/downloads)
- [VS Code](https://code.visualstudio.com/) (권장)

---

## 1단계: Git 초기 설정

터미널에서 한 번만 설정하면 됩니다:

```bash
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

---

## 2단계: 저장소 생성

### GitHub에서 새 저장소 만들기

1. GitHub 접속 → **+** → **New repository**
2. Repository name 입력
3. **Public** 또는 **Private** 선택
4. **Create repository** 클릭

### 로컬 프로젝트 연결

```bash
# 프로젝트 폴더로 이동
cd my-project

# Git 초기화
git init

# GitHub 저장소 연결
git remote add origin https://github.com/username/repo-name.git

# 첫 커밋
git add .
git commit -m "Initial commit"
git push -u origin main
```

---

## 3단계: 기본 워크플로우

### 변경사항 확인

```bash
git status
```

### 파일 스테이징

```bash
# 특정 파일
git add filename.js

# 모든 변경된 파일
git add .
```

### 커밋

```bash
git commit -m "feat: 로그인 기능 추가"
```

### 푸시

```bash
git push
```

---

## 커밋 메시지 작성법

좋은 커밋 메시지 형식:

```
<타입>: <설명>

feat: 새로운 기능 추가
fix: 버그 수정
docs: 문서 수정
style: 코드 포맷팅
refactor: 코드 리팩토링
```

**예시:**

```bash
git commit -m "feat: 사용자 프로필 페이지 추가"
git commit -m "fix: 로그인 버튼 클릭 안 되는 문제 해결"
git commit -m "docs: README 업데이트"
```

---

## 브랜치 사용하기

### 브랜치 생성 및 이동

```bash
# 새 브랜치 생성 + 이동
git checkout -b feature/login

# 또는 최신 방식
git switch -c feature/login
```

### 브랜치 목록 확인

```bash
git branch
```

### main으로 돌아가기

```bash
git checkout main
# 또는
git switch main
```

---

## VS Code에서 Git 사용하기

VS Code는 Git을 시각적으로 사용할 수 있습니다:

1. 왼쪽 **Source Control** 아이콘 클릭 (Ctrl+Shift+G)
2. 변경된 파일 확인
3. **+** 버튼으로 스테이징
4. 메시지 입력 후 **✓** 클릭하여 커밋
5. **...** → **Push**로 푸시

---

## 자주 쓰는 명령어 정리

| 명령어 | 설명 |
|--------|------|
| `git status` | 현재 상태 확인 |
| `git add .` | 모든 변경사항 스테이징 |
| `git commit -m "메시지"` | 커밋 |
| `git push` | 원격 저장소에 업로드 |
| `git pull` | 원격 저장소에서 가져오기 |
| `git log --oneline` | 커밋 히스토리 확인 |

---

## 문제 해결

### "Permission denied" 에러

SSH 키 설정이 필요합니다:

```bash
# SSH 키 생성
ssh-keygen -t ed25519 -C "your@email.com"

# 공개 키 복사
cat ~/.ssh/id_ed25519.pub
```

GitHub → Settings → SSH keys → New SSH key에 붙여넣기

### 충돌(Conflict) 발생 시

```bash
# 최신 변경사항 가져오기
git pull

# 충돌 파일 수정 후
git add .
git commit -m "Resolve merge conflict"
git push
```

---

## 다음 단계

- [Vercel 배포 가이드](/guides/vercel-deploy)
- [환경 변수 관리](/guides/env-variables)
