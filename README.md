# Alimi — iPhone 가격 추적 앱

현재 개발 대상은 **Alimi iPhone 앱**입니다. `ios/`의 SwiftUI 소스와 [iOS 실행 안내](ios/README.md)를 참고하세요. 시뮬레이터 빌드·XCTest 7개·홈 실행/캡처는 통과했으며, 실제 iPhone과 전체 UI 조작 검증은 미완료입니다. [검증 기록](docs/validation/ios-build-2026-10-15.md)을 참고하세요.

아래 `dist/`는 초기 PricePilot 웹 프로토타입이며 네이티브 앱과는 별도입니다.

## 실행

Node.js 20+ 및 Python 3 필요. 외부 패키지 설치 없이:

```sh
npm test
npm run dev
```

http://localhost:3000 접속. `dist/index.html`을 file://로 직접 열면 ES 모듈이 차단될 수 있으므로 HTTP 서버를 사용하세요.

## 구현

- F1 브랜드/상품명/영문 키워드 검색 및 카테고리 필터
- F2 선택 상품 상세 및 30일 SVG 가격 그래프
- F3 배송비 포함 총액으로 판매처 정렬 및 최저가 표시 (동률 포함)
- F4 관심 상품 추가/삭제, 관심 목록, localStorage 저장
- F5 목표가 저장/삭제, 가상 가격 변경/복원, 목표가 이하 상태 표시
- K-뷰티 상품 10개. 제품 일러스트는 실제 포장 이미지가 아닙니다.
- 모바일 760px 이하 세로 구성, PC 상품 그리드+상세 패널

## 구조

- `dist/model.js`: 상품 fixture 및 독립 검증 가능한 도메인 로직
- `dist/app.js`: DOM UI와 상태 연결
- `dist/style.css`: 반응형 스타일
- `tests/features.test.js`: Node 기본 테스트 러너
- `TEST_RESULTS.md`: 입력/예상/실제 결과와 검증 한계

## 범위와 한계

가격, 판매처, 배송일, 가격 이력은 전부 가상입니다. 실상품 명칭은 탐색 예시입니다. 배송비는 fixture의 고정 숫자를 합산할 뿐 실제 배송비 계산 API가 아닙니다. 현재는 한국·KRW만 지원합니다. 로그인·서버 DB·알림 발송·실시간 수집·결제·제휴·세금·해외배송 계산은 없습니다.

관심 상품과 목표가는 같은 브라우저의 localStorage에 저장됩니다. 시뮬레이션 값은 메모리에만 있어 새로고침 시 초기화됩니다. 저장소 차단 시 화면 내 상태만 유지하고 안내합니다.

다국어 확장은 상품 ID를 유지하면서 브랜드/명칭 번역 필드와 UI 메시지 사전을 추가하는 방식으로 진행합니다. 현재 한국어 문구는 app.js/index.html에 있으며 메시지 사전 분리는 아직 미구현입니다. `Intl.NumberFormat`으로 숫자를 표시합니다.

## 과거 웹 프로토타입 검증 제안

현재 iPhone 우선순위와 선행 관계는 [제품 로드맵](docs/ROADMAP.md)이 기준입니다. 아래 목록은 초기 웹 초안의 후속 제안이며 현재 실행 순서가 아닙니다.

### 웹 제안 (추가 개발 승인 후)

1. 실제 모바일/PC 브라우저에서 F1–F5 사용성 검증 및 스크린샷 확보
2. UI 문구 사전 분리 및 영어 화면 한 개 검증
3. 한 판매처·한 상품의 허용된 실제 데이터 공급원 연결
4. 가격 정규화/동일 상품 매칭/수집 시각 검증 후 알림 연결

실서비스 공개 또는 유료 인프라 도입은 별도 승인 대상입니다.

## 제품 관리 시작점

[운영 현황](docs/PRODUCT_STATUS.md) · [제품 비전](docs/PRODUCT_VISION.md) · [로드맵](docs/ROADMAP.md) · [기능/Issue 인덱스](docs/FEATURE_REGISTER.md) · [의사결정](docs/DECISIONS.md) · [운영 규칙](docs/PRODUCT_OPERATIONS.md)

새 아이디어는 기존 이슈 중복 확인 후 기능 카드로 기록합니다. 개발 승인·검증 완료·출시는 별도 근거가 필요합니다.


## Stylevana 공식 피드 (2026-10-17 구현 브랜치)

COSRX 100ml 단품에 한해 Stylevana 미국 공식 피드 스냅샷·USD·제휴 링크를 웹/iOS에 연결했다. [실제 수신 결과와 남은 게이트](docs/validation/stylevana-official-feed-2026-10-17.md). 위 초기 가상 데이터 설명의 예외는 이 상품 1개뿐이다. main 병합 및 실제 자동 수집 실행 검증을 완료했다. 앱/웹 배포와 자동 푸시는 미완료다.

다운로드한 CSV/gzip 재현: `node scripts/stylevana-feed.mjs <downloaded-feed.csv.gz>`. 주기 수집에는 GitHub Actions secret `AWIN_STYLEVANA_US_FEED_URL`이 필요하다. 비밀 다운로드 URL을 코드 또는 앱에 넣지 않는다. 워크플로는 매일 07:30 KST에 수집하며 결과를 `data/stylevana-us` 브랜치에 누적한다. 저장소의 Actions PR 생성 권한을 확대하지 않는다. 데이터 검토/병합·앱 빌드/배포 전까지 배포 스냅샷은 바뀌지 않는다. [최초 수집 및 이력 복원 성공](https://github.com/yohan4477/Alimi/actions/runs/38977590617). `history`는 가격·재고가 바뀐 관측만, `checks`는 성공한 모든 수집(최근 180회)을 기록한다. 가격이 그대로여도 `checks`로 수집 여부를 확인한다. `Stylevana feed freshness` 워크플로가 매일 12:30 KST에 데이터 브랜치를 검사해 마지막 성공 수집이 36시간을 넘으면 실패한다(`node scripts/feed-freshness.mjs`).
