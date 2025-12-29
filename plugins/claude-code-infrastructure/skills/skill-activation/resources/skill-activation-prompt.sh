#!/bin/bash
# Skill Auto-Activation Hook
# UserPromptSubmit 이벤트에서 실행되어 관련 skill을 자동으로 제안합니다.

# 설정
RULES_FILE=".claude/skills/skill-rules.json"
MAX_SKILLS=3

# skill-rules.json 존재 확인
if [ ! -f "$RULES_FILE" ]; then
    exit 0
fi

# jq 설치 확인
if ! command -v jq &> /dev/null; then
    exit 0
fi

# 사용자 입력 (환경 변수로 전달됨)
USER_PROMPT="${prompt:-}"

if [ -z "$USER_PROMPT" ]; then
    exit 0
fi

# 소문자로 변환
PROMPT_LOWER=$(echo "$USER_PROMPT" | tr '[:upper:]' '[:lower:]')

# 매칭된 skills 저장
MATCHED_SKILLS=()

# 각 skill에 대해 매칭 체크
while IFS= read -r skill_name; do
    MATCHED=false

    # 1. Keywords 매칭
    keywords=$(jq -r ".\"$skill_name\".keywords // [] | .[]" "$RULES_FILE" 2>/dev/null)
    for keyword in $keywords; do
        if [[ "$PROMPT_LOWER" == *"$keyword"* ]]; then
            MATCHED=true
            break
        fi
    done

    # 2. Intent patterns 매칭 (keywords가 매칭 안 된 경우)
    if [ "$MATCHED" = false ]; then
        patterns=$(jq -r ".\"$skill_name\".intent_patterns // [] | .[]" "$RULES_FILE" 2>/dev/null)
        for pattern in $patterns; do
            if echo "$PROMPT_LOWER" | grep -qE "$pattern"; then
                MATCHED=true
                break
            fi
        done
    fi

    # 매칭된 경우 배열에 추가
    if [ "$MATCHED" = true ]; then
        priority=$(jq -r ".\"$skill_name\".priority // 99" "$RULES_FILE" 2>/dev/null)
        MATCHED_SKILLS+=("$priority:$skill_name")
    fi
done < <(jq -r 'keys[]' "$RULES_FILE" 2>/dev/null)

# 매칭된 skill이 없으면 종료
if [ ${#MATCHED_SKILLS[@]} -eq 0 ]; then
    exit 0
fi

# Priority로 정렬
IFS=$'\n' SORTED_SKILLS=($(sort -t: -k1 -n <<< "${MATCHED_SKILLS[*]}"))
unset IFS

# 상위 N개만 선택
SELECTED_SKILLS=()
for ((i=0; i<${#SORTED_SKILLS[@]} && i<MAX_SKILLS; i++)); do
    skill_name="${SORTED_SKILLS[$i]#*:}"
    SELECTED_SKILLS+=("$skill_name")
done

# 결과 출력
if [ ${#SELECTED_SKILLS[@]} -eq 1 ]; then
    echo ""
    echo "💡 Relevant skill: ${SELECTED_SKILLS[0]}"
    echo "   Consider loading this skill first for best practices."
elif [ ${#SELECTED_SKILLS[@]} -gt 1 ]; then
    echo ""
    echo "💡 Relevant skills: $(IFS=', '; echo "${SELECTED_SKILLS[*]}")"
    echo "   Consider loading these skills before proceeding."
fi
