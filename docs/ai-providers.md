# AI 제공자와 개인 키

OpenAI는 AI 도움, 사진 분석, 음성 대화에 사용한다. Gemini 사진 분석도 유지한다. 사진 분석 화면에서 제공자를 선택하며, 한 제공자의 오류를 다른 제공자로 자동 재시도하지 않는다.

## 키 저장

- 설정에서 개인 OpenAI 키를 등록·변경·삭제한다. 저장 전에 설정된 모델의 접근 권한을 확인한다. 모델 조회 성공이 실제 분석 호출의 잔여 크레딧이나 Realtime 권한까지 보장하지는 않는다.
- OpenAI 키는 `user_ai_credentials`에 AES-256-GCM으로 암호화한다. AAD는 `provider:v1:userId`이며 다른 사용자나 다른 제공자로 복호화할 수 없다. 브라우저 역할은 암호문에도 접근할 수 없다.
- 기존 `user_gemini_keys`는 호환성을 위해 유지한다. 기존 Gemini 암호문을 새 테이블에 복사하고 기존 테이블의 등록·변경·삭제를 트리거로 원자적으로 동기화한다. AAD를 유지하므로 복호화·재암호화 없이 전환한다. 공통 resolver는 새 테이블을 먼저 확인하고 없으면 기존 테이블을 읽는다.
- `AI_KEY_ENCRYPTION_SECRET`이 있으면 사용하고, 없으면 기존 `GEMINI_KEY_ENCRYPTION_SECRET`을 사용한다. 새 이름으로 옮길 때 기존 값과 같은 값을 써야 기존 암호문을 읽을 수 있다. 32바이트의 base64 값을 사용한다.
- API 응답, 로그, 화면에는 원문 키와 암호문을 포함하지 않는다. 키는 서버에서 복호화한 후 공급자 요청 헤더에만 넣는다.

## 로컬 개발 키

`.env.local`의 `OPENAI_API_KEY`는 자동 공용 fallback으로 사용하지 않는다. 로그인한 사용자가 설정의 `개발용 키 가져오기`를 누르면 해당 계정에 암호화 저장된다. 요청 앱과 Supabase가 모두 loopback 주소이고 `NODE_ENV=development`, Vercel 외부일 때만 사용할 수 있다. 배포 환경과 원격 Supabase에서는 이 경로를 사용할 수 없다.

## API 계약

| 경로 | 동작 |
| --- | --- |
| `GET /api/settings/openai` | `configured`, `updatedAt`, `localImportAvailable`만 반환 |
| `PUT /api/settings/openai` | `{ "apiKey": "..." }` 검증 후 암호화 저장 |
| `POST /api/settings/openai` | `{ "useLocalKey": true }`로 개발 키를 명시적으로 가져오기 |
| `DELETE /api/settings/openai` | 로그인한 사용자의 OpenAI 키만 삭제 |
| `POST /api/items/analyze?provider=openai` | JPEG/PNG/WebP 원문을 분석, 보관함 선택 전에도 가능 |
| `POST /api/items/analyze?provider=gemini&container_id=...` | 기존 Gemini 분석, 보관함 소유권 확인 |

`provider`를 생략하면 기존 클라이언트와 호환되도록 Gemini를 사용한다. 전달한 `container_id`는 제공자와 상관없이 소유권을 검증한다. 사진 분석은 후보만 반환하며 물품을 저장하지 않는다. 불확실한 수량은 `null`을 유지한다.

## 모델·사용량·검증

OpenAI 사진 분석은 Responses API 이미지 입력과 strict JSON Schema를 사용한다. 기본 모델은 `gpt-5.4-mini`이며 `OPENAI_MODEL`로 변경할 수 있다. 응답은 `analysisSchema`로 다시 검증하며 완료되지 않은 응답, 거절, 잘못된 수량은 저장 후보로 사용하지 않는다. `store:false`로 Responses 상태 보관을 요청하지 않지만 공급자의 데이터 처리 정책 자체를 바꾸지는 않는다.

사진 분석, 키 저장, 채팅, 음성 세션 시작은 사용자별로 각각 시간당 30회, 도구 호출은 120회 제한한다. 키 확인은 텍스트 생성 없이 모델 메타데이터를 조회한다.

- 단위 검증: `pnpm exec tsx --test tests/provider.test.ts tests/ai-vision.test.ts`
- 로컬 API·DB 검증: `RUN_AI_INTEGRATION=1 pnpm exec tsx --test tests/provider.integration.test.ts`

공식 문서 확인: [이미지 입력](https://developers.openai.com/api/docs/guides/images-vision), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini).
