# 미국 일반 뷰티 소비자 조사 설계 v0.2

상태: **조사 방법 변경 확정 / 100건 수집 미완료**, 2026-10-21. 관련: [미국 소비자 표현 조사](US_BEAUTY_CONSUMER_LANGUAGE_2026.md), [PRD 02](../prd/PRD_02_DATA_MODEL.md), [PRD 03](../prd/PRD_03_CHAT_EXPERIENCE.md).

## 핵심 원칙
- K-Beauty를 사용하는 사람만 찾지 않는다. 일반 소비자 문제 → 기존 해결 경험 → 한국 제품의 적합 가능성 순으로 검토.
- 제품 원산지·브랜드 관심(한국/미국/그 외/불명)과 소비자의 인종·민족·거주 국가를 구분. r/AsianBeauty 이용자라는 이유로 아시아인 또는 미국인이라고 추정 금지.
- 2026-06-01 이후 작성일이 확인되는 이용자 게시글/댓글만 유효 최신 표본으로 집계. 원문·사진·닉네임 무단 복제 금지.
- 목적표집이므로 Reddit 사례 수는 소비자 발생률/미국 시장 점유율이 아니다.

## 최초 100건 표본 배분 목표
| 집단 | 목표 | 예시 출처 |
|---|---:|---|
| 일반 뷰티 관심 커뮤니티 | 70 | r/MakeupAddiction, r/SkincareAddiction, r/Haircare, r/finehair 등 |
| 다양한 피부톤·모발 특성·접근성 고민 | 20 | 특성별 커뮤니티, 일반 커뮤니티의 다양성 관련 사례 |
| Asian/K-Beauty 관심 커뮤니티 (비교군) | 10 | r/AsianBeauty, r/KoreanBeauty |

*배분은 조사 설계 목표이며 결과 아님. 집단 간 중복 게시글·교차 게시글은 고유 URL/작성자/내용을 확인해 중복 제외. 인종·피부톤·모발 특성은 서로 동치가 아님.*

추가 분포는 스킨케어·메이크업·헤어케어별로 기록하고, 어느 한 분야가 전체 결론을 지배하지 않도록 수집 현황을 보고할 것. 향수는 현재 제외.

## 코딩 원장 필드
- source_url, subreddit, created_at, captured_at, duplicate_group
- self_declared_location, self_declared_age, self_declared_gender (불명은 unknown; 민감정보 과수집 금지)
- product_origin_interest (K/US/other/agnostic/unknown), named_product, exact_variant, problem
- question_vs_experience, positive_vs_negative_vs_mixed, purchase_or_use_evidence_selfreport
- **questioner_spontaneous_conditions**, **responder_requested_conditions**, **outcome_explanatory_conditions**
- use_duration, method_or_routine, environment, monetary_or_time_loss, followup, verified_resolution
- source_confidence, caveats; 원문 인용 최소화, 독자적 한국어 요약

## 초기 실제 사례 (모두 2026-06-01 이후)
1. MakeupAddiction, 2026-10-19: 여러 서구 브랜드 파운데이션이 수시간 후 오렌지색 변함; 세팅 제품을 바꿔도 지속. https://www.reddit.com/r/MakeupAddiction/comments/1x9l19n/foundation_oxidizes_no_matter_what_i_do_please/
2. MakeupAddiction, 2026-10-14: 건조/각질 피부에 파운데이션 부적합, 기존 제품 색상 미일치. https://www.reddit.com/r/MakeupAddiction/comments/1x6547w/flaky_friendliest_foundation/
3. Haircare, 2026-09-03: 가는 모발 부스스함, 오일은 떡짐, 세정 루틴과 염색 이력 설명. https://www.reddit.com/r/Haircare/comments/1w687lb/frizzy_fine_hair_help/
4. finehair, 2026-10-03: Walmart에서 구매한 저가 샴푸/컨디셔너 사용 후 긍정 경험. https://www.reddit.com/r/finehair/comments/1wwwlls/did_i_find_the_new_holy_grail_shampoo_for_fine/
5. SkincareAddicts, 2026-06-27: 매사추세츠 거주 이용자가 민감·건조함, 현행 루틴, 여러 국가 제품에 개방적인 태도 서술. https://www.reddit.com/r/SkincareAddicts/comments/1ugot17/productsroutine_help/
6. Haircare, 2026-09-04: 기존 프리미엄 샴푸 2년 사용해도 건조/부스스함 고민; 댓글에서 sulfate-free 선호 이유 질문. https://www.reddit.com/r/Haircare/comments/1w71hkn/hair_shampoo_for_dry_and_frizzy_hair/

## 답변 방식 분석
질문자가 **처음부터 쓴 조건**과 다른 사람이 **추가로 요청한 조건**을 분리. 해결된 경우 실제 재사용 결과가 확인됐는지 구분. 한국 브랜드 언급이 없어도 제외하지 않는다. 제품에 맞는 질문만 제안하며 나이/피부타입/언더톤을 온보딩 필수값으로 도입하지 않는다.

## 다음 검증
각 카테고리·집단별 목표 대비 유효 건수, 중복 제외, 질문/실경험·긍정/부정·해결 여부 분포, 미국 18~24세 확인 가능 비율(불명 별도)을 보고. 분류 체계 및 새 UI 확정은 실제 소비자 사용성 테스트 후.
