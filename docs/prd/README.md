# SeoulBeauty PRD 인덱스

- [CX 01~06](../CX_JOURNEY.md)
- [01 익명 계정·기록 복구](PRD_01_IDENTITY.md)
- [02 경험 데이터 모델](PRD_02_DATA_MODEL.md)
- [03 채팅·경험 공유](PRD_03_CHAT_EXPERIENCE.md)
- [04 알림·딥링크](PRD_04_NOTIFICATIONS.md)
- [05 운영·신뢰·모더레이션](PRD_05_MODERATION.md)
- [06 퍼널·KPI](PRD_06_KPI.md)

**상태 기준:** 사용자가 결정한 정책은 확정. 기존 코드에 적용됐다는 뜻이 아니며 실제 DB·CI·실기기·배포·사용자 성과는 별도 근거가 필요하다.

**추적:** [기획박스 #26](https://github.com/yohan4477/Alimi/issues/26), [채팅 #68](https://github.com/yohan4477/Alimi/issues/68), [성과 #49](https://github.com/yohan4477/Alimi/issues/49), [사용자 실험 #11](https://github.com/yohan4477/Alimi/issues/11).

**개발 우선순위:** P0 기존 동작·운영 DB 감사 → 익명 소유권·경험 저장 트랜잭션 → 대화 UI·신뢰·알림 딥링크 → 이벤트 수신 검증. P1 계정 복구·상세 비교·실험 최적화. P2 푸시·고도화. 코드·DB 변경은 별도 승인.

**필수 사전조건:** 연결된 Supabase 계정에서 서울뷰티 운영 프로젝트가 조회되지 않아 테이블·RLS·RPC 정합성은 미검증. 운영 DB를 추정하거나 타 프로젝트를 수정하지 않는다.
