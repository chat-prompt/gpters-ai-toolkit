#!/bin/bash
# Build Check Hook
# Stop 이벤트에서 실행되어 빌드와 린트 상태를 체크합니다.

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Build & Lint Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 패키지 매니저 감지
if [ -f "pnpm-lock.yaml" ]; then
    PM="pnpm"
elif [ -f "yarn.lock" ]; then
    PM="yarn"
elif [ -f "package-lock.json" ]; then
    PM="npm"
else
    echo "⚠️  No package manager lock file found"
    exit 0
fi

# Build Check
echo ""
echo "📦 Running build..."
BUILD_OUTPUT=$($PM build 2>&1)
BUILD_EXIT=$?

if [ $BUILD_EXIT -eq 0 ]; then
    echo "✅ Build passed"
else
    echo "❌ Build failed"
    echo ""
    echo "$BUILD_OUTPUT" | tail -20
    echo ""
    echo "💡 Fix build errors before continuing"
fi

# Lint Check
echo ""
echo "🔎 Running lint..."
LINT_OUTPUT=$($PM lint 2>&1)
LINT_EXIT=$?

if [ $LINT_EXIT -eq 0 ]; then
    echo "✅ Lint passed"
else
    echo "⚠️  Lint issues found"
    echo ""
    echo "$LINT_OUTPUT" | tail -10
fi

# TypeScript Check (optional)
if [ -f "tsconfig.json" ]; then
    echo ""
    echo "📝 Running type check..."
    TSC_OUTPUT=$(npx tsc --noEmit 2>&1)
    TSC_EXIT=$?

    if [ $TSC_EXIT -eq 0 ]; then
        echo "✅ Types passed"
    else
        ERROR_COUNT=$(echo "$TSC_OUTPUT" | grep -c "error TS")
        echo "❌ $ERROR_COUNT type error(s) found"
        echo ""
        echo "$TSC_OUTPUT" | head -10
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
