# 운영 방 생성 복구 실행안

## 현재 확인

- 운영 대상: `mqsnshnlfwsgabrsmqsz`. 연결된 Supabase 계정 목록에는 이 프로젝트가 없고 `list_migrations`는 permission denied. 운영 이력과 실제 적용 여부는 **미확인**. 다른 프로젝트로 대체하지 않는다.
- 이번 작업에서 운영 REST 재확인: `chat_room_list?select=id,concerns,status&limit=0`는 HTTP 400 / `42703` (`concerns` 없음), `create_room`은 잘못된 secret을 이용한 비생성 진단 요청에도 HTTP 404 / `PGRST202`. 공개 API 관찰만으로 내부 마이그레이션 이력까지 추정하지 않는다.
- PR #135 head `422ca8240350919c96a02bbfaaff6286cea4236c`: Draft/open, mergeable=false. Web checks [39314544911](https://github.com/yohan4477/Alimi/actions/runs/39314544911), iPhone Build [39314544723](https://github.com/yohan4477/Alimi/actions/runs/39314544723) 성공. 이는 운영 DB / TestFlight 검증을 뜻하지 않는다.
- main은 점검 시 `9c00b51503124076d1bbfc081a8b1daa4f9f1e27`. 이후 UI 변경이 있으므로 PR 전체 파일로 main을 덮어쓰지 않는다.
- 기존 `.github/workflows/web.yml`은 PR 검사, `testflight.yml`은 main의 수동 업로드. 피드 워크플로의 service-role REST 키는 DB DDL 배포 권한으로 사용하지 않는다. DB 배포 워크플로는 현재 없다.
- 로컬 검증: 기존 `tests/room-lifecycle.test.js` 4/4 성공. 새 `room-recovery-verify.sql`을 선행 마이그레이션 전체를 적용한 PGlite에서 실행 성공, rollback 뒤 방 개수가 변하지 않음 확인. 운영 DB 검증은 아님.

## 정확한 적용 대상과 순서

PR #135의 위 고정 SHA에서 다음 원본을 사용한다. 파일을 고치거나 별도 이름으로 재등록하지 않는다.

1. `supabase/migrations/20261019050000_user_rooms.sql`
2. `supabase/migrations/20261019060000_concern_keywords.sql`
3. `supabase/migrations/20261019193325_room_lifecycle_and_tags.sql`

기존 chat, room_kinds, community 및 brand_logos 스키마가 선행 조건이다. 전체 데이터베이스 reset, 강제 이력 삭제, 무조건 재실행 금지.

## 권한 있는 기존 Supabase CLI 경로

프로젝트 소유자/운영자가 자신의 권한으로 실행한다. 비밀번호나 토큰을 대화·커밋·로그에 넣지 않는다. 연결 정보는 안전한 로컬 환경 또는 승인된 Secret 저장소를 사용한다.

```sh
git fetch origin
git switch --detach 422ca8240350919c96a02bbfaaff6286cea4236c
supabase --version
supabase link --help
supabase migration list --help
supabase db push --help
supabase link --project-ref mqsnshnlfwsgabrsmqsz
supabase migration list --linked
supabase db push --linked --dry-run
```

복구 브랜치의 `scripts/room-recovery-preflight.sql`도 같은 DB에서 실행하여 이력과 실제 함수/컬럼/정책/트리거를 대조한다. CLI 명령 지원 여부는 설치 버전의 help를 따른다.

| 이력 / 실제 스키마 | 처리 |
|---|---|
| 적용 이력 있고 해당 단계 스키마 또는 후속 단계가 완전함 | 건너뛴다 |
| 이력 없고 해당 단계 객체도 없음 | 누락 적용 후보 |
| 이력 없지만 객체 존재 / 일부만 존재 | 중단, 원본 전체와 대조. 자동 재실행·repair 금지 |
| 이력 있지만 객체 누락·불일치 | 중단, drift 원인 조사 |

dry-run이 위 세 파일 중 누락된 파일만 순서대로 표시하고, 선행 스키마 및 이력이 일치할 때만 아래 실행. 관련 없는 대기 마이그레이션이나 원격 전용 이력이 나오면 먼저 조정한다. 이력만 잘못된 경우 원본의 모든 변경이 실제로 존재함을 확인한 뒤에만 운영자가 CLI `migration repair`를 검토한다.

```sh
supabase db push --linked
supabase migration list --linked
```

각 성공 단계 후 실패했다면 이력과 스키마를 다시 읽고 남은 단계만 진행한다. 원본은 자체적으로 재실행 안전하지 않다. 마지막 파일은 PostgREST schema reload를 알린다. pg_cron 미설치 시 자동 보관 예약은 생성되지 않는다.

## 서버와 실제 사용자 흐름 검증

1. 운영 SQL 연결에서 `scripts/room-recovery-verify.sql` 실행. anon 권한으로 생성/태그/참여/삭제 제한을 확인하고 rollback한다. 기존 사용자의 방은 건드리지 않는다. 쿼터가 이미 찼으면 검증을 중단하고 시간 창 이후 재시도하며 제한을 풀지 않는다.
2. 운영 REST에서 `chat_room_list?select=id,concerns,status&limit=0` 성공 확인. RPC에 잘못된 secret으로 호출하면 `PGRST202` 대신 `chat:secret`이어야 한다.
3. PR을 최신 main과 병합 조정한 후보에서 UI 검증: 기존 UI 유지, 19개 태그 선택/최대 3개/태그 없이 생성. UI 전체 교체 금지.
4. 테스트 기기 A에서 고유한 QA 방 생성 → 새로고침/앱 종료 후 재접속 → 같은 방과 태그 확인. secret 초기화하지 않는다. 별도 기기 B로 참여 및 메시지 작성 → B 나가기 → A 삭제 시 서버의 `chat:participated` 확인. B의 재입장도 확인한다.
5. A만 참여한 별도 QA 방은 삭제 후 목록과 직접 링크에서 숨겨지는지 확인. 다른 사람이 참여한 QA 방은 제한을 우회해 지우지 않고, 운영자가 그 **정확한 테스트 방 ID만** 사유와 함께 폐쇄한다.
6. 접근 정책/권한 advisor를 확인한다. 위 SQL rollback 검증은 실제 브라우저 재접속·네트워크 검증과 구분한다.

## 출시 순서와 완료 근거

DB 적용 및 API 검증 → #135 충돌 해결(최신 UI 유지) → 변경 SHA의 Web/iPhone CI 성공 → PR ready/merge → 기존 웹 배포의 SHA와 실제 URL 확인 → 운영 UI 검증 → `SeoulBeauty TestFlight Upload`를 main에서 `confirm_upload=true`로 실행 → App Store Connect 처리 완료/테스터 연결/실기기 위 흐름 확인.

TestFlight 대상 bundle은 `com.yohan4477.seoulbeauty`. legacy Alimi 업로드 workflow와 혼동하지 않는다. 빌드 성공, 업로드 성공, TestFlight 사용 가능, 실기기 검증은 각각 기록한다.

현재 DB 적용, 실제 사용자 흐름, 병합, 웹 배포, TestFlight 반영은 이 작업에서 완료되지 않았다. 필요한 입력은 운영 프로젝트에 대한 권한 있는 연결이다.
