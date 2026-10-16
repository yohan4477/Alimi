# Stylevana 공식 피드 연결 검증 — 2026-10-17 KST

관련: ALM-002 #8, ALM-006 #12, ALM-F2 #4. 기준 main: 4b86340294c6ae145719da74cc3ed36b07ba12c9.

## 실제 확인

- Awin Alimi (3125007) 로그인 및 이메일 인증 성공. Joined/My Programmes에서 Stylevana (90791) 확인. Product Feed=Yes, Promote 제공.
- Create-a-Feed에서 **AWIN US Product Feed 111294** 선택. 구형 104951은 선택하지 않음.
- 목록상 공급 피드 갱신일 2026-10-16. 실제 다운로드 CSV gzip 해제 후 **24,203행** 파싱 성공.
- 기존 COSRX Advanced Snail 96 Mucin Power Essence 100ml 단품 1개에 대해 canonical URL, 이름, 브랜드, merchant SKU 10759, EAN 8809416470009 일치 확인.
- 상품가 **USD 17.50**, 피드 배송비 **USD 3.99**, in_stock=1. 세금/배송주소/결제 총액은 미확인. 배송비를 확정 총액에 합산하지 않음.
- aw_product_id 43018980482 및 Alimi 퍼블리셔 ID를 포함한 공식 pclick 제휴 링크 수신. 실제 구매/전환/취소/정산 검증은 미실행.
- 상품별 last_updated는 빈 값. 목록의 피드 갱신일, 내려받은 시각, 가격 변경 시각을 동일시하지 않음. collectedAt/observedAt은 이번 수신/처리 시각이고 가격이 바뀐 시각을 뜻하지 않음.

## 구현 및 범위

1. scripts/stylevana-feed.mjs: CSV/gzip 입력, 정확한 상품/미국 통화/피드 식별/링크 검증. 오류 시 기존 스냅샷 보존. 원본 피드 전체를 앱에 배포하지 않음.
2. 정규화 1개 상품을 data/stylevana-us.json, dist/stylevana-data.js, ios/Alimi/stylevana-us.json에 출력. 다운로드 API 키/개인 다운로드 URL은 코드·앱 데이터에 없음.
3. 웹: 기존 COSRX 수동 관측을 보존하며 method=awin_feed 별도 기록, 공식 이미지·USD·제휴 링크·표시 문구 연결. KRW 가상 오퍼와 합산 금지. 10/15 수동 + 10/17 피드 두 날짜이며 중간 가격은 미관측.
4. iOS: COSRX는 별도 공식 USD 상세와 로컬 목표가 저장. 가상 원화 오퍼/목표가와 분리. 공식 이력은 현재 1건이라 추이 그래프를 만들지 않음. 다른 상품은 기존 데모 유지.
5. 동일 피드 가격·재고·배송비가 계속 같으면 날짜가 달라도 가격 이력을 늘리지 않음. collectedAt은 별도 갱신. 바뀐 행만 이력에 추가.
6. GitHub Actions 수집 워크플로는 매일 07:30 KST에 실행하도록 준비. 비밀값 AWIN_STYLEVANA_US_FEED_URL 등록 및 main 병합 전까지 비활성 상태. 갱신 결과는 자동 배포하지 않고 데이터 PR 생성.

## 실행한 검증

- 실제 인증 피드 다운로드 1회, 24,203행 파싱, 정확한 단품 1개 매칭.
- npm test: 20/20 통과 (기존 12개 + 공식 피드 8개). 통화/옵션/식별자 오류, 불명확 매칭, 링크 위변조, CSV, 중복 수집, 실패 시 기존 데이터 보존, 비밀정보 미포함 검증.
- node --check dist/app.js / scripts/stylevana-feed.mjs 통과.
- iOS 소스 연결: PR에서 macOS 시뮬레이터 CI 요청. 본 Linux 환경에서 iOS 빌드/실기기/화면 조작을 통과했다고 주장하지 않음.

## 남은 게이트

- main 병합 승인, GitHub Actions 비밀 저장소에 피드 URL 등록, 실제 스케줄 실행/오류 복구 확인.
- 앱 및 웹 배포, iPhone 실기기 검증, 7일 반복 수집 검증 미완료.
- 가격 이력/푸시/이미지 사용의 세부 프로그램 조건은 제휴 가입과 별개이며 추가 확인 필요. 임의 약관 동의/외부 문의/구매 미수행.
- 배송주소별 총액 비교, 다른 판매처, 실시간 알림, 수익 정산은 연결 완료 아님.

롤백: 이 PR을 되돌리면 기존 10/15 수동 관측 화면으로 복귀. 기존 원장은 수정하지 않음. 비밀 URL을 채팅·PR·앱 assets에 붙이지 않음.

## 2026-10-17 07:43 KST — 승인된 활성화 실행

- 사용자 «ㄱㄱ»로 PR 병합 및 비밀 URL 등록 승인. PR #36 → main 0befc585d0428eec4eafa8b3b8b4f263c8381742 병합 완료.
- iOS PR run 38975751710 및 main run 38976155404에서 빌드/XCTest/시뮬레이터 설치·실행·홈 캡처 성공. 실제 iPhone 검증과 구분.
- GitHub 정상 로그인/2FA 확인 완료 후 AWIN_STYLEVANA_US_FEED_URL을 암호화 Repository secret으로 등록. 값은 코드·문서에 미포함.
- 자동 수집 run 38977354895: 공식 다운로드·파싱 성공, Node 20/20, 데이터 커밋 5065937 생성 및 브랜치 저장 성공. 마지막 gh pr create는 저장소 정책(GitHub Actions is not permitted to create or approve pull requests)으로 실패.
- 추가 권한을 부여하지 않고 마지막 단계를 data/stylevana-us 브랜치 저장으로 변경. 다음 실행 전 기존 브랜치의 이력을 복원하여 main에 미병합된 기간의 수집 이력도 보존. 롤링 데이터 브랜치만 force-with-lease로 갱신하며 main은 갱신하지 않음.
- 예약은 기존 cron 22:30 UTC = 07:30 KST 유지. 사이트·iPhone 실서비스 배포를 뜻하지 않음.

## 활성화 최종 검증 — 2026-10-17 07:46 KST

- PR #37 main ec9d221e424a476f5d1d2b18845482339e4a317e 병합 완료.
- [실제 자동 수집 run 38977590617](https://github.com/yohan4477/Alimi/actions/runs/38977590617) attempt 1·2 모두 Success. 두 번째 job 117230856993에서 이전 data/stylevana-us 브랜치 fetch/restore, 실제 다운로드, 20개 테스트, 브랜치 저장 전부 통과.
- 최종 collectedAt=2026-10-16T22:45:53.318Z (2026-10-17 07:45:53 KST), 24,203행, 매칭 1개, 상품가 USD17.50, 공식 가격 이력 1건 유지. 동일 피드 가격 재수신을 새 가격 변경으로 기록하지 않음.
- 매일 07:30 KST 예약 설정. 이 기록 시점에는 다음 예약 실행 자체는 아직 발생하지 않았으므로 수동 dispatch 성공과 정기 실행 성공을 구분한다.
- 정상 수집·기록은 완료. 앱은 번들 스냅샷이며 데이터 브랜치 검토·main 반영·빌드/배포를 거쳐야 새 수집값이 사용자 화면에 전달된다. 실시간 앱 API·자동 푸시·실기기·7일 검증은 미완료.
