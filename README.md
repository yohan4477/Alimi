# SeoulBeauty — 한국 뷰티 커뮤니티

해외 이용자가 한국 화장품에 대한 경험을 나누고, 대화 속 상품을 발견해 선택·구매로 연결하는 서비스를 만든다. GitHub 저장소와 일부 앱·빌드 식별자는 기존 Alimi 이름을 유지한다.

## 제품 관리 시작점

| 문서 | 다루는 질문 |
|---|---|
| [제품 비전](docs/PRODUCT_VISION.md) | 무엇을 위해 만드는가? |
| [전략](docs/STRATEGY.md) | 누구의 어떤 문제를 풀고 어디에 집중하는가? |
| [서비스 기획](docs/SERVICE_PLAN.md) | 어떤 화면과 행동으로 가치를 제공하는가? |
| [실행 로드맵](docs/ROADMAP.md) | 무엇을 먼저 검증하고 추진하는가? |
| [기획박스 #26](https://github.com/yohan4477/Alimi/issues/26) | 기존 아이디어·상세 Issue는 어디에 연결되는가? |
| [관리 대시보드](docs/PRODUCT_STATUS.md) | 현재 우선순위·구현/검증/배포·커뮤니티와 구매 성과는? |

[의사결정](docs/DECISIONS.md) · [기능 ID 인덱스](docs/FEATURE_REGISTER.md) · [운영 규칙](docs/PRODUCT_OPERATIONS.md) · [커뮤니티 구현 상세](docs/COMMUNITY_COMMERCE.md)

## 현재 범위

커뮤니티·대화, 브랜드·상품 탐색, 상품 설명·후기, 현재 가격·판매처 연결과 관심 저장이 중심이다. 구현 유무와 실제 환경의 검증·출시 상태는 구분한다.

소비자 가격 이력·목표가·가격 알림은 제외했다. 새 카탈로그 상품 저장은 기기 내 스냅샷이며 가격 추적을 시작하지 않는다. 과거 데이터와 서버 수집 코드를 전부 삭제하거나 중단한 것은 아니다. 현재 가격·배송·세금·재고는 판매처에서 최종 확인한다.

## 웹 실행

Node.js 20+ 및 Python 3:

```sh
npm test
npm run dev
```

http://localhost:3000 접속. `dist/`가 웹 앱, `ios/`가 SwiftUI iPhone 앱이다. [iOS 실행 안내](ios/README.md) · [TestFlight 설정](docs/TESTFLIGHT_SETUP.md). 실제 서비스 연결·계정·배포 상태는 최신 근거와 환경을 확인한다.

## 과거 기록

[초기 가격 추적 프로토타입 README](docs/archive/README_PRICE_TRACKING.md)와 [이전 로드맵](docs/archive/ROADMAP_PRICE_TRACKING.md)은 과거 구현·가설의 보관본이다. 현재 범위와 개발 순서를 정하는 문서로 사용하지 않는다. 공식 피드 수집의 이전 실행 기록은 [검증 문서](docs/validation/stylevana-official-feed-2026-10-17.md)에 보존한다. 비밀 피드 URL을 코드·앱·문서에 넣지 않는다.
