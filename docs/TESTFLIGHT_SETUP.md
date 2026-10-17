# Alimi TestFlight 배포 준비

현재 iOS 앱은 `ios/` 아래 SwiftUI 네이티브 앱입니다. 기존 `ios.yml` 워크플로는 시뮬레이터 빌드·테스트용이며, iPhone 설치용 서명과 App Store Connect 업로드는 하지 않습니다. 새 `testflight.yml` 워크플로는 설정 완료 후 수동으로 서명된 IPA를 업로드합니다.

## 먼저 App Store Connect에서 준비

1. Apple Developer Program 멤버십이 활성화됐는지 확인합니다.
2. Apple Developer 계정의 **Certificates, Identifiers & Profiles**에서 Alimi용 App ID를 등록합니다. Bundle ID는 앱 등록 때 사용할 값과 정확히 같아야 합니다.
3. App Store Connect에서 Alimi 앱 레코드를 만듭니다. 플랫폼은 iOS, Bundle ID는 2번에서 등록한 값, SKU는 계정 안에서 고유한 문자열을 사용합니다. 앱 레코드는 첫 빌드 업로드 전에 필요합니다.
4. App Store Connect의 **Users and Access → Integrations → App Store Connect API → Team Keys**에서 API 키를 만듭니다. 개인 키는 생성 직후 안전한 곳에 보관합니다. 자동 서명에 필요한 권한이 있는 Team Key를 사용해야 합니다. 개인용 API 키는 Apple의 프로비저닝 API를 사용할 수 없어 이 워크플로의 자동 서명에 맞지 않습니다.

Apple은 2026년부터 TestFlight 업로드용 iOS 앱 빌드에 Xcode 26 이상을 요구합니다. 이 워크플로는 GitHub의 macOS 26 runner를 사용합니다.

## GitHub 저장소 설정

Alimi 저장소의 **Settings → Secrets and variables → Actions**에서 추가합니다.

### Secrets

| 이름 | 값 |
|---|---|
| `APP_STORE_CONNECT_KEY_ID` | Team API 키 ID |
| `APP_STORE_CONNECT_ISSUER_ID` | App Store Connect API issuer ID |
| `APP_STORE_CONNECT_API_KEY_P8` | 다운로드한 `.p8` 개인 키 파일의 전체 내용 |

`ASC_KEY_ID`·`ASC_ISSUER_ID`·`ASC_KEY_P8` 이름으로 등록된 Secret도 같은 값으로 인식합니다(현재 저장소 설정). 개인 키를 채팅, 커밋, 일반 저장소 변수에 넣지 않습니다. 저장소 Secret에만 저장합니다.

### Variables

| 이름 | 값 |
|---|---|
| `APPLE_TEAM_ID` | Apple Developer 계정의 10자리 Team ID |
| `IOS_BUNDLE_ID` | App ID와 App Store Connect 앱 레코드에 등록한 Bundle ID |

변수가 없으면 `APPLE_TEAM_ID`는 같은 이름의 Secret을, `IOS_BUNDLE_ID`는 등록된 `com.yohan4477.alimi`를 사용합니다. App Store Connect 앱 레코드: `Alimi: K-Beauty Price Alerts`. Bundle ID는 현재 XcodeGen 기본값인 `com.alimi.prototype`을 그대로 쓰기보다, 계정에서 등록 가능한 Alimi 전용 값으로 정한 뒤 App ID와 App Store Connect 앱에 동일하게 등록합니다. 워크플로가 빌드 때 해당 변수로 Bundle ID를 덮어씁니다.

## 수동 업로드

1. GitHub 저장소의 **Actions → Alimi TestFlight upload → Run workflow**로 이동합니다.
2. 브랜치는 `main`을 선택합니다.
3. `confirm_upload`을 체크하고 실행합니다. 기본값은 꺼져 있으며, 이 워크플로는 자동으로 업로드하지 않습니다.
4. GitHub Actions 로그에서 서명·내보내기·Transporter 업로드 결과를 확인합니다.
5. Apple의 빌드 처리가 끝나면 App Store Connect의 **TestFlight** 탭에서 빌드를 확인하고 내부 테스터를 추가합니다. 외부 테스터 그룹에 처음 배포하는 빌드는 Apple 베타 심사를 거칠 수 있습니다.

성공적인 업로드 직후 빌드가 바로 보이지 않을 수 있습니다. Apple이 빌드를 처리한 뒤 TestFlight에 표시됩니다.

## 테스트 범위와 현재 한계

TestFlight 설치는 실제 iPhone에서 실행하는 게이트를 통과하게 해 주지만, 그 자체가 앱의 모든 기능 검증을 의미하지는 않습니다. 현재 main의 앱은 가격·판매처 데이터 대부분이 예시 데이터이고, Stylevana 공식 피드 연결은 COSRX 100ml 상품 한 건에 한정됩니다. 실제 가격 하락 푸시 전달은 아직 main에서 검증되지 않았습니다. 업로드 후에는 실제 iPhone에서 검색·상세·판매처 비교·관심 상품 저장·목표가 설정을 직접 확인하고, 검증 결과를 별도로 기록해야 합니다. PR #40의 APNs 경로는 아직 main에 반영되지 않은 별도 변경입니다.

## 근거

- [Apple: 빌드 업로드](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds)
- [Apple: TestFlight 개요](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview)
- [Apple: App Store Connect API 키](https://developer.apple.com/documentation/AppStoreConnectAPI/creating-api-keys-for-app-store-connect-api)
- [Apple: Xcode 클라우드 서명 설명](https://developer.apple.com/videos/play/wwdc2021/10204/)
