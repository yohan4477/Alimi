// The artwork anchors the story; skin and hair conditions are fictional game settings.
export const SCENARIO_TAXONOMY_VERSION = "scenario-v1";
export const scenarioGroups = [
  {
    "id": "important_plans",
    "ko": "중요한 약속 전",
    "en": "Before important plans"
  },
  {
    "id": "in_a_hurry",
    "ko": "시간이 부족할 때",
    "en": "When time is short"
  },
  {
    "id": "long_outing",
    "ko": "오래 외출할 때",
    "en": "A long day out"
  },
  {
    "id": "touch_up",
    "ko": "외출 중 정돈할 때",
    "en": "Touching up on the go"
  },
  {
    "id": "at_home",
    "ko": "집에서 관리할 때",
    "en": "Care at home"
  }
];
export const scenarioMetadata = {
  "mona": {
    "groupId": "important_plans",
    "scenarioId": "first_date",
    "artCueKo": "차분한 표정과 은은한 미소",
    "storyLinkKo": "은은한 인상에 변화를 주고 싶은 소개팅 준비",
    "artCueEn": "A quiet smile and calm expression",
    "storyLinkEn": "Getting ready for a date with a subtle change",
    "fictionalCondition": true
  },
  "pearl": {
    "groupId": "touch_up",
    "scenarioId": "after_class",
    "artCueKo": "귀걸이와 가까이 보이는 얼굴",
    "storyLinkKo": "귀걸이는 그대로 두고 수업 뒤 얼굴 표현을 정돈",
    "artCueEn": "An earring and a close-up face",
    "storyLinkEn": "Refreshing her makeup after class",
    "fictionalCondition": true
  },
  "venus": {
    "groupId": "touch_up",
    "scenarioId": "after_sea_breeze",
    "artCueKo": "바다와 긴 머리카락",
    "storyLinkKo": "해변 바람을 맞은 머리를 다음 약속 전에 정돈",
    "artCueEn": "The sea and long flowing hair",
    "storyLinkEn": "Tidying windblown hair before the next plan",
    "fictionalCondition": true
  },
  "madame": {
    "groupId": "important_plans",
    "scenarioId": "evening_party",
    "artCueKo": "검은 드레스와 격식 있는 분위기",
    "storyLinkKo": "파티에 나가기 전 마지막으로 쓸 제품 선택",
    "artCueEn": "A black dress and formal atmosphere",
    "storyLinkEn": "One finishing choice before an evening party",
    "fictionalCondition": true
  },
  "camille": {
    "groupId": "long_outing",
    "scenarioId": "sunny_picnic",
    "artCueKo": "양산과 햇빛 아래 야외 장면",
    "storyLinkKo": "양산과 함께 긴 피크닉에 챙길 제품 선택",
    "artCueEn": "A parasol and a sunlit outdoor scene",
    "storyLinkEn": "What to pack for a long picnic alongside a parasol",
    "fictionalCondition": true
  },
  "ophelia": {
    "groupId": "at_home",
    "scenarioId": "after_a_day_out",
    "artCueKo": "물과 꽃이 있는 자연 배경",
    "storyLinkKo": "원작과 별개의 가상 외출 후 세안·보습 설정",
    "artCueEn": "Water, flowers and a natural setting",
    "storyLinkEn": "A fictional after-outing care story, separate from the original narrative",
    "fictionalCondition": true
  }
};
export function scenarioFor(character) { return scenarioMetadata[character] ?? null; }
export function scenarioMembers(groupId) { return Object.keys(scenarioMetadata).filter(id => scenarioMetadata[id].groupId === groupId); }
