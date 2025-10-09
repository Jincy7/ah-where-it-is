"아 그거 어딨지" 프로젝트 설계서
프로젝트 개요

- 프로젝트명: "아 그거 어딨지"
- 목적: 가정용 보관함 및 물품 관리 시스템
- 기술 스택: Next.js 15+ + Supabase + shadcn/ui + Vercel
- 개발 방식: Claude Code 기반 Multi-Agent 협업

---

# TODO

Phase 1: 기반 설정

- [x] Next.js 프로젝트 초기화
- [x] Supabase 프로젝트 생성 및 설정
- [x] shadcn/ui 설치 및 구성
- [ ] 기본 레이아웃 및 네비게이션

Phase 2: 데이터베이스 & 인증

- [ ] Supabase 테이블 스키마 생성
- [ ] RLS 정책 설정
- [ ] 인증 플로우 구현
- [ ] 기본 CRUD 작업 함수

Phase 3: 핵심 기능

- [ ] 보관함 CRUD 인터페이스
- [ ] 물품 관리 시스템
- [ ] 위치 관리 페이지
- [ ] 이미지 업로드 기능

Phase 4: QR 코드 & 고급 기능

- [ ] QR 코드 생성 및 출력
- [ ] 검색 및 필터링
- [ ] 반응형 디자인 최적화

Phase 5: 배포 & 테스트

- [ ] Vercel 배포 설정
- [ ] 환경 변수 설정
- [ ] 버그 수정 및 개선

# Spec

상세 프로젝트 스펙
🗃️ 데이터 구조
locations 테이블
typescript
interface Location {
id: string (uuid)
user_id: string (uuid, FK)
name: string
description?: string
created_at: timestamp
updated_at: timestamp
}
containers 테이블
typescript
interface Container {
id: string (uuid)
user_id: string (uuid, FK)
name: string
location_id?: string (uuid, FK)
internal_photo_url?: string
created_at: timestamp
updated_at: timestamp
}
items 테이블
typescript
interface Item {
id: string (uuid)
container_id: string (uuid, FK)
name: string
description?: string
created_at: timestamp
updated_at: timestamp
}
📱 페이지 구조
text
/
├── / (홈 - 보관함 목록)
├── /container/[id] (보관함 상세)
├── /container/[id]/edit (보관함 편집)
├── /container/new (새 보관함 생성)
├── /settings (설정 - 위치 관리)
├── /login (로그인)
└── /print/[id] (QR 코드 출력 페이지)
🔐 RLS 정책
sql
-- containers 테이블
CREATE POLICY "Users can view own containers"
ON containers FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own containers"
ON containers FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- items, locations 테이블도 동일한 패턴
🎨 UI/UX 요구사항
주요 컴포넌트
ContainerCard: 보관함 카드 (이름, 위치, 물품 수, QR 액션)

ItemList: 물품 목록 관리 (추가/삭제/편집)

LocationManager: 위치 관리 인터페이스

QRPrintDialog: QR 코드 출력 다이얼로그

SearchFilter: 보관함/물품 검색 필터

반응형 디자인
모바일: 단일 컬럼 리스트

태블릿: 2컬럼 그리드

데스크톱: 3-4컬럼 그리드

🔧 기술적 고려사항
성능 최적화
Next.js App Router 활용

이미지 최적화 (next/image)

무한 스크롤 또는 페이지네이션

Supabase 실시간 구독 (선택적)

개발 도구
TypeScript 엄격 모드

ESLint + Prettier 설정

shadcn/ui 컴포넌트 시스템

Tailwind CSS 유틸리티 클래스
