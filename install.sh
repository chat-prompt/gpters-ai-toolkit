#!/bin/bash

# AI Toolkit 설치 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLKIT_DIR="$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}==============================${NC}"
echo -e "${BLUE}  AI Toolkit 설치${NC}"
echo -e "${BLUE}==============================${NC}"
echo ""

# 1. bin 디렉토리 생성 및 aitk 설치
echo -e "${YELLOW}[1/3]${NC} CLI 도구 설치 중..."
mkdir -p "$HOME/bin"
chmod +x "$TOOLKIT_DIR/bin/aitk"
ln -sf "$TOOLKIT_DIR/bin/aitk" "$HOME/bin/aitk"
echo -e "  ${GREEN}✓${NC} aitk 명령어 설치됨"

# 2. PATH 설정
echo -e "${YELLOW}[2/3]${NC} PATH 설정 중..."

SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
fi

if [ -n "$SHELL_RC" ]; then
    # PATH 추가
    if ! grep -q 'export PATH="$HOME/bin' "$SHELL_RC" 2>/dev/null; then
        echo '' >> "$SHELL_RC"
        echo '# AI Toolkit' >> "$SHELL_RC"
        echo 'export PATH="$HOME/bin:$PATH"' >> "$SHELL_RC"
        echo -e "  ${GREEN}✓${NC} PATH 추가됨 ($SHELL_RC)"
    else
        echo -e "  ${GREEN}✓${NC} PATH 이미 설정됨"
    fi

    # AITK_HOME 설정
    if ! grep -q 'export AITK_HOME=' "$SHELL_RC" 2>/dev/null; then
        echo "export AITK_HOME=\"$TOOLKIT_DIR\"" >> "$SHELL_RC"
        echo -e "  ${GREEN}✓${NC} AITK_HOME 설정됨"
    fi
fi

# 3. Claude 디렉토리 생성
echo -e "${YELLOW}[3/3]${NC} Claude 디렉토리 생성 중..."
mkdir -p "$HOME/.claude/skills"
mkdir -p "$HOME/.claude/agents"
echo -e "  ${GREEN}✓${NC} ~/.claude/skills 생성됨"
echo -e "  ${GREEN}✓${NC} ~/.claude/agents 생성됨"

echo ""
echo -e "${GREEN}==============================${NC}"
echo -e "${GREEN}  설치 완료!${NC}"
echo -e "${GREEN}==============================${NC}"
echo ""
echo "다음 명령어를 실행하거나 터미널을 재시작하세요:"
echo ""
echo -e "  ${BLUE}source $SHELL_RC${NC}"
echo ""
echo "사용법:"
echo "  aitk list          # 사용 가능한 스킬/에이전트 목록"
echo "  aitk install all   # 모든 스킬/에이전트 설치"
echo "  aitk new skill X   # 새 스킬 생성"
echo "  aitk help          # 도움말"
echo ""
