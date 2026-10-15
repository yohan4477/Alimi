# 제품 관리 도입 감사

확인일: 2026-10-15 KST. 기준 main: cbe8887adbc29c7b7ef438b37168528dfbf6fef2.

## 확인 범위

main 전체 파일 트리(잘림 없음), README, ios/README, TEST_RESULTS, docs/architecture-1000-dau, iOS SwiftUI 소스/모델/XCTest, 웹 app/model 및 테스트, iOS workflow, 검증 문서를 읽었다. 기존 Issue는 전체 상태 조회에서 #1 한 건, 댓글 0건이었다. 기존 PR 검색 결과 0건. Actions 전체 1건을 확인했다. 저장소 내 AGENTS.md는 없었다.

| 영역 | 구현 증거 | 검증 증거 | 미확인 |
|---|---|---|---|
| iPhone F1–F5 | [Views](https://github.com/yohan4477/Alimi/blob/cbe8887adbc29c7b7ef438b37168528dfbf6fef2/ios/Alimi/Views.swift), [Models](https://github.com/yohan4477/Alimi/blob/cbe8887adbc29c7b7ef438b37168528dfbf6fef2/ios/Alimi/Models.swift) | XCTest 7/7 | 실제 iPhone, 전체 UI 조작·접근성 |
| 빌드·실행 | XcodeGen, SwiftUI/Charts, iOS 17+ | Xcode 16.4 / iPhone 16 Pro Simulator / iOS 18.5 성공 | 서명 IPA, TestFlight, App Store |
| 저장 | UserDefaults | 별도 Store 재생성 영속성 단위 테스트 | 실기기 종료/재실행 흐름 |
| 가격/알림 | fixture, 메모리 시뮬레이션, 앱 내 상태 | 로직 테스트 | 실제 수집·푸시 미구현 |
| 웹 | dist/ 초기 프로토타입 | TEST_RESULTS의 6/6 기존 기록 | 이번 작업에서 재실행·브라우저 E2E 없음 |
| DAU 1,000 | 아키텍처 제안/용량 산술 | capacity-model-results의 오프라인 모델 | 실제 부하·운영·복구 미검증 |

## Actions 직접 확인

[run 38657001190](https://github.com/yohan4477/Alimi/actions/runs/38657001190), job 116169016989의 상태·단계·원문 로그를 확인했다. 대상 SHA는 6e833c736cb9860d41253f52d4e1dba3d751d2d6이고 main SHA 자체의 실행은 아니다. 두 커밋 비교 결과 차이는 검증 Markdown과 JPEG 추가뿐으로 iOS 소스 차이는 없다.

로그에서 testF1Search, testF2HistoryChangesByProduct, testF3ShippingInclusiveMinimum, testF4Favorites, testF5TargetAndSimulation, testInputValidation, testPersistence 통과와 'Executed 7 tests, with 0 failures', 'TEST SUCCEEDED'를 확인했다. 홈 실행/캡처 단계 성공을 확인했으나 이번 감사에서 스크린샷 이미지를 직접 판독하지 않았고 xcresult 원본도 열지 않았다.

워크플로는 workflow_dispatch 또는 workflow 파일 변경만 트리거한다. 일반 iOS 소스/문서 PR마다 CI가 도는 구조가 아니다. 이번에 워크플로를 수정·실행하지 않았다. artifact 보관 3일이라는 기존 정책을 확인했다.

## 불일치 처리

루트/ios README의 '빌드·XCTest 미실행'을 부분 검증 결과와 연결한다. architecture는 당시 기준을 보존하고 최신 검증·로드맵 우선 참조 메모를 추가한다. 실기기 미실행 항목은 그대로 유지한다.

## 이번 작업의 한계

새로운 앱 빌드·실기기 테스트·부하 테스트·외부 수집·배포를 수행하지 않았다. GitHub Projects 기능은 연결 도구에 없으며 로컬 gh도 없어 보드 생성·기존 보드/권한 확인은 못했다. 앱 코드와 workflow는 변경 대상에서 제외했다. 이후 main/Issues가 바뀌면 이 문서만으로 최신이라고 판단하지 않는다.
