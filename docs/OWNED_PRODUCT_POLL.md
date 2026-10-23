# 너도 갖고 있어? — 사전 개발

브랜치: `feature/owned-product-poll`. 운영 main과 분리. **미출시**.

## 구현
- `dist/owned-poll/index.html`: 모바일 투표 UI (초기 3개 제품, 기존 명화 게임 이미지 참조)
- `api/owned-poll.js`: GET 결과 / POST 선택 및 변경. 동일 기기·제품별 1표. 서명된 익명 쿠키.
- `supabase/migrations/20261023090000_owned_product_polls.sql`: DB 테이블과 제한된 접근 정책.
- `tests/owned-poll.test.js`: 비활성 상태와 접근 제한 기본 검사.

## 출시 전 필수
1. Supabase에 마이그레이션 적용 (현재 **미적용**).
2. Vercel 환경변수 `OWNED_POLL_ENABLED=true`, `OWNED_POLL_COOKIE_SECRET` (32자 이상), `SUPABASE_SECRET_KEY` 설정.
3. 관리자 미리보기와 기능 플래그 온오프 UI 개발. 현재는 환경변수 기반이며 즉시 토글이 아님.
4. 제품 전체 카탈로그 연결, 운영 DB 저장·다중 기기·오류·부하 테스트.
5. 보안 리뷰(서버 키 권한, 남용 및 투표 조작 방지, 데이터 보존), 한국/미국 문구 검토.
6. 사용자에게 노출할 시점에만 main으로 병합, 배포 확인. main에는 아직 없음.

## 계측
필요 이벤트: poll_view, poll_vote_saved, poll_vote_changed, poll_results_view, poll_share_click, poll_error. 운영 게임 100명 KPI 집계와 분리해 수집.

## 출시 기준
승인 없이 활성화하지 않는다. 기존 게임의 CTA, 탐색, 관리자 보드에 진입 버튼을 연결하지 않는다.
