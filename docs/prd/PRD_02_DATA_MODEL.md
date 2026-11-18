# PRD 02 — 경험 데이터 모델

상태: **설계 방향 확정 / 실제 운영 스키마·RLS·RPC 미검증**

## 확정
- 사용자 경험은 **별도 원본 레코드**로 관리하고 기존 채팅 메시지/게시글과 참조로 연결.
- 경험 원본은 **사용자가 명시적으로 경험 공유를 선택하고 전송을 완료한 경우에만** 생성. 일반 메시지 자동 구조화 금지.
- 같은 경험을 여러 방에 공유할 때는 원본 경험 ID를 재참조하며 중복 생성하지 않는다.
- 주제별 대화는 제품 없이도 경험을 공유하고, 제품별 대화는 이미 확인된 제품을 재사용; 옵션 미확인은 unknown.
- 사용 여부, 사용 횟수/기간, 결과(긍정·부정·혼합·판단 중), 문제 해결 여부/방법, 선택형 피부·모발·환경 조건을 구분.
- 자기신고를 구매 인증으로 표현하지 않음. 공개 조건은 사용자 명시 동의 범위만.

## 개념 엔터티와 관계
- Identity(익명/연결계정) 1:N Experience
- Experience 1:N ExperienceReference(chat_message / community_post 등)
- Experience N:0..1 ProductVariant
- Room 1:N Message; Message N:0..1 parent reply
- Recipient 1:N Notification; event_id는 중복제거 식별자

테이블/컬럼명은 설계 가칭이며 SQL 마이그레이션으로 확정하지 않음.

## 일관성·보안
경험 생성 + 최초 대화 연결은 원자적 트랜잭션, idempotency key로 재시도 중복 방지. 수정·삭제·신고·차단 시 모든 참조 노출에 반영. 삭제된 경험 참조는 비공개 내용 재노출 금지. 지역 경계와 제품 SKU/옵션 정합성 확인.

## 기존 코드 확인 및 미확인
- 코드상 `chat_members`, `chat_messages`, `community_posts`, `community_comments`, `product_mentions` 및 후기 필드 `used_for`/skin_type/skin_tone/undertone 존재.
- 근거: `dist/chat-api.js`, `dist/community-api.js`, `dist/onboarding.js`.
- **실제 운영 테이블·FK·index·RLS·RPC는 직접 검증하지 못함.** 배포·마이그레이션 승인 전 반드시 테이블 컬럼, 함수 권한, row isolation, rollback 및 신규 테스트 환경 감사.
