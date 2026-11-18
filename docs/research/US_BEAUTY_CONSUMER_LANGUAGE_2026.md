# 미국 뷰티 소비자 질문·조건 표현 조사 v0.1
작성 2026-10-21. **검증 진행 중 — 분류 체계/필수 프로필 최종 확정 아님.** 조사 범위 2026-06-01 이후 작성 확인 가능한 게시글·댓글. Reddit 원문·사진·닉네임 무단 재게시 금지. 표본은 검색 기반 목적표집이며 미국 18~24세 여성 대표성·시장 발생률 추정 불가.

## 분류 후보 및 관찰
| 분야 | 질문자가 스스로 밝힌 조건 | 문제/원하는 결과 | 설계 시사점 |
|---|---|---|---|
| 메이크업 | combo/oily, dry patches, acne prone, fair/cool undertone, 기존 Dior 1CR | medium coverage, long wearing, natural finish, 건조/끼임 | 피부 타입 외 기존 shade·현재 제품·실제 실패 경험/원하는 결과 |
| 색상 | darker skin, 혈관으로 undertone 판단 어려움, 오프라인 테스터 없음 | 맞는 shade 찾기 | 언더톤 강제 질문 금지, 기존 맞던 shade 또는 조건 자유 표현 |
| 스킨케어 | skin type/concerns, AM/PM routine, 사용기간, 새로 추가한 제품, location | 자극·트러블·질감·원하는 피부 결과 | 제품 조합·기간·변화 중심 |
| 헤어 | fine/high-density/low-porosity, straight/wavy, 염색·열처리 | greasy, frizzy, tangled, manageable | 전문 용어는 선택형; 일상 문제 표현 우선 |

## 검증한 근거 URL (작성일 기준)
- 2026-06-01 메이크업 질문 (콤비/지성, 언더톤, 기존 제품, 커버력·지속력): https://www.reddit.com/r/MakeupAddiction/comments/1ttyp8p/foundation_recommendations/
- 2026-06-15 어두운 피부색·언더톤 테스트/매장 테스터 문제: https://www.reddit.com/r/MakeupAddiction/comments/1u67k9e/foundation_shades/
- 2026-06-27 조명·플래시별 색상 판단 문제: https://www.reddit.com/r/MakeupAddiction/comments/1uhbcms/foundation_match/
- 2026-08-24 초심자의 타입·제형·예산·매장 접근과 답변자의 조명·시간·샘플 제안: https://www.reddit.com/r/MakeupAddiction/comments/1vxfohm/skintone_foundation_overwhelm/
- 2026-06-17 SkincareAddiction 커뮤니티 질문 가이드: https://www.reddit.com/r/SkincareAddiction/comments/1u8ia83/new_or_need_help_ask_here_sca_daily_help_thread/
- 2026-09-25 루틴 세부 요구에 대한 이용자 피로 반응: https://www.reddit.com/r/SkincareAddiction/comments/1wq7q85/removed/
- 2026-10-06 AsianBeauty 실제 제품 소진 후기·서로 다른 사용 결과·버전 식별: https://www.reddit.com/r/AsianBeauty/comments/1wyweum/autumn_2026_product_empties/
- 2026-07-31 fine low-porosity hair 루틴과 제품·경수: https://www.reddit.com/r/Haircare/comments/1vbv2ni/seeking_advice_for_fine_low_porosity_hair_that/
- 2026-09-28 fine/high-density/low-porosity hair 질문: https://www.reddit.com/r/Haircare/comments/1wsfm2z/fine_highdensity_lowporosity_hair_productroutine/
- 2026-07-10 고다공성·염색·가는 모발·실패·개선: https://www.reddit.com/r/Haircare/comments/1ussr3z/advice_for_high_porosity_fine_hair/
- Ulta 기존 색상 기반 shade finder: https://www.ulta.com/discover/shade-finder

## 잠정 설계 결정 제안 (미승인)
1. 기본 질문: '무엇이 고민인가/어떤 결과를 원하나'부터. 피부타입·언더톤·다공성 같은 전문 분류를 가입/채팅 전 필수 입력으로 두지 않는다.
2. 제품별 적응형 입력: 메이크업 shade·사용후 경과시간·조명, 스킨케어 루틴/사용 기간·자극, 헤어케어 굵기/패턴·열/염색·제품 조합. 모든 필드 건너뛰기 가능.
3. 답변자가 실제로 되묻는 조건과 질문자가 언급하지 않는 조건을 분리 기록; 전문가 용어 이해도와 입력 부담 사용자 테스트 수행.
4. Reddit에서 이미 제공하는 상세 질문 구조와 비교해 서울뷰티가 더 낮은 입력 부담으로 더 유용한 경험을 연결하는지 검증.
5. 연령·성별·미국 거주 여부가 확인되지 않는 게시글은 unknown, 국가별·카테고리별 모집 표본과 구분. 과대표집/중복·봇/운영 공지는 별도 분류.

## 다음 조사
균형 표본 확보: makeup/skincare/haircare 각 최소 20개의 유효 이용자 원문 및 주요 답변(목표, 아직 미달), 답변자의 실제 재질문 및 해결 여부, 초보/숙련 이용자 표현 차이 기록. 건수/비율은 모집 방법을 명시하기 전 대표성으로 해석하지 않음.

관련 PRD: [PRD 02](../prd/PRD_02_DATA_MODEL.md), [PRD 03](../prd/PRD_03_CHAT_EXPERIENCE.md). 앱 코드·DB·운영 콘텐츠 변경 승인 아님.
