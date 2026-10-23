// Optional product discovery choices stay on this device, never in a review or analytics.
import {esc} from './util.js';
import {t} from './i18n.js';
const memory = new Map();
const statuses = ['before', 'current', 'past'];
const topics = {
  before: ['fit', 'effect', 'texture', 'compare'],
  current: ['hydration', 'texture', 'irritation', 'value'],
  past: ['liked', 'disliked', 'repurchase', 'fit']
};
// Accept the prototype's Korean topic values without using localized text as new storage IDs.
const legacyTopics = {
  before: ['피부에 잘 맞을지', '효과가 있을지', '사용감', '가격·다른 제품 비교'],
  current: ['보습·효과', '발림성·사용감', '자극·트러블', '가격 대비 만족'],
  past: ['좋았던 점', '아쉬웠던 점', '재구매·대체 제품', '피부 적합성']
};
const key = id => 'sb-experience-v1:' + id;
function normalize(value) {
  const status = statuses.includes(value?.status) ? value.status : '';
  const index = status ? legacyTopics[status].indexOf(value?.topic) : -1;
  const topic = status && topics[status].includes(value?.topic) ? value.topic : index >= 0 ? topics[status][index] : '';
  return {status, topic};
}
function read(id) {
  if (memory.has(id)) return memory.get(id);
  let value = {}, persisted = false;
  try { value = JSON.parse(globalThis.localStorage.getItem(key(id)) || '{}'); persisted = true; } catch {}
  const selected = {...normalize(value), persisted};
  memory.set(id, selected);
  return selected;
}
function persist(id, value) {
  const selected = {...normalize(value), persisted: false};
  try {
    const json = JSON.stringify(normalize(selected));
    globalThis.localStorage.setItem(key(id), json);
    selected.persisted = globalThis.localStorage.getItem(key(id)) === json;
  } catch {}
  memory.set(id, selected);
}
function choice(attr, value, label, active) {
  return `<button type="button" class="experience-choice ${active ? 'selected' : ''}" ${attr}="${esc(value)}" aria-pressed="${active}">${esc(label)}</button>`;
}
export function preferredExperienceReviews(reviews, id, profile) {
  const skin = profile?.skin_type;
  if (!skin) return reviews;
  // Sort only actual self-reported skin matches. Interests do not prove product suitability.
  return [...reviews].sort((a, b) => Number(b.skin_type === skin) - Number(a.skin_type === skin));
}
export function experienceMarkup(id, reviewCount, profile) {
  const {status, topic, persisted} = read(id);
  return `<section class="experience-discovery" aria-label="${esc(t('experience.label'))}">
    <div class="experience-head"><strong>${esc(t('experience.title'))}</strong><small>${esc(t('experience.optional'))}</small></div>
    <p class="experience-description">${esc(t(reviewCount ? 'experience.reviewCount' : 'experience.noReviews', {n: reviewCount}))}</p>
    <p class="experience-prompt">${esc(t('experience.usedPrompt'))}</p>
    <div class="experience-options" role="group" aria-label="${esc(t('experience.usedLabel'))}">
      ${statuses.map(s => choice('data-experience-status', s, t('experience.status.' + s), status === s)).join('')}
    </div>
    ${status ? `<div class="experience-followup"><p class="experience-prompt">${esc(t(status === 'before' ? 'experience.beforePrompt' : 'experience.afterPrompt'))}</p>
    <div class="experience-options" role="group" aria-label="${esc(t('experience.interestsLabel'))}">
      ${topics[status].map(value => choice('data-experience-topic', value, t('experience.topic.' + value), topic === value)).join('')}
    </div></div>` : ''}
    ${topic ? `<p class="experience-result" role="status">${esc(t(profile?.skin_type ? 'experience.profileResult' : 'experience.interestResult'))}${!reviewCount ? ' ' + esc(t('experience.noMatches')) : ''}</p>` : ''}
    <p class="experience-note">${esc(t(persisted ? 'experience.privateNote' : 'experience.sessionNote'))}</p>
  </section>`;
}
export function installExperienceChoices(box, id, redraw) {
  // Reinstall even for the same product so a reopened sheet uses its current redraw callback.
  if (box.experienceClickHandler) box.removeEventListener('click', box.experienceClickHandler);
  box.experienceClickHandler = e => {
    const control = e.target.closest?.('[data-experience-status],[data-experience-topic]');
    if (!control || !box.contains(control)) return;
    const current = read(id), status = control.dataset.experienceStatus, topic = control.dataset.experienceTopic;
    if (statuses.includes(status)) persist(id, {status, topic: ''});
    else if (current.status && topics[current.status].includes(topic)) persist(id, {...current, topic});
    else return;
    redraw();
  };
  box.addEventListener('click', box.experienceClickHandler);
}
