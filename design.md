# Storage Manager Design Guide

이 문서는 "아 그거 어딨지"에 새 기능을 추가할 때 화면, 문구, 상호작용이 기존 앱과 같은 결로 느껴지도록 하는 기준선이다. UI를 추가하거나 사용자 흐름을 바꿀 때 먼저 이 문서를 확인하고, 실제 코드가 이 기준과 달라졌다면 문서도 같이 갱신한다.

## Product Position

- 이 앱은 가정용 보관함과 물품을 빠르게 찾고 관리하는 개인용 도구다.
- 사용자는 책상 앞보다 보관함 앞, 휴대폰 한 손 조작, 짧은 검색과 빠른 입력 상황에 있을 가능성이 높다.
- 첫 화면은 설명용 랜딩 페이지가 아니라 바로 쓸 수 있는 작업 화면이어야 한다.
- 디자인 목표는 조용하고 실용적인 정리 도구다. 장식보다 검색, 목록 스캔, 추가, 수정, 이동, 삭제의 명확성을 우선한다.

## Current UI Baseline

- Next.js App Router, Tailwind CSS v4, shadcn/Radix-style primitives, lucide-react 아이콘을 기본 UI 체계로 사용한다.
- `src/app/layout.tsx`의 전역 구조를 유지한다: 인증 후 상단 `Navbar`, 하단 모바일 `BottomNav`, `main`은 `container mx-auto p-4 pb-20 md:pb-4`.
- 주요 화면은 `space-y-6`으로 섹션을 나누고, 헤더 내부 그룹은 보통 `space-y-2` 또는 `space-y-4`를 쓴다.
- H1은 `text-3xl font-bold tracking-tight`, 섹션 제목은 `text-2xl font-semibold`를 기본으로 한다.
- 본문 보조 설명, 빈 상태 설명, 상태 카운트는 `text-muted-foreground`를 사용한다.
- 테마 색상은 `src/app/globals.css`의 CSS 변수와 semantic Tailwind 클래스만 사용한다. 임의 hex 색상은 새 브랜드 자산이나 특수 출력물처럼 이유가 있을 때만 쓴다.
- 현재 톤은 따뜻한 off-white 배경, 녹색 primary, 노란 secondary, zinc 계열 neutral, destructive red로 구성되어 있다.

## Layout Patterns

- 모바일 우선으로 설계한다. 모바일은 단일 컬럼, 데스크톱은 필요한 경우에만 grid/table을 넓힌다.
- 모바일의 주요 이동은 하단 탭 내비게이션에 의존한다. 새 주요 섹션을 만들면 `Navbar`, `MobileNav`, `BottomNav`의 정보 구조를 함께 검토한다.
- 목록 화면은 카드형 홍보 구성이 아니라 리스트, 필터, 결과 수, 빈 상태의 순서로 만든다.
- 주요 생성 액션은 기존처럼 FAB 또는 헤더 우측 버튼으로 둔다. 모바일 FAB는 하단 내비게이션을 침범하지 않게 `bottom-20` 기준을 지킨다.
- 고정 형식 영역에는 안정적인 치수를 준다. 예: 이미지/업로드/QR 미리보기는 `aspect-video`, 썸네일은 고정 width/height, 아이콘 버튼은 `size="icon"`.
- 빈 상태는 dashed border 컨테이너, 중앙 정렬, 160px 내외 앱 일러스트, 짧은 제목과 한 줄 설명을 기본으로 한다.

## Component Patterns

- 새 기본 UI는 먼저 `src/components/ui`의 shadcn/Radix primitive를 조합한다. 비슷한 primitive가 없을 때만 새 공용 UI 컴포넌트를 만든다.
- 액션 버튼에는 lucide 아이콘을 붙인다. 텍스트 버튼은 명확한 명령에만 쓰고, 수정/삭제/이동 같은 반복 액션은 아이콘 버튼 또는 메뉴 항목으로 축약한다.
- 버튼 variant는 다음 의미로 쓴다:
  - `default`: 생성, 저장, 등록, 로그인 같은 주 액션
  - `outline`: 취소가 아닌 보조 액션, 편집, 인쇄, 추가 옵션
  - `ghost`: 행 내부 액션, 메뉴 트리거, 필터 초기화
  - `destructive`: 삭제 확인처럼 되돌리기 어려운 액션
- 삭제는 항상 `AlertDialog`로 확인한다. 삭제 문구에는 대상 이름, 영향 범위, 되돌릴 수 없음을 포함한다.
- 일반 편집/선택/QR/이동 같은 보조 흐름은 `Dialog`, `Popover`, `DropdownMenu`, `Tabs`를 우선 사용한다.
- 데이터의 상태나 메타데이터는 `Badge`를 사용한다. 위치는 `secondary`, 수량/카운트는 `outline` 또는 `secondary`를 상황에 맞게 쓴다.
- 목록이 정보 비교 중심이면 데스크톱에서 `Table`을 사용하고, 모바일에서는 숨길 열을 정하거나 카드/드롭다운 메뉴로 전환한다.

## Forms And Data Entry

- 폼은 `react-hook-form`, `zod`, `@hookform/resolvers/zod` 조합을 기본으로 한다.
- 폼 필드는 `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage` 패턴을 따른다.
- 필수 입력 라벨에는 현재처럼 `*`를 붙이고, 검증 메시지는 한국어로 작성한다.
- placeholder는 실제 사용자가 입력할 법한 예시를 제공한다. 예: `예: 거실 서랍장`, `예: 겨울 코트`, `예: 검정색, M사이즈`.
- 저장 중에는 입력과 버튼을 disabled 처리하고, 버튼 안에 `Loader2 animate-spin`을 표시한다.
- 성공/실패 피드백은 `sonner` toast를 사용한다. 성공은 짧게, 실패는 서버 에러 메시지를 우선 보여준다.
- 여러 항목 입력은 `BulkItemForm`처럼 데스크톱에서는 밀도 높은 행 입력, 모바일에서는 카드형 행 입력을 사용한다.

## Search, Filters, And Lists

- 검색 입력은 아이콘이 있는 큰 입력창을 기본으로 한다. 검색은 300ms debounce 후 URL query를 갱신하는 패턴을 유지한다.
- 필터는 모바일에서 접을 수 있게 만들고, 활성 필터 수는 작은 `Badge`로 표시한다.
- 검색/필터 적용 중에는 `Loader2`와 `검색 중...` 상태를 보여준다.
- 결과 수는 짧게 표시한다. 예: `3개의 물품을 찾았습니다`, `총 12개`.
- 결과 없음과 빈 데이터는 구분한다. 검색 결과 없음은 다른 검색어/조건을 제안하고, 데이터 없음은 첫 생성 액션을 안내한다.

## Copy Tone

- 기본 언어는 한국어다.
- 문구는 친절하지만 짧게 쓴다. 사용 방법을 길게 설명하기보다 지금 할 수 있는 행동을 알려준다.
- 화면 제목은 명사형을 우선한다. 예: `보관함`, `물품 검색`, `설정`, `위치 관리`.
- 액션 라벨은 동사형을 쓴다. 예: `추가`, `저장`, `삭제`, `수정`, `인쇄하기`, `초기화`.
- 토스트는 완료 사실을 말한다. 예: `보관함이 생성되었습니다`, `물품이 삭제되었습니다`.
- 파괴적 액션은 부드럽게 돌려 말하지 않는다. 대상과 결과를 정확히 말한다.

## Visual Assets

- 앱 고유 일러스트는 `public/agu-*.png` 자산을 사용한다.
- `agu-logo.png`는 내비게이션 로고, `agu-welcome.png`는 인증 진입, `agu-container.png`는 보관함/물품 빈 상태, `agu-search.png`는 검색 빈 상태에 사용한다.
- 보관함 사진은 사용자가 실제 위치를 식별하는 기능적 자산이다. 흐리게 가리거나 장식처럼 과하게 크롭하지 않는다.
- 새 아이콘은 lucide-react에서 가져온다. 직접 SVG를 만들기 전에 lucide에 적절한 아이콘이 있는지 확인한다.

## Accessibility And Responsive Behavior

- 클릭/탭 대상은 모바일에서 최소 44px에 가깝게 유지한다.
- 아이콘만 있는 버튼에는 `title` 또는 `aria-label`을 제공한다.
- 데스크톱에서 여러 아이콘 버튼을 노출하더라도, 모바일에서는 `DropdownMenu`로 접어 행 폭을 보존한다.
- 텍스트는 `truncate`, `line-clamp`, `break-all`을 상황에 맞게 사용해 부모 영역을 넘지 않게 한다.
- 배경, 카드, 버튼은 semantic color token을 사용해 dark mode에서도 동작해야 한다.

## When Adding A Feature

1. 이 기능이 보관함, 물품, 위치, 검색, 설정 중 어디에 들어가는지 먼저 정한다.
2. 새 화면보다 기존 화면의 섹션, 탭, 다이얼로그, 메뉴 액션으로 해결할 수 있는지 검토한다.
3. 새 UI를 만들 때는 기존 primitive와 패턴을 먼저 재사용한다.
4. 모바일에서 한 손으로 스캔하고 조작할 수 있는지 확인한다.
5. 빈 상태, 로딩 상태, 실패 상태, 삭제 확인, 성공 toast를 빠뜨리지 않는다.
6. UI/UX 기준이 새 패턴으로 바뀌었다면 이 문서를 같이 갱신한다.
