# 의존성 보안 업데이트 — 2026-09-28

## 결과

`pnpm audit`에 나타난 알려진 취약점 68건을 패치했다. 전체 의존성과 운영 의존성(`pnpm audit --prod`) 모두 0건이다. 이는 해당 시점에 감사 데이터베이스가 보고하는 의존성 취약점 기준이며, 애플리케이션 전체에 보안 문제가 없다는 의미는 아니다.

| 심각도 | 수정 전 | 수정 후 |
| --- | ---: | ---: |
| Critical | 2 | 0 |
| High | 31 | 0 |
| Moderate | 31 | 0 |
| Low | 4 | 0 |

## 변경

| 패키지 | 이전 | 업데이트 |
| --- | --- | --- |
| next | 16.2.6 | 16.3.6 |
| eslint-config-next | 16.2.6 | 16.3.6 |
| sharp | 0.34.5 | 0.35.5 |
| shadcn (개발 도구) | 4.7.0 | 4.21.0 |

- PostCSS의 과거 override(`postcss@<8.5.10 → 8.5.14`)를 `postcss@<8.5.23 → 8.5.28`로 교체했다. 이미 안전한 8.5.23 이상 버전은 유지한다.
- 취약한 하위 의존성을 해당 패키지의 호환 범위 안에서 갱신했다: js-yaml, @babel/core, brace-expansion, fast-uri, nanoid, browserslist, baseline-browser-mapping, PostCSS 등. 서로 다른 brace-expansion 주 버전은 유지하면서 각 버전 계열의 패치를 적용했다.
- React와 Supabase 등 이번 감사에서 취약점이 보고되지 않은 직접 의존성의 선언은 변경하지 않았다.
- 이미지·등록·인증 기능의 애플리케이션 코드는 변경하지 않았다. DB 마이그레이션이나 새 환경변수는 필요 없다.

## 실제 서비스와의 관련성

우선순위가 높은 항목은 Next.js 이미지 최적화의 AVIF 원격 코드 실행 취약점과 sharp/libheif/libvips 취약점이었다. 이 앱은 `next/image`로 보관함 사진을 표시하고, 분석 API에서 sharp로 사용자 사진을 디코딩하므로 이미지 처리 의존성이 실제 실행된다. 다만 Vercel의 관리형 이미지 최적화에 대한 악용 가능성이나 실제 침해는 검증하지 않았으며, 공개 익스플로잇을 운영 서비스에 실행하지 않았다.

다른 critical 항목은 Windows 서버에서의 Next.js 원격 코드 실행 취약점으로, 현재 Vercel 운영 환경에 그대로 해당한다고 판단하지 않았다. 동일한 프레임워크 업데이트로 함께 해소했다.

Hono/Express/qs/fast-uri 등 상당수 항목은 shadcn CLI의 개발 의존성으로 들어왔다. 앱이 해당 서버를 운영하는 것은 아니지만, 개발 도구와 빌드 공급망의 노출도 줄이기 위해 함께 패치했다.

공식 근거:

- [Next.js 이미지 최적화 취약점 및 패치 버전](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4)
- [Next.js 16.3.6 보안 릴리스](https://github.com/vercel/next.js/releases/tag/v16.3.6)
- [sharp/libheif 보안 권고](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)
- [sharp 0.35.5 릴리스](https://github.com/lovell/sharp/releases/tag/v0.35.5)

## 검증

Node.js 22.18.0, pnpm 10.10.0에서 수행했다.

- `pnpm install --frozen-lockfile`: 성공, lockfile 재해석 없이 설치 확인.
- `pnpm audit`: 알려진 취약점 없음.
- `pnpm audit --prod`: 알려진 취약점 없음.
- `pnpm lint`: 오류 없음, 기존 container-form의 React Hook Form 경고 1개.
- `pnpm test`: 단위 테스트 5개 통과. 기본 실행에서 통합 테스트는 명시적으로 skip.
- `pnpm build`: Next.js 16.3.6 프로덕션 빌드 성공.
- 해당 빌드를 `pnpm start --port 4201`로 실행하고 `RUN_LIVE_GEMINI=1 pnpm test:integration` 수행: 로컬 Supabase 두 계정의 접근 분리, 키 암호화·삭제, CSRF 차단, 이미지 검증, 원자적 호출 한도, 중복 등록 방지, 실제 Gemini 3.5 Flash-Lite 호출 모두 통과. 테스트 계정은 자동 삭제됐다.
- 프로덕션 서버 스모크 테스트: 로그인 HTTP 200, 비로그인 키 설정 API HTTP 401, PWA service worker HTTP 200, Next.js Image Optimization의 WebP·AVIF 변환 HTTP 200 및 이미지 바이트 응답 확인.
