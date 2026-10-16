# 기능 원장 인덱스

2026-10-15 KST. 각 Issue가 상세 정보의 원장이다. 기존 F1–F5 명칭을 유지하며 ALM 접두어를 부여했다. ALM-001은 통합 게이트이므로 사용자 기능 수에 중복 합산하지 않는다.

| 기능 | 대상 | 우선순위 | 상태 | 선행 조건 |
|---|---|---|---|---|
| [ALM-001 #2](https://github.com/yohan4477/Alimi/issues/2) iPhone MVP 통합 검증 | 소비자 | P0 | 검증 중 | ALM-F1~F5 |
| [ALM-F1 #3](https://github.com/yohan4477/Alimi/issues/3) 상품 검색 | 소비자 | P0 | 검증 중 | 실기기 테스트 환경 |
| [ALM-F2 #4](https://github.com/yohan4477/Alimi/issues/4) 가격 이력과 상세 | 소비자 | P0 | 검증 중 | 실기기 테스트 환경 |
| [ALM-F3 #5](https://github.com/yohan4477/Alimi/issues/5) 배송비 포함 판매처 비교 | 소비자 | P0 | 검증 중 | 실기기 테스트 환경 |
| [ALM-F4 #6](https://github.com/yohan4477/Alimi/issues/6) 관심 상품 저장 | 소비자 | P0 | 검증 중 | 실기기 테스트 환경 |
| [ALM-F5 #7](https://github.com/yohan4477/Alimi/issues/7) 목표가 설정과 앱 내 상태 | 소비자 | P0 | 검증 중 | 실기기 테스트 환경 |
| [ALM-002 #8](https://github.com/yohan4477/Alimi/issues/8) 허가된 실제 가격 수집 | 공통 인프라 | P1 | 구현 중 (2026-10-17 공식 피드 1회 수신) | 반복 수집·실기기·비밀 URL 설정 게이트 유지 |
| [ALM-003 #9](https://github.com/yohan4477/Alimi/issues/9) DB·인증과 사용자 데이터 격리 | 공통 인프라 | P1 | 아이디어 | ALM-002 PoC 검증 완료; 스키마·보존정책·개발 승인 |
| [ALM-004 #10](https://github.com/yohan4477/Alimi/issues/10) 실제 목표가 푸시 | 소비자 | P1 | 아이디어 | ALM-002/003 검증 완료; APNs 자격·개발 승인 |
| [ALM-005 #11](https://github.com/yohan4477/Alimi/issues/11) 실사용자 실험 | 소비자 | P1 | 아이디어 | ALM-004 검증 완료; 동의·모집·실험계획 승인 |
| [ALM-006 #12](https://github.com/yohan4477/Alimi/issues/12) 제휴 수익화 | 공통 인프라 | P2 | 구현 중 (Stylevana 승인 링크 연결) | ALM-005 결과; 실제 전환·취소·정산 검증 |
| [ALM-007 #13](https://github.com/yohan4477/Alimi/issues/13) 글로벌 실구매가 비교 | 소비자 | P2 | 아이디어 | ALM-006 검증 완료; 국가별 비용·배송·상품 동일성 확인; 개발 승인 |
| [ALM-101 #14](https://github.com/yohan4477/Alimi/issues/14) 공급자 구매 희망가격 분석 | 공급자 | 장기 | 아이디어 | ALM-005; 충분한 동의 기반 집계 데이터 |
| [ALM-102 #15](https://github.com/yohan4477/Alimi/issues/15) 공급자 할인 제안 | 공급자 | 장기 | 아이디어 | ALM-101 검증; ALM-004; 사용자 수신 동의 |
| [ALM-103 #16](https://github.com/yohan4477/Alimi/issues/16) 경쟁사 가격 모니터링 | 공급자 | 장기 | 아이디어 | ALM-002; 동일 상품 매칭; 데이터 사용 권한 |
| [ALM-104 #17](https://github.com/yohan4477/Alimi/issues/17) 재고·재입고 수요 분석 | 공급자 | 장기 | 아이디어 | ALM-002/005; 재고 신호·동의된 수요 데이터 |
| [ALM-105 #18](https://github.com/yohan4477/Alimi/issues/18) 국가별 한국 상품 수요 분석 | 공급자 | 장기 | 아이디어 | ALM-007/005; 국가별 대표성·개인정보 검토 |
| [ALM-106 #1](https://github.com/yohan4477/Alimi/issues/1) SNS 인플루언서 상품 발견 | 소비자 | 장기 | 아이디어 | ALM-007; 상품 동일성·콘텐츠 권한; 기존 #1 |
| [ALM-107 #19](https://github.com/yohan4477/Alimi/issues/19) 공급자 데이터 API | 공급자 | 장기 | 아이디어 | ALM-101/103/105 중 검증된 가치; 이용권·격리·가격정책 |


모든 카드에 문제, 대상, 가설, 우선순위, 상태, 선행 조건, 최소 검증, 성공·실패 조건, 코드·테스트·PR 근거를 연결했다. 미구현 카드의 PR/테스트는 '없음'이다. #1의 원문은 그대로 보존하고 관리 카드만 덧붙였다.

