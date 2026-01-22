import { BRANCH_GUARD_CONFIG } from "./config"

const KOREAN_TO_ENGLISH: Record<string, string> = {
  "로그인": "login",
  "로그아웃": "logout",
  "회원가입": "signup",
  "회원": "user",
  "사용자": "user",
  "프로필": "profile",
  "설정": "settings",
  "검색": "search",
  "목록": "list",
  "상세": "detail",
  "수정": "edit",
  "삭제": "delete",
  "추가": "add",
  "생성": "create",
  "업로드": "upload",
  "다운로드": "download",
  "결제": "payment",
  "장바구니": "cart",
  "주문": "order",
  "배송": "shipping",
  "리뷰": "review",
  "댓글": "comment",
  "좋아요": "like",
  "북마크": "bookmark",
  "알림": "notification",
  "메시지": "message",
  "채팅": "chat",
  "대시보드": "dashboard",
  "관리자": "admin",
  "통계": "stats",
  "리포트": "report",
  "차트": "chart",
  "그래프": "graph",
  "테이블": "table",
  "폼": "form",
  "버튼": "button",
  "모달": "modal",
  "팝업": "popup",
  "헤더": "header",
  "푸터": "footer",
  "사이드바": "sidebar",
  "네비게이션": "nav",
  "메뉴": "menu",
  "탭": "tab",
  "페이지": "page",
  "화면": "screen",
  "컴포넌트": "component",
  "기능": "feature",
  "홈": "home",
  "메인": "main",
  "인증": "auth",
  "권한": "permission",
  "에러": "error",
  "로딩": "loading",
  "입력": "input",
  "출력": "output",
  "파일": "file",
  "이미지": "image",
  "비디오": "video",
  "오디오": "audio",
  "문서": "document",
  "게시판": "board",
  "게시글": "post",
  "카테고리": "category",
  "태그": "tag",
  "필터": "filter",
  "정렬": "sort",
  "페이징": "paging",
  "무한스크롤": "infinite-scroll",
  "스켈레톤": "skeleton",
  "토스트": "toast",
  "툴팁": "tooltip",
  "드롭다운": "dropdown",
  "아코디언": "accordion",
  "캐러셀": "carousel",
  "슬라이더": "slider",
  "프로그레스": "progress",
  "스피너": "spinner",
  "아바타": "avatar",
  "뱃지": "badge",
  "카드": "card",
  "리스트": "list",
  "그리드": "grid",
  "레이아웃": "layout",
  "푸시": "push",
  "웹소켓": "websocket",
  "소셜": "social",
  "공유": "share",
  "초대": "invite",
  "친구": "friend",
  "팔로우": "follow",
  "구독": "subscription",
  "포인트": "point",
  "쿠폰": "coupon",
  "이벤트": "event",
  "배너": "banner",
  "광고": "ad",
  "분석": "analytics",
  "대화": "conversation",
}

const STOP_WORDS = [
  "만들어줘", "해줘", "추가해줘", "구현해줘", "개발해줘", "작성해줘", "만들어", "해", "줘",
  "부탁해", "하고싶어", "하고 싶어", "할게", "할래", "하자", "좀",
  "please", "create", "make", "add", "implement", "develop", "build", "write",
  "can you", "could you", "would you", "i want", "i need", "let's",
]

function koreanToEnglish(text: string): string {
  let result = text.toLowerCase()

  const sortedKeys = Object.keys(KOREAN_TO_ENGLISH).sort((a, b) => b.length - a.length)

  for (const korean of sortedKeys) {
    const english = KOREAN_TO_ENGLISH[korean]
    result = result.replace(new RegExp(korean, "g"), english)
  }

  result = result.replace(/[가-힣]/g, "")

  return result
}

function removeStopWords(text: string): string {
  let result = text.toLowerCase()

  const sortedStopWords = [...STOP_WORDS].sort((a, b) => b.length - a.length)

  for (const word of sortedStopWords) {
    result = result.replace(new RegExp(word, "gi"), "")
  }

  return result
}

function toKebabCase(text: string): string {
  return text
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text

  const truncated = text.substring(0, maxLength)
  const lastHyphen = truncated.lastIndexOf("-")

  if (lastHyphen > maxLength * 0.5) {
    return truncated.substring(0, lastHyphen)
  }

  return truncated
}

export function extractFeatureName(message: string): string {
  let cleaned = removeStopWords(message)
  cleaned = koreanToEnglish(cleaned)
  cleaned = toKebabCase(cleaned)
  cleaned = truncate(cleaned, 30)

  return cleaned || BRANCH_GUARD_CONFIG.fallbackName
}

export function getDatePrefix(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}${month}${day}`
}

export function generateBranchName(message: string): string {
  const date = getDatePrefix()
  const feature = extractFeatureName(message)
  return `${BRANCH_GUARD_CONFIG.branchPrefix}${date}-${feature}`
}
