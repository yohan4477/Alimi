# COSRX 미국 판매처 실제 비교 1차 검증 — 2026-10-17 KST

## 판정
공개 상품가 및 배송 정책 대조는 수행했다. **동일 제형·동일 배송지에서 구매 가능한 총액 2곳 비교는 미완료**다. 최저가·실제 절감액·가격 추세를 확정하지 않는다.
검증 데이터는 data/validation/cosrx-retailer-review-2026-10-17.json에 기존 productId=2 및 PR #34 compareOffers 필드로 연결했다. 연구 검증 입력이며 운영 피드나 가격 이력이 아니다. 권한과 최신성 미확인 데이터를 운영 원장·브라우저 모듈로 승격하지 않는다.

## 기준과 현재 상태
- 제품: COSRX Advanced Snail 96 Mucin Power Essence, 100mL (공식 3.38 fl.oz), 단품 1병, 에센스. 92 크림, Dual Essence, 30/50mL, 다병 묶음 제외.
- 조회일 2026-10-17 KST (UTC 2026-10-16). 웹 조회 서비스의 공개 페이지 텍스트 검토이며 캐시 가능. 공급원 갱신 시각/직접 체크아웃 시각은 확보하지 못했다.
- main 원장은 10월 15일 Stylevana $17.50 1건. 같은 값 재조회가 독립적인 두 번째 실제 관측이라는 증거는 없다.
- PR #30 병합, #31·#32·#33·#34 미병합을 확인했다. #34는 #33 기반. 이번 PR은 #34 위에 쌓는 검증 변경이며 기존 PR 병합/배포를 실행하지 않는다.
- #8 기록은 Awin 계정 활성화 및 사용자 보고상 Stylevana Pending approval. 현재 계정에 로그인하여 승인 상태를 재확인한 것은 아니다. #25의 인터뷰/시장성 검증은 별개이며 완료 처리하지 않는다.

## 실제 페이지 대조
| 판매처 | 조회 상품가 | 식별·재고 | 배송 정책 | 비교 제외 이유 |
|---|---:|---|---|---|
| Stylevana US | USD 17.50 | 100ml, 에센스. 재고 미확인 | 미국 단품 $35 미만 표준 $5.79; 원격지 추가금 가능 | 전성분/GTIN·배송지·세금·관세·재고·신선도 미확인 |
| Ulta SKU 2504912 | USD 20.90 | 3.38 oz; 재고 있음 표시 | 일반 표준 $6.95; 상품 페이지 $35 초과 무료 | 제형 동일성, 배송지별 최종 비용·갱신 시각 미확인 |
| COSRX 공식몰 | USD 25.00 표시 | 100mL 선택 텍스트, backorder | 미국 배송 및 미국 센터 출고 명시. $50 무료, 미달 배송비 결제에서 산출 | backorder, 배송국가 세션/배송지·최종 비용·신선도 미확인 |
| StyleKorean | USD 22.50 | 100ml; cosS02-Essence는 상품 코드. 재고 미확인 | 미국 목적지 고정 및 배송비 미확인 | USD만으로 미국 견적 확정 불가; 조회 결과 crawl last week |
| YesStyle 1052684695 | JPY 2,417 | 100ml, 재고 있음 표시 | 일본 배송 응답 | 미국/USD 아님. 환율 환산·일본 배송비 전용 금지 |

세금과 관세는 전부 null이다. 0으로 추정하지 않았다. 재고 표시는 웹 응답 상태이며 실제 주문 수락 보장이 아니다. COSRX/StyleKorean의 여러 용량·국가 세션을 담은 페이지는 확정 미국 견적으로 취급하지 않았다.

### 조건부 할인 및 배송 충돌
- Stylevana 상품 페이지의 Was $25는 판매처 기준가격이다. 30% 산술 차이가 있어도 Alimi의 과거 실거래 관측 대비 할인율은 아니다.
- Stylevana 상품 하단은 $48 초과 무료배송, 배송 정책은 $35 기준 Premium Express 무료라고 서로 다르게 표시한다. 정책 본문 above와 표의 ≥도 경계가 다르다. 최종 체크아웃으로 해소해야 한다. 선택 보험은 상품 소계의 4%; 자동으로 포함/제외해 확정 총액으로 만들지 않는다.
- Ulta $19.85는 정기구독 5%/무료배송 조건이다. 단건 $20.90과 분리한다. 대부분 쿠폰 제외. 상품 페이지의 same-day $6.95와 별개로 고객센터의 standard $6.95도 확인했다.
- COSRX routine 20%는 묶음 조건으로 단품가에 적용하지 않는다. StyleKorean 표시 10%는 판매처 표시 할인이고 이력 검증 아님.
- 참고 산식만: Stylevana 17.50+5.79=23.29, Ulta 20.90+6.95=27.85. 이는 일반 정책 적용 가정의 세전 소계이며 배송지 추가금·세금·관세·보험·체크아웃·동일 제형 검증이 없으므로 구매 가능 총액/절감액/순위가 아니다. JSON의 shipping 값으로 승격하지 않았다.

## 동일성 판단
상품군·명칭·용량·단품/에센스 형태는 대조했다. 공식 3.38 fl.oz/100mL 표기로 Ulta 3.38 oz를 대응 후보로 연결했다. 그러나 동일한 국가별 제형·리뉴얼·로트까지 확정하지 않았다.
공식몰 전성분은 Aqua/Water를 포함하지만 Ulta 목록에는 없고 배열 순서도 다르다. 이것만으로 다른 제형이라고 단정할 수도 없다. Stylevana 전체 INCI 및 공통 GTIN을 확보하지 못했다. 모든 identityReview.status는 pending, formulation은 null이다. 브랜드/판매처가 제공한 GTIN·제품 라벨·공식 동일 제형 확인으로 해소할 수 있다.

## 공개 검증과 공급 권한
공개로 확인한 것은 상품 페이지의 표시값, 옵션, 재고 문구, 배송 정책, 제휴 프로그램 소개다. 페이지 공개와 검색 서비스 접근은 Alimi의 반복 수집·상업 재표시·이력 보관·푸시 이용권을 보장하지 않는다.
Stylevana 약관 2.3은 서비스 복제·상업 이용 등에 서면 허락을 요구한다. Awin 90791 소개의 상품 피드 지원은 확인했지만 해당 Alimi 계정의 승인, 미국 피드, 보존 기간, 이미지 사용, 앱/알림 용도를 확인한 것이 아니다.
Ulta·COSRX 약관 페이지도 조회했으며 Alimi에 부여된 피드/API 또는 반복 수집·가격 이력 허가는 확인하지 못했다. StyleKorean/YesStyle의 별도 계약 권한도 미확인. 권한 상태는 not_confirmed이며 허가/금지를 임의 확정하지 않는다.
자동 수집기, 스케줄러, 비공식 API, 로그인 우회, 제휴 추적, 구매/문의 발송은 연결하지 않았다. 연구용 필드와 원문 링크만 남기고 페이지 전문/이미지는 복제하지 않았다.

## 기존 구조 연결 및 검증 결과
- 기존 productId=2에 후보 5개를 연결. price/currency/market/availability와 근거·정책을 기록. 정책 배송비는 publicPolicy에 두며 목적지별 확정 shipping과 분리.
- observedAt/sourceUpdatedAt=null. reviewedOn은 연구 검토일이며 공급원 갱신 시각으로 대체하지 않는다.
- tests/real-retailer-review.test.mjs를 PR #34 실제 compareOffers 모듈로 실행: **1/1 통과**, 5곳 전부 excluded, ranked=[], insufficient_retailers. 실제 공개자료의 누락값이 최저가로 잘못 승격되지 않는 것을 확인했다.
- 테스트의 10001과 제형 문자열은 gate 실행용 가상 컨텍스트이며 고객 배송지·제형 관측이 아니다. 실제 offer 배송지는 전부 null. 다른 주소를 넣어도 이 자료만으로 총액 비교를 통과할 수 없다.
- 운영 data/price-observations.json과 dist/observed-data.js는 수정하지 않았다. 그래프는 여전히 독립 관측 1일/1건이다.
- 전체 테스트, 모바일 브라우저/실기기, 새 실데이터 UI 렌더링·구매 과제는 이번에 실행하지 않았다.

## UI 검증 범위와 다음 개발
| 구분 | 현재 근거 | 남은 일 |
|---|---|---|
| main 가격 그래프 | PR #30의 1건 대기 상태 및 합성 2건 브라우저 기록 | 권한 확보한 독립 시점 관측 2일 이상으로 실제 이력 검증 |
| 비교 gate | PR #31/#34 합성 테스트 + 이번 실제 누락 데이터 제외 테스트 | 실제 동일 제형/배송지/신선도/비용을 만족하는 2곳 견적 |
| 판매처 제외 UI | #34 구현, 기존 HTML 테스트 기록; 미병합 | 연구 데이터의 권한 승인 후 운영 어댑터 및 모바일 화면 검증 |
| 배송지·총액 | 입력/실제 견적 연동 미구현 | 미국 ZIP 및 필요 주소 입력, 동일 장바구니/단건/배송방법 고정, 세금·관세·보험 분리 |
| 권한·최신성 | 정책 metadata는 연구 JSON에만 존재 | 공급원별 권한 gate, 검토시각/조회시각/공급 갱신시각 분리, 캐시·기한·실패 처리 |
| 이력 구조 | Stylevana 단일 URL 허용 | 승인 후 판매처/옵션별 분리; 타 판매처 가격을 Stylevana 시계열에 혼합 금지 |

다음 실제 검증은 동일 미국 배송 목적지에 대해 단품/비회원/일회성 구매/일반배송 조건으로 결제 전 견적 2곳을 확보하는 것이다. 주소가 필요한 단계에서는 임의 주소를 실제 소비자 주소로 만들지 않는다. 승인된 견적 API 또는 개인정보를 제거한 결제 전 화면으로 배송·세금·관세·재고·옵션·시각을 대조한다. 가격 이력/알림은 공급 계약 권한 확보 후 별도로 검증한다.

## 원문
- Stylevana 상품: https://www.stylevana.com/en_US/cosrx-advanced-snail-96-mucin-power-essence-100ml10777.html
- Stylevana 배송: https://www.stylevana.com/en_US/shippings
- Stylevana 약관: https://www.stylevana.com/en_US/terms-and-conditions
- Ulta 상품: https://www.ulta.com/p/advanced-snail-96-mucin-power-essence-xlsImpprod15641052?sku=2504912
- Ulta 배송: https://www.ulta.com/guestservices/all?openLinerExtension=true
- Ulta 약관: https://www.ulta.com/company/terms-and-conditions
- COSRX 상품: https://www.cosrx.com/products/advanced-snail-96-mucin-power-essence
- COSRX 배송: https://www.cosrx.com/policies/shipping-policy
- COSRX 약관: https://www.cosrx.com/policies/terms-of-service
- StyleKorean: https://www.stylekorean.com/product/advanced-snail-96-mucin-power-essence-100ml/1450854424
- YesStyle: https://www.yesstyle.com/en/cosrx-advanced-snail/info.html/pid.1052684695
- Awin: https://ui.awin.com/merchant-profile/90791
- 관련 과제: #8, #25, #5. 미완료 유지.
