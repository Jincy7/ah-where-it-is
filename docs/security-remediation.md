# 의존성 보안 수정 보고서

2026-11-08 기준으로 `pnpm audit` 경고를 39건에서 1건으로 줄였습니다.
`critical`, `high`, `moderate` 경고는 모두 없어졌습니다.
남은 `low` 1건은 로컬 패치를 적용한 `deepmerge@4.3.1`의 버전 판정 경고입니다.
전체 의존성과 프로덕션 의존성 감사에서 같은 결과를 확인했으며, 감사 제외 규칙은 추가하지 않았습니다.

현재 브랜치에서 심각도가 높은 항목부터 다음과 같이 나누어 커밋했습니다.

| 단계 | 변경 | critical | high | moderate | low | 합계 | 커밋 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 수정 전 | 기존 의존성 | 2 | 13 | 18 | 6 | 39 | — |
| 프레임워크 | `next`, `eslint-config-next`를 `16.4.5`로 변경 | 0 | 11 | 13 | 5 | 29 | `fb0f2e9` |
| 입력 검증 | `zod@4.6.7`, `@hookform/resolvers@6.0.2`로 변경 | 0 | 11 | 13 | 5 | 29 | `21979bd` |
| CLI와 MCP | `shadcn@4.23.0`과 하위 의존성 갱신 | 0 | 1 | 3 | 4 | 8 | `2e6ffe4` |
| 빌드 도구 | Tailwind, 직렬화, URI 파서, glob 의존성 수정 | 0 | 0 | 0 | 1 | 1 | `2300ae7` |
| 로컬 패치 | `deepmerge@4.3.1`의 위험한 키 병합 차단 | 0 | 0 | 0 | 1 | 1 | `b662c80` |

Next.js의 SVG 이미지 최적화와 `use cache` 타입 배열 처리에서 발생하는 원격 코드 실행 취약점은 `16.4.1`부터 수정되었습니다.
추가 캐시 노출과 오염, SVG 검사 우회, Edge 쿠키 노출 수정까지 포함하는 `16.4.5`를 적용했습니다.
[SVG 취약점 공지](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw),
[`use cache` 취약점 공지](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr),
[`16.4.5` 릴리스](https://github.com/vercel/next.js/releases/tag/v16.4.5)에 수정 범위가 명시되어 있습니다.
`react`와 `react-dom`은 호환 peer 범위에 해당하는 `19.2.6`을 유지했습니다.

Zod 변경 단계에서는 앱의 검증 코드를 수정했지만, 이전 shadcn에 포함된 Zod가 남아 감사 건수는 같았습니다.
shadcn 업그레이드로 해당 하위 의존성도 갱신했습니다.
resolver `6.0.2`는 Zod 4를 optional peer로 선언하며, 설치된 React Hook Form `7.75.0`과 호환됩니다.
[resolver `6.0.0` 릴리스](https://github.com/react-hook-form/resolvers/releases/tag/v6.0.0)의 주요 호환성 변경은 이 앱에서 쓰지 않는 Effect 어댑터에 해당합니다.

빌드 도구 단계에서는 `tailwindcss`와 `@tailwindcss/postcss`를 `4.3.5`로 갱신했습니다.
`postcss@8.5.28` 보정은 유지하고, `serialize-javascript@7.1.4`와 `fast-uri@3.1.9`를 반영했습니다.
`minimatch@11.0.5` 보정은 `@typescript-eslint/typescript-estree`와 `@ts-morph/common`의 의존 경로로 한정했습니다.

`deepmerge`는 공식 수정 버전이 아직 없는 [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)에 해당합니다.
반환 객체의 프로토타입에 외부 값이 주입되는 경로를 막기 위해, 대상 복사와 원본 병합 양쪽에서 `__proto__` 키를 제외했습니다.
[상위 저장소 PR #274](https://github.com/TehShrike/deepmerge/pull/274)의 제안과 같은 검사입니다.
이 PR은 병합되지 않고 닫혔으므로 공식 채택된 수정으로 취급하지 않습니다.

`pnpm.patchedDependencies`에 `patches/deepmerge@4.3.1.patch`를 등록했습니다.
원본 `index.js`뿐 아니라 실제 실행 파일인 `dist/cjs.js`, `dist/umd.js`에도 적용했습니다.
패치는 shadcn, registry, PWA의 Rollup 경로에서 사용하는 모든 `deepmerge@4.3.1` 복사본에 적용됩니다.
버전과 패키지 이름을 바꾸지 않아 감사 도구는 계속 1건을 보고합니다.
이를 취약점이 없는 감사 결과로 표시하거나 `auditConfig.ignoreCves` 등으로 숨기지 않았습니다.

`.mcp.json`은 `npx shadcn@latest mcp` 대신 `pnpm exec shadcn mcp`를 실행하도록 변경했습니다.
이 설정은 저장소의 잠금 파일과 로컬 패치를 적용한 CLI를 사용합니다.
shadcn `4.23.0`의 MCP SDK 변경은 [공식 릴리스](https://github.com/shadcn-ui/ui/releases/tag/shadcn@4.23.0)에 설명되어 있습니다.
이미 실행 중인 MCP 서버는 자동 교체하지 않았으므로, 기존 클라이언트는 재연결해야 새 설정을 적용할 수 있습니다.

다음 검증을 완료했습니다.

- `deepmerge` 공격 경로와 병합 호환성 테스트 27개 통과
- 별도 디렉터리의 `pnpm install --offline --frozen-lockfile --ignore-scripts` 이후 패치 재적용과 테스트 9개 통과
- 로컬 shadcn MCP의 `initialize`, `notifications/initialized`, `tools/list` 처리와 도구 7개 확인
- `ts-morph`의 glob 탐색과 AST 처리 확인
- 전체 의존성과 프로덕션 의존성 감사: 각각 `low` 1건, 나머지 0건

최종 프로덕션 서버(`localhost:4202`)를 대상으로 통합 테스트를 포함한 122개가 모두 통과했습니다. lint는 오류 0개와 기존 React Hook Form 경고 1개이며, 프로덕션 빌드는 성공했습니다. 390px 모바일에서 수량 2개 직접 등록·확정, 가로 넘침 없음, 브라우저 오류 없음도 확인했습니다. 이미지 최적화는 WebP 응답 200, 미인증 보관 기록 API는 401을 반환했습니다. 테스트 계정·기록과 임시 서버는 정리했습니다.
재검증 시 저장소가 지정한 Node.js 22와 pnpm을 사용합니다.

```sh
TEST_APP_URL=http://localhost:4202 RUN_AI_INTEGRATION=1 RUN_STORAGE_INTEGRATION=1 RUN_AGENT_INTEGRATION=1 RUN_TRANSCRIPTION_INTEGRATION=1 pnpm test
pnpm lint
pnpm build
pnpm audit
pnpm audit --prod
```

현재 두 감사 명령은 남은 버전 판정 경고 때문에 종료 코드 1을 반환합니다.
공식 수정 버전이 나오면 로컬 패치를 제거하고, 같은 공격 경로와 호환성 검증을 다시 실행해야 합니다.
