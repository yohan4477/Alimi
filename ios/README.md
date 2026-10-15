# Alimi — iPhone 네이티브 앱

SwiftUI + Swift Charts, iOS 17 이상, iPhone 전용. 외부 런타임 라이브러리 없음.

## Mac에서 실행

1. Xcode와 XcodeGen 설치 (`brew install xcodegen`).
2. 이 디렉터리에서 `xcodegen generate` 실행.
3. 생성된 `Alimi.xcodeproj`를 Xcode로 열기.
4. Alimi scheme과 설치된 iPhone 시뮬레이터를 선택하고 Run.
5. Product → Test로 XCTest 7개 실행.

실제 iPhone 실행 시 Signing & Capabilities에서 본인 Team과 고유 Bundle Identifier를 설정합니다. 배포용 인증서, TestFlight, App Store 배포는 이번 작업에 포함하지 않았습니다.

## 화면과 기능

- 홈: 브랜드/상품 검색, 카테고리, K-뷰티 10개 상품 카드
- 상세: 네이티브 화면 전환, 7일/30일 그래프, 배송비 포함 최저가, 판매처 비교
- 관심 상품: 하트 등록/해제, 검색, UserDefaults 저장
- 알림: 목표가별 현재 상태, 상세로 이동
- 목표가: bottom sheet에서 입력/검증/저장/삭제
- 시뮬레이션: 브랜드몰 B 가격 변경/복원 → 가격/차트/최저가/알림 상태 함께 갱신

모든 가격/판매처/배송일/이력은 가상 데이터. 제품 표시는 대체 일러스트. 시뮬레이션은 앱 재시작 시 초기화됩니다. 실제 푸시·가격 수집·제휴 링크는 없습니다.

## UI 참고와 검증 상태

폴센트 공식 사이트의 공개 앱 이미지와 가격 그래프/목표가 설명을 참고했습니다.
https://www.fallcent.com/
https://fallcent.com/static/assets/v2/main/eg-app-image.png

브랜드는 Alimi. 공개 이미지에서 확인할 수 없는 화면은 자체 구성했으므로 픽셀 단위 복제나 폴센트의 현재 전체 UI 일치로 주장하지 않습니다. 사용자의 화면 캡처를 받으면 조정합니다.

초기 코드는 Xcode/Swift가 없는 Linux 환경에서 작성했습니다. 이후 [2026-10-15 검증 기록](../docs/validation/ios-build-2026-10-15.md)과 Actions에서 시뮬레이터 빌드·XCTest 7/7·홈 실행/캡처 성공을 확인했습니다. 전체 UI 조작·접근성 및 실제 iPhone 실행은 **미검증**입니다. 웹 테스트 통과는 iOS 검증을 대체하지 않습니다. 앱 아이콘과 다국어 메시지 카탈로그는 후속 작업입니다.

## 최소 기능 검증 체크리스트

아래 실제 iPhone 조작 결과는 아직 미실행입니다. 단위 테스트 통과와 구분합니다. [MVP 검증 Issue #2](https://github.com/yohan4477/Alimi/issues/2)에서 기능별 결과를 관리합니다.

| ID | 입력 | 기대 결과 | iOS 실제 결과 |
|---|---|---|---|
| F1 | 조선미녀 검색 | 상품 1개 | 미실행 |
| F2 | 상품 1→2 상세 선택 | 제목/그래프 변경 | 미실행 |
| F3 | 조선미녀 판매처 비교 | B 15,700원 최저 | 미실행 |
| F4 | 하트→관심 탭→앱 재시작 | 추가/유지, 해제 시 제거 | 미실행 |
| F5 | 목표 15,000→시뮬레이션 14,000 | 목표가 도달, 복원 시 대기 | 미실행 |

첫 실행 시 위 체크리스트와 XCTest를 통과한 뒤 UI 검증 완료로 판정합니다.
