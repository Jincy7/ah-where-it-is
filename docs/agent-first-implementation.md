# Agent-first 전환 구현

`docs/agent-first.md`의 첫 구현 범위를 현재 Next.js 앱에 적용했다. `/storage` 안에서 AI 도움과 직접 관리가 보관함 선택, 검색 결과, 사진 후보, 변경안과 저장 결과를 공유한다. 개인 키 정책은 사용자 요청에 따라 OpenAI와 Gemini 모두 암호화 보관한다.

## 적용 순서

1. Node 22, pnpm 10.10.0 환경에서 기존 로컬 인프라를 시작한다.
2. `supabase migration up --local`로 `00008_ai_providers.sql`, `00009_storage_actions.sql`을 적용한다. 운영에는 배포 전 두 마이그레이션을 순서대로 별도 적용해야 한다. 이번 작업은 운영 DB를 변경하지 않았다.
3. 서버의 `SUPABASE_SERVICE_ROLE_KEY`와 기존 `GEMINI_KEY_ENCRYPTION_SECRET`를 유지한다. 공통 이름 `AI_KEY_ENCRYPTION_SECRET`도 지원하지만 기존 암호문을 읽으려면 동일한 32바이트 base64 비밀값이어야 한다.
4. 설정에서 개인 OpenAI 키를 등록한다. `.env.local`의 `OPENAI_API_KEY`는 로컬 개발 앱·로컬 Supabase에서만 **개발용 키 가져오기**로 로그인한 사용자에게 암호화 저장할 수 있다. 환경 키를 배포 사용자에게 자동 공유하지 않는다.

서버 전용 선택 설정:

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `OPENAI_MODEL` | `gpt-5.4-mini` | 텍스트 도구 호출·사진 후보 |
| `OPENAI_REALTIME_MODEL` | `gpt-realtime-2.1` | WebRTC 음성 세션 |
| `AI_KEY_ENCRYPTION_SECRET` | 기존 Gemini 암호화 비밀값 사용 | 공급자·사용자별 AES-256-GCM |

일반 API 키, 암호문, 사진 원본은 응답·로그에 노출하지 않는다. 모델 접근 권한은 개인 OpenAI 프로젝트에 따라 달라질 수 있다. 사진 공급자는 화면에서 명시적으로 선택하며 다른 공급자로 자동 전환하지 않는다.

## 변경 실행 계약

- 공통 `/api/storage` 서비스와 `storage_actions`가 등록·수정·이동·삭제·장소·보관함 변경을 처리한다.
- 준비 단계는 서버가 소유권과 현재 버전을 읽고 `action_id`, `revision`, `expected_versions`, `payload_hash`, `idempotency_key`, 전후 미리보기를 저장한다.
- 확인은 저장된 최신 변경안의 버전·해시·요청키를 모두 검증한 뒤 한 DB 트랜잭션으로 실행한다. 같은 요청의 재전송은 기존 영수증을 반환한다. `NULL` 승인값도 거부한다.
- 보관함 삭제는 내용물 버전을 함께 비교한다. 직접 DB·기존 폼·일괄 등록도 버전 트리거와 사용자별 쓰기 잠금에 참여한다. 확인 이후 물품이 추가되면 다시 확인해야 한다.
- 업무 충돌은 `PT409`를 사용한다. PostgreSQL 직렬화 오류 `40001`은 PostgREST 내부 재시도를 유발하므로 업무 충돌에 쓰지 않는다.
- 텍스트·음성 도구는 조회, 사진 후보 정정, 변경안 준비와 취소만 제공한다. 모델에 확정 도구나 SQL 접근을 주지 않는다. 실제 저장은 화면 확인 버튼으로만 진행한다.
- 사진 초안은 사진 ID와 편집 버전으로 연결한다. 다른 사진의 변경안이나 오래된 AI 응답이 현재 편집을 덮어쓰지 않는다.
- 응답 유실 시 확인한 변경안을 잠그고 동일 요청으로 재시도하거나 상태를 조회한다.

## 사진·검색·음성

새 사진은 비공개 `item-images` 버킷의 `media_assets`로 관리하고 `item_media`로 여러 물품에 연결한다. 사진 보관은 선택 사항이다. 업로드·물품 연결 상태를 분리하고 최종 연결은 물품 등록 트랜잭션에 포함한다. 다른 참조가 남아 있는 사진은 삭제하지 않는다. 미참조 사진은 24시간 유예 후 작업 화면 진입 시 정리하며 실패한 스토리지 삭제는 큐에 남겨 재시도한다. 사진 URL은 10분간 유효하며 새로고침으로 갱신한다.

검색은 이름·설명을 단어별로 비교한다. 예를 들어 `검은색 충전기`는 `검은색 USB-C 충전기`를 찾는다. 기본 찾기 범위와 등록 대상은 분리된다. 위치는 현재 기록의 장소 → 보관함 경로이며 사진에는 등록 당시 사진임을 표시한다. 초기 목록은 1,000개까지 표시하고 초과 여부를 안내한다. 보관함 삭제는 전체 영향 목록을 수집하며 10,000개 초과는 한 번에 삭제하지 않는다.

Realtime은 서버에서 사용자 키를 복호화해 SDP를 교환한다. 브라우저에는 일반 키를 전달하지 않는다. 음성 도구는 같은 인증·소유권·변경 계약을 사용한다. 종료·실패·보기 전환 시 오디오 트랙을 정리하고 사진·대화 초안을 유지한다. 연결은 10분 후 종료하며 도구 호출 반복에도 상한을 둔다.

## 검증

```sh
pnpm test
RUN_AI_INTEGRATION=1 RUN_STORAGE_INTEGRATION=1 RUN_AGENT_INTEGRATION=1 pnpm test
pnpm lint
pnpm build
supabase db lint --local --schema public --level error
```

최종 검증은 Node 22.18.0 / pnpm 10.10.0에서 수행했다. 통합 테스트를 포함해 38개 모두 통과했으며 lint는 오류 0개(기존 ContainerForm의 React Hook Form 경고 1개), production build와 DB 스키마 lint는 성공했다. 의존성 변경은 없었다.

통합 테스트는 로컬 Supabase만 허용하고 테스트 계정·사진을 정리한다. 외부 모델을 호출하지 않고 암호화, RLS, 인증·CSRF, 명시적 전체 검색, 준비 단계의 무변경, revision 충돌, 승인값 변조, 중복 확인, 기존 일괄 등록과의 동시성, 삭제 영향 변경, 공유 사진·정리를 검증한다.

별도 실제 연결 검증에서 개발용 키 암호화 가져오기, OpenAI 텍스트 검색 → 이동 초안 → 화면 확정, 테스트 이미지 분석 → 후보 편집 → 대화로 수량 정정 → 사진 보관·등록, 직접 다중 등록을 확인했다. Realtime WebRTC는 실제 OpenAI 연결과 도구 왕복을 테스트 오디오 스트림으로 확인했으며 실제 마이크를 녹음하지 않았다. 390px 모바일 화면에서 모드 전환·초안 유지·가로 넘침도 확인했다.

실제 생활 사진 20–30장과 검색 질의 40–60개에 대한 모델 품질 평가는 아직 수행하지 않았다. 실제 iOS/Android 마이크·카메라와 한국어 음성 인식은 기기 검증이 필요하다. 의미 검색, 장기 작업, 새로고침 이후의 미저장 초안 복구는 명세의 후속 확장 범위로 남긴다.

공식 구현 참고: [Responses 함수 호출](https://developers.openai.com/api/docs/guides/function-calling), [구조화 출력](https://developers.openai.com/api/docs/guides/structured-outputs), [Realtime WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc).
