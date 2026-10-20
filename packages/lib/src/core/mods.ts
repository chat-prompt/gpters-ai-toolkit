/**
 * 팀 마켓플레이스의 Claude Code mod 목록
 *
 * mod 는 `catalog_items` 가 아니라 루트 `.claude-plugin/marketplace.json` 과
 * `apps/claude-code-mods/` 에만 있다. 카탈로그 화면이 이 파일을 그대로 읽어
 * 마켓플레이스에 올린 mod 가 별도 등록 없이 보이게 한다.
 */
import marketplace from '../../../../.claude-plugin/marketplace.json'

/** mod 가 들어 있는 레포 경로 — 이 아래를 가리키는 플러그인만 mod 로 본다 */
const MOD_SOURCE_PREFIX = './apps/claude-code-mods/'

/** mod 소스를 열어볼 GitHub 주소의 앞부분 */
const REPO_TREE_URL = 'https://github.com/chat-prompt/gpters-ai-toolkit/tree/main/'

/** 마켓플레이스 등록 명령 — 이미 등록돼 있으면 오류를 버리고 넘어간다 */
const MARKETPLACE_ADD = 'claude plugin marketplace add chat-prompt/gpters-ai-toolkit 2>/dev/null'

/** 마켓플레이스 파일의 플러그인 항목 중 화면에 쓰는 필드 */
interface MarketplacePlugin {
  name: string
  source: string
  description?: string
  category?: string
}

/** 카탈로그에 보여줄 mod 하나 */
export interface ModSummary {
  /** 플러그인 이름 — 설치 명령에 그대로 쓴다 */
  name: string
  /** 마켓플레이스에 적은 설명 */
  description: string
  /** 마켓플레이스 분류 (productivity, security 등) */
  category: string | null
  /** README 가 있는 GitHub 폴더 주소 */
  sourceUrl: string
  /** 마켓플레이스 등록부터 설치까지 한 줄 명령 */
  installCommand: string
}

/**
 * 마켓플레이스 파일에서 mod 만 골라 화면용으로 바꾼다
 *
 * @param plugins - 마켓플레이스 `plugins` 배열 (테스트에서 바꿔 넣는다)
 * @param marketplaceName - 설치 명령의 `@` 뒤에 붙는 마켓플레이스 이름
 * @returns 마켓플레이스에 적힌 순서대로의 mod 목록
 */
export function getMods(
  plugins: MarketplacePlugin[] = marketplace.plugins,
  marketplaceName: string = marketplace.name,
): ModSummary[] {
  return plugins
    .filter((plugin) => plugin.source.startsWith(MOD_SOURCE_PREFIX))
    .map((plugin) => ({
      name: plugin.name,
      description: plugin.description ?? '',
      category: plugin.category ?? null,
      sourceUrl: REPO_TREE_URL + plugin.source.slice(2),
      installCommand: `${MARKETPLACE_ADD}; claude plugin install ${plugin.name}@${marketplaceName}`,
    }))
}
