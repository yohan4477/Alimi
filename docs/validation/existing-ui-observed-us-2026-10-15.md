# 기존 Alimi UI에 미국 수동 관측 연결

2026-10-15 KST. 관련 #4 #5 #7 #8 #13. 사용자 정정: ‘원래 좋은 ui 있었잖아’ → 기존 UI에 실제 관측을 연결하는 방향에 ‘ㄱㄱ’. 별도 UI PR #28은 대체 대상이며 main 병합하지 않는다.

## 변경과 유지
main의 최신 dist/app.js, index.html, style.css, model.js, photos.js를 읽고 시작했다. 기존 사진·홈 카드·검색·카테고리·관심·상세·차트·판매처 행·목표가 모달을 재사용했다. model.js/photos.js는 변경하지 않는다. COSRX(id 2) 카드에만 USD 17.50을 표시하고 상세에서 실제 관측/USD와 기존 데모/KRW 전환을 제공한다. 다른 상품과 KRW 목표가·시뮬레이터는 유지한다.

수동 관측: Stylevana US COSRX Advanced Snail 96 Mucin Power Essence 100ml 1개, 상품가 USD 17.50, 확인일 2026-10-15. 출처 https://www.stylevana.com/en_US/cosrx-advanced-snail-96-mucin-power-essence-100ml10777.html . 배송비·세금·재고 unknown, 실시간 아님. iHerb 동일 상품 페이지 링크를 추가하되 미국 가격 미확인으로 표시한다. 실제 이력 1건에 그래프/평균/할인율/최저가를 생성하지 않는다.

USD 목표가는 별도 localStorage 키 alimi-observed-us-cosrx-target-v1에 저장한다. 원화 pricepilot-v1과 분리한다. 실제 관측과의 과거 비교만 표시하며 현재 도달/자동 알림을 주장하지 않는다. 푸시·반복 수집·제휴 정산·판매처 결제 미구현. ALM-002의 28회 수집 검증은 미완료.

## 검증
코드 기준: 04cc95614f743740b6599b774680d332eb2c6ff8.
Linux Node 24.19, Playwright + Chromium headless, 390×844와 1280×900.
- 기존 상품 10개와 이미지, COSRX 카드 USD 가격 통과
- 실제 상세 가격과 판매처 링크 2개, 가상 그래프 없음 통과
- 실제 목표가 16.25 저장 → 데모 목표가 빈 값 → KRW 15000 저장 → USD 16.25 유지 통과
- 관심 토글 후 실제 모드 유지, 새로고침 지속, USD 삭제 통과
- 토리든 검색 및 기존 가상 가격 시뮬레이터 유지 통과
- 모바일/데스크톱 가로 넘침 없음, JS runtime error 없음
- USD 최소 0.01/최대 10000 경계, 음수·0·NaN·Infinity·지수표기·소수 셋째자리 거부, 저장소 오류 fallback 통과

검증은 번들화한 동일 모듈 코드로 실행했다. iPhone Safari·네이티브 iOS·실제 푸시·외부 결제 검증은 아니다. 기존 iOS PR #23/#27은 변경하지 않는다. main 미병합/공개 배포 없음.

## 실행/다음
기존 npm run dev 또는 python3 -m http.server --directory dist 사용. COSRX 카드 → 실제 관측/USD → 목표 상품가 저장 또는 판매처 링크 확인. 기존 UI 시나리오는 UI 데모/KRW 전환으로 확인한다. 다음은 실제 모바일 사용성 및 허용된 반복 가격 공급원 연결이다. 롤백은 이 PR revert로 가능하며 기존 KRW 저장값은 유지된다.
