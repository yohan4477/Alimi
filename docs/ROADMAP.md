# Alimi 로드맵

기준: 2026-10-15 KST · 제품 코드 기준 cbe8887adbc29c7b7ef438b37168528dfbf6fef2.
[운영 현황](PRODUCT_STATUS.md) · [기능 원장](FEATURE_REGISTER.md) · [운영 규칙](PRODUCT_OPERATIONS.md)

로드맵 등재는 개발 승인이나 일정 확약이 아니다. 상태·가설·검증 기준·근거의 원장은 각 Issue다. 아래는 해당 날짜 스냅샷이다.

## 현재 — iPhone MVP

| 기능 | 대상 | 우선순위 | 상태 | 선행 조건 |
|---|---|---|---|---|
| [ALM-001 #2](https://github.com/yohan4477/Alimi/issues/2) iPhone MVP 통합 검증 | 소비자 | P0 | 검증 중 | ALM-F1~F5 |
| [ALM-F1 #3](https://github.com/yohan4477/Alimi/issues/3) 상품 검색 | 소비자 | P0 | 검증 중 | 실기기 테스트 환경 |
| [ALM-F2 #4](https://github.com/yohan4477/Alimi/issues/4) 가격 이력과 상세 | 소비자 | P0 | 검증 중 | 실기기 테스트 환경 |
| [ALM-F3 #5](https://github.com/yohan4477/Alimi/issues/5) 배송비 포함 판매처 비교 | 소비자 | P0 | 검증 중 | 실기기 테스트 환경 |
| [ALM-F4 #6](https://github.com/yohan4477/Alimi/issues/6) 관심 상품 저장 | 소비자 | P0 | 검증 중 | 실기기 테스트 환경 |
| [ALM-F5 #7](https://github.com/yohan4477/Alimi/issues/7) 목표가 설정과 앱 내 상태 | 소비자 | P0 | 검증 중 | 실기기 테스트 환경 |

현재 전체 상태는 **검증 중**이다. 기존 빌드/로직 검증이 시작됐고 일부 통과했지만 실기기 게이트가 남았다. 웹 PoC는 별도로 PR #29에서 기존 UI에 실제 수동 관측 1건을 연결했고, 본 PR에서 입력 검증·파일 원장·이력 그래프를 구현했다. [검증 기록](validation/price-history-pipeline-2026-10-15.md). iOS 실기기 게이트의 완료를 의미하지 않는다. [ALM-001 #2](https://github.com/yohan4477/Alimi/issues/2)은 F1–F5 통합 게이트이며 독립 사용자 기능이나 완료 수에 중복 합산하지 않는다.

## 다음 — 순서와 게이트

| 기능 | 대상 | 우선순위 | 상태 | 선행 조건 |
|---|---|---|---|---|
| [ALM-002 #8](https://github.com/yohan4477/Alimi/issues/8) 허가된 실제 가격 수집 | 공통 인프라 | P1 | 수동 입력 기반 PoC 구현; 자동 수집 미완료 | 공급원 이용 권한·접근 및 반복 수집 검증; iOS 게이트 별도 유지 |
| [ALM-003 #9](https://github.com/yohan4477/Alimi/issues/9) DB·인증과 사용자 데이터 격리 | 공통 인프라 | P1 | 아이디어 | ALM-002 PoC 검증 완료; 스키마·보존정책·개발 승인 |
| [ALM-004 #10](https://github.com/yohan4477/Alimi/issues/10) 실제 목표가 푸시 | 소비자 | P1 | 아이디어 | ALM-002/003 검증 완료; APNs 자격·개발 승인 |
| [ALM-005 #11](https://github.com/yohan4477/Alimi/issues/11) 실사용자 실험 | 소비자 | P1 | 아이디어 | ALM-004 검증 완료; 동의·모집·실험계획 승인 |
| [ALM-006 #12](https://github.com/yohan4477/Alimi/issues/12) 제휴 수익화 | 공통 인프라 | P2 | 아이디어 | ALM-005 결과; 제휴 승인·표시·전환 측정 조건; 개발 승인 |
| [ALM-007 #13](https://github.com/yohan4477/Alimi/issues/13) 글로벌 실구매가 비교 | 소비자 | P2 | 아이디어 | ALM-006 검증 완료; 국가별 비용·배송·상품 동일성 확인; 개발 승인 |

1. MVP 실기기 검증 후 ALM-002의 허용 공급원·가격 정확성을 작은 수집 PoC로 확인한다. 초기 파일 기록은 가능하며 서버 구축을 선행하지 않는다.
2. 수집 형식이 검증되면 ALM-003에서 계정/DB 저장·격리와 수집 통합을 확인한다.
3. ALM-004는 실제 가격+DB+계정 이후 진행한다. APNs 수락을 기기 수신과 구분한다.
4. ALM-005의 실제 사용자 실험은 푸시까지 확인한 뒤 한다. 지금 할 F1–F5 사용성 확인과 구분한다.
5. ALM-006→007은 사업 우선순위 게이트다. 제휴 수익화가 글로벌 비교의 기술적 필수조건이라는 뜻은 아니다. 순서 변경은 DECISIONS에 근거와 승인 기록을 남긴다.

각 Issue의 최소 검증/성공·실패 기준을 적용한다. 제안 수치·표본·기간은 실험 전에 확정하고 결과를 본 후 임의 변경하지 않는다. 실패하면 의존 후속 작업을 차단하고 재검증 또는 보류한다.

## 장기 — 전부 개발 미승인

| 기능 | 대상 | 우선순위 | 상태 | 선행 조건 |
|---|---|---|---|---|
| [ALM-101 #14](https://github.com/yohan4477/Alimi/issues/14) 공급자 구매 희망가격 분석 | 공급자 | 장기 | 아이디어 | ALM-005; 충분한 동의 기반 집계 데이터 |
| [ALM-102 #15](https://github.com/yohan4477/Alimi/issues/15) 공급자 할인 제안 | 공급자 | 장기 | 아이디어 | ALM-101 검증; ALM-004; 사용자 수신 동의 |
| [ALM-103 #16](https://github.com/yohan4477/Alimi/issues/16) 경쟁사 가격 모니터링 | 공급자 | 장기 | 아이디어 | ALM-002; 동일 상품 매칭; 데이터 사용 권한 |
| [ALM-104 #17](https://github.com/yohan4477/Alimi/issues/17) 재고·재입고 수요 분석 | 공급자 | 장기 | 아이디어 | ALM-002/005; 재고 신호·동의된 수요 데이터 |
| [ALM-105 #18](https://github.com/yohan4477/Alimi/issues/18) 국가별 한국 상품 수요 분석 | 공급자 | 장기 | 아이디어 | ALM-007/005; 국가별 대표성·개인정보 검토 |
| [ALM-106 #1](https://github.com/yohan4477/Alimi/issues/1) SNS 인플루언서 상품 발견 | 소비자 | 장기 | 아이디어 | ALM-007; 상품 동일성·콘텐츠 권한; 기존 #1 |
| [ALM-107 #19](https://github.com/yohan4477/Alimi/issues/19) 공급자 데이터 API | 공급자 | 장기 | 아이디어 | ALM-101/103/105 중 검증된 가치; 이용권·격리·가격정책 |


## 기존 설계와의 관계

[DAU 1,000 설계](architecture-1000-dau.md)의 비용·인프라·부하 모델은 제안이다. M0는 ALM-001, M1은 ALM-003, M2는 ALM-002, M3는 ALM-004에 연결한다. M4~M6 규모/복구 검증은 실제 데이터/DB/알림 이후의 출시 게이트다. 과거 문서의 DB→수집 순서보다 이번 로드맵의 작은 수집 PoC→DB 통합 순서를 우선한다. 용량 산술 검증은 1,000 DAU 운영 검증이 아니다.


## 2026-10-17 — 공식 피드 연결의 다음 게이트

ALM-002 공급원 승인 대기는 해소: Stylevana 미국 공식 피드 수신 1회 성공. ALM-002는 구현 중, 반복 검증 미완료. ALM-006은 승인 링크·표시 코드 구현 중이며 전환·정산 검증 전이다. 사용자 “연결”은 이 1개 상품의 공식 데이터/링크 연결 범위로 적용했다. 전체 출시·유료 인프라·다른 판매처 계약 승인으로 확대하지 않는다.

다음: main 병합 → 비밀 URL 등록 → 수집 워크플로 실행/갱신 PR 검증 → iOS/웹 배포 환경 확인 → 반복 수집·실기기 검증. [근거](validation/stylevana-official-feed-2026-10-17.md). 기존 7일 게이트는 유지.
