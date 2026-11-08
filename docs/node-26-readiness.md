# Node.js 26 전환 검증

2026-11-08 기준으로 macOS ARM64에서 Node.js `26.13.0`으로 전환할 수 있음을 확인했습니다.
현재 작업 내용을 별도 디렉터리에 복사해 검증했으며, 저장소의 Node 22 설정과 실행 중인 개발 서버는 유지했습니다.
이 문서는 전환 가능성 검증 결과이며, 실제 배포 환경에서의 검증은 포함하지 않습니다.

## 검증한 버전과 보안 패치

| 항목 | 버전 |
| --- | --- |
| Node.js | `26.13.0`, Lithium LTS |
| pnpm | `10.10.0` |
| Next.js | `16.4.5` |
| TypeScript | `5.9.3` |
| Node 타입 | `@types/node@26.6.6` |

`26.13.0`은 2026-10-28에 출시된 최신 Node 26 버전입니다.
2026-10-21의 `26.12.1` 보안 수정이 포함되며, 두 버전의 차이는 LTS 메타데이터입니다.
공식 macOS ARM64 배포 파일의 SHA-256을 `SHASUMS256.txt`와 대조한 뒤 실행했습니다.
[26.13.0 릴리스](https://nodejs.org/en/blog/release/v26.13.0),
[10월 보안 공지](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)

Node.js는 22, 24, 26 계열의 HIGH 취약점 수정을 2026-11-11 또는 그 직후에 배포한다고 예고했습니다.
이 수정은 검증일 현재 공개되지 않았으므로 `26.13.0`에 포함된 것으로 취급하면 안 됩니다.
실제 전환 시 공식 배포 목록에서 최신 패치를 다시 확인해야 합니다.
[11월 보안 업데이트 예고](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases)

## 실행 결과

검증용 복사본에서만 `engines.node`를 `26.x`, `.nvmrc`를 `26.13.0`으로 변경했습니다.
기존 잠금 파일로 `pnpm install --frozen-lockfile --offline`을 완료한 뒤,
`@types/node`를 `26.6.6`으로 갱신하고 아래 검증을 실행했습니다.
앱 소스 수정은 필요하지 않았습니다.

| 검증 | 결과 |
| --- | --- |
| 기존 잠금 파일 설치 | 성공, 로컬 패치 유지 |
| `pnpm lint` | 오류 0개, 기존 React Hook Form 경고 1개 |
| `pnpm build` | 타입 검사, webpack, PWA 빌드 성공 |
| 전체 테스트, Node 26 프로덕션 서버 통합 포함 | 122개 전체 통과, 두 차례 연속 확인 |
| Sharp | JPEG 변환과 Next 이미지 최적화 WebP 응답 200 |
| 네이티브 resolver | `unrs-resolver` 파일 탐색 성공 |
| shadcn MCP | 초기화와 도구 목록 7개 확인 |
| deepmerge 로컬 패치 | Node 26에서 공격 경로와 병합 회귀 테스트 9개 통과 |
| 비인증 보관 기록 API | 401 응답 |
| `pnpm audit` | `low` 1건, 나머지 0건 |

첫 전체 테스트는 120개 통과, 2개 실패였습니다.
하나는 사용량 RPC의 503 응답이고 다른 하나는 HTTP 연결의 `ECONNRESET`입니다.
관련 호출은 로컬 HTTP 경로이므로 HTTPS의 HTTP/2 협상 변경으로 설명되지 않습니다.
코드 변경 없이 실패한 두 테스트 파일의 테스트 7개와 이후 전체 122개 테스트 두 차례가 모두 통과했습니다.
일시적인 연결 실패 가능성이 있지만 최초 오류의 정확한 원인은 확정하지 못했습니다.

pnpm `10.10.0`의 레지스트리 요청에서는 `url.parse()`에 대한 `DEP0169` 경고가 발생했습니다.
설치와 감사는 정상 완료했으며, 이번 검증에서 pnpm 버전은 바꾸지 않았습니다.
설치 시 esbuild 빌드 스크립트가 실행되지 않았다는 pnpm 안내도 있었으나, 실제 `tsx` 실행은 정상 동작했습니다.

남은 감사 경고는 이전 보안 작업에서 로컬 패치를 적용한 `deepmerge@4.3.1`의 버전 판정입니다.
이름과 버전이 그대로여서 감사에는 계속 표시됩니다.
패치 범위와 한계는 [의존성 보안 수정 보고서](./security-remediation.md)에 기록되어 있습니다.

## 실제 제공자 요청

Node 26 프로덕션 서버에서 임시 계정의 암호화된 개발 키로 실제 API 요청을 확인했습니다.
검증에는 합성 이미지, 합성 음성, 임시 보관 기록을 사용했습니다.

| 경로 | 결과 |
| --- | --- |
| Luna 대화 | `gpt-6-luna` 응답 성공, 장소의 빈 보관함과 물건 부재 구분 |
| Terra 사진 분석 | `gpt-6.1-terra` 응답 성공, 분석 배열 반환 |
| Gemini 사진 분석 | 응답 성공, 분석 배열 반환 |
| 음성 전사 | `gpt-transcribe` multipart 요청, 응답 200과 문자열 처리 성공 |

음성 전사의 정확도가 통과했다는 의미는 아닙니다.
합성 음성의 “공구함은 비어 있습니다”를 “궁금함은 기어 있습니다”로 인식했습니다.
같은 파일과 모델을 Node `22.18.0`에서 직접 요청해도 같은 결과를 받았습니다.
이 표본에서는 런타임 변경에 따른 전사 결과 차이가 없었습니다.

검증용 계정, 암호화 키, 보관 기록은 삭제했습니다.
원래 개발 서버는 `localhost:4201`에서 유지하고, `localhost:4202`의 검증용 프로덕션 서버는 종료했습니다.

## 실제 전환에 필요한 변경

- `.nvmrc`: 검증한 최신 Node 26 패치 버전 지정
- `package.json`: `engines.node`를 `26.x`, `@types/node`를 `^26.6.6`으로 변경하고 잠금 파일 갱신
- 실행 환경: Node 26용 pnpm `10.10.0` 준비, 개발 서버와 MCP 재시작
- 실행 안내: 현재 Node 22를 요구하는 문서 갱신, 과거 검증 결과의 버전은 보존
- 배포 환경: Node 26 선택 후 해당 환경에서 빌드와 외부 API 요청 재검증

Node 25부터 Corepack이 기본 포함되지 않으므로 새 Node 설치만으로 pnpm 명령이 준비된다고 가정하면 안 됩니다.
이번 검증에서는 기존 pnpm `10.10.0` 실행 파일을 Node 26으로 직접 실행했습니다.
[Corepack 기본 설치 안내](https://github.com/nodejs/corepack#default-installs)

Vercel은 2026-10-29부터 Node 26을 지원합니다.
Vercel을 사용한다면 `engines.node`의 `26.x` 설정으로 계열을 선택하며, 세부 패치 배포는 플랫폼이 관리합니다.
사전 빌드 배포에는 Vercel CLI `65.8.0` 이상이 필요합니다.
현재 저장소만으로 실제 배포 환경을 확정하지는 못했습니다.
[Vercel Node 26 지원 공지](https://vercel.com/changelog/node-js-26-lts-is-now-generally-available-on-vercel)

Linux 공식 Node 바이너리는 Node 25부터 `libatomic`에 연결됩니다.
Linux 서버에 직접 설치한다면 해당 라이브러리가 있는지도 확인해야 합니다.
Node 26의 기본 `fetch`는 HTTP/2를 사용할 수 있으며, 이번 실제 제공자 요청에서는 오류가 없었습니다.
Linux 실행 자체와 배포 플랫폼의 동작은 이번 macOS 검증 범위에 포함되지 않습니다.
[Node 릴리스 안내](https://nodejs.org/en/blog/release/v26.13.0),
[Vercel fetch 변경 안내](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration#http2-for-fetch-on-nodejs-26)
