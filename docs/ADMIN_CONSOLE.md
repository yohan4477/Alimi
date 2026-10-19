# SeoulBeauty 관리자 페이지

## 2026-10-20 행동 데이터 진단 추가

기존 권한 검사 후 `/api/admin?view=metrics`가 최근7일 이벤트별 고유기기 수만 반환한다. 서버 전용 `SUPABASE_SECRET_KEY`가 없으면 미연결, 권한/통신/표본 잘림은 숫자 없이 상태로 표시한다. 운영 연결은 미검증이며 전체 퍼널·주문 KPI 완성이 아니다. [상세 정의·미완료](HANDOFF_IMPLEMENTATION_2026-10-20.md). 아래 수동 기획 영역 설명과 구분한다.

진입 주소: 운영 도메인의 `/admin`. 전략 / 서비스 기획 / 디자인 리뷰 / 개발 / 실행 로드맵 / 관리 대시보드 여섯 탭은 대화에서 보여준 UI를 실제 페이지로 옮긴 수동 스냅샷이다. 실시간 분석·편집 기능은 이번 범위에 없다. 이전 GitHub 문서·저장소 기록을 비공개로 전환하는 기능도 아니다.

디자인 리뷰 탭은 현재 코드와 공개 UX 원칙을 바탕으로 한 **휴리스틱 평가**다. 실제 디자이너 인터뷰 결과나 사용자 실험·실시간 KPI가 아니다. P0/P1 분류, 온보딩·커뮤니티 미리보기, ko/en 표시 전환, 첫 유의미 참여 정의 및 실험안은 [디자인 리뷰 기록](DESIGN_REVIEW.md)에 정리한다. 데이터가 없는 KPI는 미측정으로 표시한다.

**캐릭터 온보딩 기획 시연:** 서비스 기획 탭의 픽셀 가이드 3단계 미리보기는 관리자 페이지 HTML과 공개 정적 CSS/JS로 구성한 로컬 화면 상태 전환이다. 피부/메이크업 고민 선택은 저장·전송하지 않으며, 표시된 채팅방은 정적 기획 예시다. 기본 캐릭터 이미지는 사용자 제공 픽셀 한복 시안을 작은 정적 SVG 래퍼로 표시하는 공개 디자인 자산으로, 실제 소비자 온보딩 구현이나 사용자 추천 데이터가 아니다. 상세 [픽셀 가이드 기획](PIXEL_GUIDE_ONBOARDING.md).

디자인 리뷰에는 **로딩 캐릭터 10종 시뮬레이션**(순환·일시정지·다음 의상)도 포함한다. 이는 실제 고객 네트워크 요청이나 로딩시간 수집이 아닌 시각화이며, 관리자 전용 화면 접근 제어는 기존 서버 방식 그대로 유지한다. 그림은 소형 정적 공개 자산을 공유하며 사용자 피부정보를 캐릭터 의상과 연결하지 않는다.

개발 대시보드: [개발 리뷰·우선순위·완료 게이트](DEVELOPMENT_DASHBOARD.md). 전략·기획·디자인·실행의 연결을 코드/검증/실측으로 구분하며 실시간 Issue/PR 데이터나 실제 매출 수치를 임의 계산하지 않는다. 진입: `/admin#sb-dev`. 필터/탭 링크는 프레젠테이션 전용이다.

## 접근 모델

- 이메일·비밀번호는 Supabase Auth에서 확인한다. 공개 회원가입·자동 관리자 등록은 제공하지 않는다.
- 서버가 `/auth/v1/user`로 매 요청 현재 사용자를 검증한다. 이메일 확인된 비익명 사용자이며 **서버 관리 `app_metadata.seoulbeauty_admin === true`**인 경우만 내용을 제공한다.
- `user_metadata`, 로컬 저장소, 쿼리 문자열, JWT를 검증 없이 디코딩한 값, 이메일 문자열만으로 권한을 부여하지 않는다.
- 토큰은 최대 1시간의 `__Host-` / HttpOnly / Secure / SameSite=Strict 쿠키에 보관한다. 브라우저 스크립트·localStorage에 토큰/refresh token을 보관하지 않는다. 만료 후 다시 로그인한다.
- 인증·페이지 응답은 브라우저·CDN 모두 no-store, 프레임 삽입 금지. 로그인·로그아웃 POST는 고정 운영 origin을 확인한다. 로그인 실패·Auth 장애·일반 계정은 접근 차단한다.
- HTML은 `server/admin-page.html`에 두며 `dist`에 배포하지 않는다. `/admin`과 `/api/admin` 모두 같은 서버 권한 검사를 통과해야 한다. 정적 JS/CSS에는 관리 내용을 넣지 않는다.

## 최초 관리자 지정 — 실제 실행 여부 별도 기록

1. Supabase Authentication에서 운영자가 사용할 이메일 확인된 계정을 준비한다. 일반 계정 생성만으로는 관리 권한이 생기지 않는다.
2. 신뢰할 수 있는 운영 환경에서 Admin API를 사용할 수 있는 secret key를 환경변수 `SUPABASE_SECRET_KEY`로 설정한다. 키를 채팅·코드·브라우저·로그에 넣지 않는다.
3. `node scripts/admin-access.mjs grant <Auth 사용자 UUID>` 실행. 기존 app_metadata를 보존하고 권한을 갱신한 뒤 다시 조회해 검증한다. 사용자 UUID는 실제 Auth 계정과 대조한다.
4. `/admin`에 로그인해 여섯 탭을 확인한다. 다른 일반 계정과 비로그인 접근이 막히는지도 실제 운영 환경에서 확인한다.
5. 회수: 같은 운영 환경에서 `node scripts/admin-access.mjs revoke <UUID>`. 다음 보호 요청은 fresh user metadata 기준으로 차단된다. 이미 브라우저에 표시된 정보를 원격 삭제하는 것은 아니다.

이 세션에서는 Supabase 관리 연결이 권한 오류여서 실제 계정 생성·관리자 지정/회수는 실행하지 않았다. 현재 서버가 관리자라고 판정할 수 있는 계정이 없으면 모두 차단되는 것이 기본 동작이다. 공개 Auth 설정에서 Google은 비활성화, email은 활성화임을 확인했다. Google 활성화는 이 기능에 포함하지 않는다.

## 배포·로컬 실행

Vercel 프로젝트 Alimi (`prj_bhzYxS4laRZwtswrLsBz7rqPTArH`, team `team_Y8Ltu8qbFfcviLInKfzOUQZR`)의 정상 Git main 배포 경로를 사용한다. `vercel.json`의 `outputDirectory=dist`, `/admin` rewrite와 서버 HTML include 설정이 필요하다. 프로젝트 Root Directory는 저장소 루트여야 한다. API 배포 후 비로그인 401/일반 계정 403/관리자 200을 확인한다.

운영 origin 기본값은 `https://alimi-omega.vercel.app`이다. 도메인 변경 시 서버 환경변수 `ADMIN_ORIGIN`을 경로·끝 슬래시 없는 HTTPS origin으로 지정한다. 다른 alias에서 로그인 POST가 차단되면 canonical origin을 사용한다. service-role/secret key는 실행 중인 웹 서버에는 필요 없다.

`npm run dev`는 로컬 HTTP 서버와 실제 관리자 API를 함께 제공한다. `http://localhost:3000/admin` 사용. 이 개발 서버는 127.0.0.1에만 bind한다. 쿠키는 로컬에서도 Secure이며 테스트 브라우저의 loopback 지원이 필요하다. `NODE_ENV=production`에서는 로컬 HTTP origin을 허용하지 않는다.

## 검증과 한계

- Node 보안 테스트: 비로그인/직접 API, 일반 계정, editable metadata 위조, 만료·위조 쿠키, 현재 권한 재조회·회수, Auth 장애, CSRF, 로그인/로그아웃, 쿠키/캐시, 입력 제한.
- `e2e/admin.e2e.mjs`: 테스트 서버에만 Auth 응답을 주입한다. 실제 관리자 생성이나 운영 Auth 검증을 대신하지 않는다. 여섯 탭·개발 우선순위/플랫폼 필터·디자인 리뷰 언어/우선순위 필터·키보드·320/390/1024px·일반 계정 차단·권한 회수·로그아웃을 확인한다.
- 로컬 브라우저 다운로드는 실패했다. CI의 실제 실행 결과를 별도 확인하며 작성한 테스트를 실행 완료로 간주하지 않는다.
- 이 페이지의 문구와 미측정 지표는 `server/admin-page.html`에서 관리한다. 증거 시점·커밋을 표시하고 새 계측·실시간 값처럼 표현하지 않는다. 새 민감 데이터/편집 API를 추가할 때도 서버 권한 검사가 필요하다.

공식 근거: [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [서버 관리 사용자 갱신](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js).
