# SeoulBeauty 운영 현황

## 2026-10-19 전략·기획 분리

[전략](STRATEGY.md) · [서비스 기획](SERVICE_PLAN.md) · [현재 실행 로드맵](ROADMAP.md)을 기준으로 한다. 이번 작업은 문서 정리이며 앱 변경·새 테스트·배포·사용자 실험을 수행한 것이 아니다. 아래 과거 스냅샷의 제목 “지금”·“다음”은 당시 시점이다.

직전 #89 작업에서 기록한 증거: 웹 테스트 69개 및 브라우저 CI #44 통과, iOS #115의 단위 20개·UI 8개 통과(당시 커밋 기준), main `6dfb8db` TestFlight 1.0(15.1) 업로드 성공. Apple 처리·실기기 설치는 미확인, 웹 운영 배포는 당시 Vercel build-rate-limit으로 차단. 이는 직전 기록이며 이번 문서 작업에서 재검증한 현재 배포 상태가 아니다. [PR #89 검증·제한](https://github.com/yohan4477/Alimi/pull/89).

---

## 2026-10-19 현재 방향 — 이전 가격 추적 계획 대체

커뮤니티·대화가 중심이다. 상품 탐색·현재 가격·구매처·관심 저장은 선택을 지원한다.
가격 이력·목표가·가격 알림은 현재 소비자 기능에서 제외하고 관심 저장 시 추적을 새로 시작하지 않는다.
구현 변경 및 검증은 이번 후속 PR에서 확인한다. 아래 과거 기록의 추적 MVP 계획은 현재 출시 약속이 아니다.
기존 서버 수집·데이터를 삭제하거나 중단한 것으로 해석하지 않는다. [현재 비전](PRODUCT_VISION.md) · [결정 D-012](DECISIONS.md).

---


**확인 기준: 2026-10-15 KST / 웹 PoC는 main PR #29 및 본 가격 이력 PR 기준. iOS 검증 기록은 기존 스냅샷 유지.**
수동 갱신 스냅샷이며 자동 실시간 보드가 아니다. 최신 상태는 연결된 Issues의 이력을 확인한다.
[비전](PRODUCT_VISION.md) · [로드맵](ROADMAP.md) · [기능 인덱스](FEATURE_REGISTER.md) · [운영 규칙](PRODUCT_OPERATIONS.md) · [결정](DECISIONS.md)

## 2026-10-17 추가 확인 — Stylevana 공식 피드

사용자 “연결” 지시에 따라 공식 피드 수신과 웹/iOS 코드 연결을 구현 중이다. 이 절이 아래 10/15 스냅샷의 계정/피드 미확인 상태를 대체한다. 전체 출시/검증 완료를 뜻하지 않는다. PR #36은 사용자 승인 후 main 0befc585에 병합됐고, iPhone main 빌드 [38976155404](https://github.com/yohan4477/Alimi/actions/runs/38976155404)도 통과했다.

- **승인·수신 확인:** Stylevana 90791, 미국 피드 111294, 24,203행, COSRX 100ml 단품 USD 17.50, 공식 제휴 링크 확보.
- **구현:** 웹 및 iPhone 공식 USD 스냅샷 연결, 기존 수동 이력 보존. [검증 기록](validation/stylevana-official-feed-2026-10-17.md).
- **검증:** 실제 브라우저 다운로드 및 GitHub Actions 다운로드 성공 / Node 테스트 20/20 / iOS PR 및 main 빌드·XCTest·시뮬레이터 실행 통과.
- **수집 설정:** 비밀 URL 등록 완료. 첫 자동 실행 38977354895에서 수신·검증·데이터 브랜치 저장 성공. 저장소의 Actions PR 생성 제한으로 마지막 PR 단계만 실패하여, 추가 권한 없이 data/stylevana-us 전용 브랜치에 저장하는 방식으로 수정해 PR #37을 main ec9d221e에 병합했다. 기존 수집 이력은 다음 실행에 복원한다. 매일 07:30 KST 예약이며 실제 시각은 실행 대기열에 따라 달라질 수 있다.
- **남음:** 앱/웹 배포. 자동 수집 run 38977590617 attempt 1·2 성공; 이전 이력 복원·중복 방지 확인. 자동 푸시·총액 비교·7일 반복 검증 미완료. main/앱 번들 데이터의 최신화는 검토·병합 후 반영된다.

## 지금

| 구분 | 확인된 상태 | 근거 / 다음 행동 |
|---|---|---|
| 현재 구현 중 | 기존 웹 UI에 검증된 수동 가격 입력·이력 저장 연결 | [검증 기록](validation/price-history-pipeline-2026-10-15.md); [PR #30](https://github.com/yohan4477/Alimi/pull/30); 병합 상태는 PR에서 확인 |
| 최우선 검증 중 | [ALM-001 #2](https://github.com/yohan4477/Alimi/issues/2), F1–F5 | 시뮬레이터 로직 부분 검증; 실기기 조작 기록 필요 |
| 최근 통과한 검증 | 빌드, XCTest 7/7, 시뮬레이터 설치·실행·홈 캡처 | [Actions](https://github.com/yohan4477/Alimi/actions/runs/38657001190), [검증 기록](validation/ios-build-2026-10-15.md) |
| 기능 전체 검증 완료 | 없음 | 실기기/UI 통합 게이트 미완료 |
| 출시 | 확인된 출시 없음 | TestFlight/App Store/실제 배포 증거 없음 |
| 실제 가격·DB·인증·푸시 | 웹 수동 관측 1건; 자동 수집·DB·인증·푸시 미연결 | [ALM-002 #8](https://github.com/yohan4477/Alimi/issues/8)→[ALM-003 #9](https://github.com/yohan4477/Alimi/issues/9)→[ALM-004 #10](https://github.com/yohan4477/Alimi/issues/10) |

## 차단과 다음 우선순위

| 순서 | 작업 | 차단/해제 조건 |
|---|---|---|
| 1 | F1–F5 실기기 검증 | Mac/Xcode·서명 가능한 실행 환경·실제 iPhone·검증 담당자 확보; 테스트 결과 첨부 |
| 2 | 실제 가격 PoC | 수동 입력 기반 구현·검증; 공급원 접근·이용 조건 및 반복 수집 검증 필요 |
| 3 | DB·인증 설계 검증 | 가격 PoC 형식/결과와 계정 격리 조건 확정 |
| 4 | 푸시→사용자 실험→제휴→글로벌 | 각 선행 Issue의 검증 기준 및 승인 충족 |

## 장기 아이디어 — 개발 미승인

| 기능 | 대상 | 우선순위 | 상태 | 선행 조건 |
|---|---|---|---|---|
| [ALM-101 #14](https://github.com/yohan4477/Alimi/issues/14) 공급자 구매 희망가격 분석 | 공급자 | 장기 | 아이디어 | ALM-005; 충분한 동의 기반 집계 데이터 |
| [ALM-102 #15](https://github.com/yohan4477/Alimi/issues/15) 공급자 할인 제안 | 공급자 | 장기 | 아이디어 | ALM-101 검증; ALM-004; 사용자 수신 동의 |
| [ALM-103 #16](https://github.com/yohan4477/Alimi/issues/16) 경쟁사 가격 모니터링 | 공급자 | 장기 | 아이디어 | ALM-002; 동일 상품 매칭; 데이터 사용 권한 |
| [ALM-104 #17](https://github.com/yohan4477/Alimi/issues/17) 재고·재입고 수요 분석 | 공급자 | 장기 | 아이디어 | ALM-002/005; 재고 신호·동의된 수요 데이터 |
| [ALM-105 #18](https://github.com/yohan4477/Alimi/issues/18) 국가별 한국 상품 수요 분석 | 공급자 | 장기 | 아이디어 | ALM-007/005; 국가별 대표성·개인정보 검토 |
| [ALM-106 #1](https://github.com/yohan4477/Alimi/issues/1) SNS 인플루언서 상품 발견 | 소비자 | 장기 | 아이디어 | ALM-007; 상품 동일성·콘텐츠 권한; 기존 #1 |
| [ALM-107 #19](https://github.com/yohan4477/Alimi/issues/19) 공급자 데이터 API | 공급자 | 장기 | 아이디어 | ALM-101/103/105 중 검증된 가치; 이용권·격리·가격정책 |


## 증거 범위

[감사 기록](validation/product-audit-2026-10-15.md)에 코드·문서·Issues·Actions 대조 결과를 기록했다. 진척률은 산출하지 않는다. Projects는 도구 기능 미지원으로 미생성, 이 페이지가 현재 통합 현황이다.

