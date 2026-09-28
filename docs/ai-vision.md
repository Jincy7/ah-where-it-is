# 사진으로 물품 등록

`docs/spec/ai-vision.spec.md`를 바탕으로 구현했다. Gemini 3.5 Flash-Lite를 사용하며 보관함의 물품 등록 탭에서 최대 10장의 사진을 모아 사진별로 분석·확인·등록한다. 한 사진에 여러 물품이 보이면 여러 초안을 반환한다. 사진 간 자동 병합은 하지 않는다.

## 서버 설정과 배포 순서

1. Node.js 22를 사용한다 (`.nvmrc`, `package.json` engines). `nvm use` 후 `pnpm install --frozen-lockfile`.
2. 대상 Supabase에 `supabase/migrations/00007_ai_vision.sql`을 적용한다. 기존 `00001`~`00006` 적용 여부부터 확인한다. 로컬은 `supabase migration up --local`; 운영은 프로젝트를 연결한 다음 `supabase migration list`와 `supabase db push --dry-run`으로 대상을 확인하고 `supabase db push`한다. CLI 로그인 권한이 없으면 같은 SQL을 대상 프로젝트 SQL Editor에서 실행한다.
3. Vercel의 대상 프로젝트에 서버 전용 환경변수 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_KEY_ENCRYPTION_SECRET`을 설정한다. 브라우저용 Supabase URL/anon 키는 기존 설정을 유지한다. service-role 키와 암호화 시크릿에는 절대 `NEXT_PUBLIC_` 접두사를 붙이지 않는다.
4. `GEMINI_KEY_ENCRYPTION_SECRET`은 암호학적 난수 32바이트를 base64로 인코딩한 값이다. `openssl rand -base64 32`로 생성해 Vercel의 Sensitive 환경변수로 등록한다. 운영 시크릿을 저장소, SQL, 로그에 넣지 않는다. Preview는 별도 테스트 DB·시크릿으로 분리한다. 같은 DB를 사용하는 인스턴스는 같은 시크릿을 사용해야 한다.
5. 시크릿은 재배포 때마다 재생성하지 않고 비밀 저장소에 백업한다. 시크릿을 바꾸면 기존 암호문은 해독할 수 없으므로 기존 키로 전체 재암호화하는 별도 절차 또는 사용자별 키 재등록이 필요하다. 현재 구현은 자동 키 회전을 제공하지 않는다.
6. DB와 시크릿 준비 후 브랜치를 main에 병합하고 연결된 Vercel 배포를 확인한다. 설정에서 개인 키를 저장하고 사진 한 장을 분석·등록하는 스모크 테스트를 실행한다.

로컬 `.env.local`의 `GEMINI_API_KEY`는 `NODE_ENV=development`이면서 `VERCEL`이 없는 경우에만 개인 키 미등록 사용자의 테스트용으로 사용한다. 운영·Preview에는 공유 Gemini 키 fallback이 없다. 로컬 암호화 시크릿은 이번 작업에서 별도로 생성했다.

## 키와 데이터 처리

- 키는 서버의 AES-256-GCM으로 암호화한다. 저장할 때마다 새 12바이트 IV를 생성하고, 사용자 ID·용도·버전을 AAD에 묶어 다른 사용자에게 암호문을 옮기거나 변조하면 복호화가 실패한다.
- `user_gemini_keys`는 RLS를 켜고 anon/authenticated의 권한을 회수한다. 인증된 Next.js API가 자신의 사용자 ID를 확인한 후 service-role로 접근한다. 응답은 등록 여부·수정 시각만 포함한다.
- 모델 호출은 서버에서만 수행하고 키는 URL 대신 `x-goog-api-key` 헤더에 넣는다. 키·암호문·사진·공급자 원문 오류를 로그에 남기지 않는다. 설정 및 분석 응답은 `no-store`이고 PWA도 이 경로들을 캐시하지 않는다.
- 사용자가 입력한 키는 저장 시 형식을 검사한다. 실제 모델 접근 권한·할당량은 사진 분석 시 확인한다.
- 원본 JPG/PNG/WebP(최대 20MB)는 브라우저에서 긴 변 1600px의 JPEG로 변환해 전송한다. HEIC는 JPG 변환이 필요하다. 서버는 요청 2MiB, 디코딩 2천만 픽셀 제한과 실제 이미지 검증을 적용하고 메타데이터 없이 JPEG를 만든다.
- 사진은 요청 중 메모리에만 존재하며 DB·Storage에 저장하지 않는다. 브라우저를 나가면 미등록 사진과 초안도 사라진다. Google 측 데이터 처리는 해당 Gemini 계정의 약관·설정을 따른다.
- 서버가 보관함 소유권을 확인한다. DB의 원자적 카운터로 사용자별 사진 분석 30회/시간, 키 변경 30회/시간을 제한한다. 서버리스 인스턴스 간에도 한도를 공유한다. 분석 실패도 호출 한도에 포함한다.
- 모델 출력은 구조화 JSON과 Zod로 검사한다. 모호한 수량은 null로 보존하고 UI에서 실제 수량을 입력해야 저장할 수 있다. 읽을 수 없거나 중단된 응답은 초안으로 사용하지 않는다.
- 등록은 `register_items_once` 트랜잭션으로 수행한다. 사용자별 요청 UUID와 payload를 기록해 응답 유실·동시 재시도가 같은 물품을 다시 만들지 않게 한다. 같은 UUID에 다른 내용은 409로 거절한다. 이 기록에는 검토한 물품 정보만 저장하며 사진·키는 없다. 보관함/사용자 삭제 시 함께 삭제된다.

## 검증

```sh
nvm use
pnpm test
pnpm lint
pnpm build
pnpm audit

# 로컬 Supabase와 pnpm dev 실행 상태에서만 사용. 임시 계정은 테스트 후 삭제된다.
pnpm test:integration
# 실제 로컬 Gemini 키로 1회 유료 호출도 포함
RUN_LIVE_GEMINI=1 pnpm test:integration
```

2026-09-28 검증 결과:

- 암호화 round-trip·사용자 바인딩·변조/잘못된 시크릿 거부, 미확정 수량 검증, 모델 ID·헤더·응답/오류 처리 단위 테스트 통과.
- 로컬 API/DB: 두 사용자 권한 분리, 키 ciphertext 저장, CSRF 차단, 비로그인/타인 보관함 접근 차단, 잘못된/초과 크기 이미지 거부, 동일 요청 동시 3회→물품 1건, 동시 한도 35회→30회 허용, 키 삭제 검증 통과.
- 실제 `gemini-3.5-flash-lite`로 앱의 테스트 일러스트를 분석해 물품 초안 2개 수신. 실제 생활 사진의 인식 정확도 평가는 별도다.
- 브라우저 390px/1440px에서 가로 넘침 없음. 키 저장/삭제, 두 사진 중 한 장 실패와 개별 재시도, 수량 미확정 차단, 중복명 안내 확인. 등록을 서버에서 완료한 후 응답을 강제로 끊고 재시도했을 때 최종 2사진→2물품으로 중복 없음 확인.
- lint는 기존 container-form의 React Hook Form 경고 1개를 제외하고 통과.
- 의존성 감사는 기존 HEAD와 동일한 68건(critical 2, high 31, moderate 31, low 4). 이번 기능의 의존성으로 증가하지 않았으나 배포 전 별도 보안 업데이트가 필요하다.
- 로컬 마이그레이션 적용 완료. 이후 사용자가 운영 Supabase SQL 적용 완료를 확인했으며, Vercel Production에 `GEMINI_KEY_ENCRYPTION_SECRET`과 `SUPABASE_SERVICE_ROLE_KEY`를 Secret으로 등록한 화면을 확인했다. 운영 SQL 적용은 사용자 확인에 근거하며 CLI로 별도 검증하지 않았다.

공식 모델 정보: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
