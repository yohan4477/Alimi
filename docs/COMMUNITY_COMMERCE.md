# Community commerce — 2026-10-19

**최신 결정 D-012:** 소비자 가격 추적·이력·목표가·가격 알림은 제외한다. 관심 저장은 추적을 시작하지 않는 기기 내 상품 스냅샷이다. 현재 가격·판매처·상품 설명·후기·대화는 유지한다. 아래의 이전 추적 관련 계획은 현재 실행 대상이 아니다.


## Product direction

Help people interested in Korea discuss products and experiences, choose suitable products and buy through disclosed affiliate links. Start with K-beauty; Korea travel shopping is an adjacent topic. Additional categories depend on actual discussion and permitted merchant coverage. Price history and target alerts support decisions rather than define the main product.

One Community tab contains topics. Each topic separates lasting posts/comments (questions, recommendations, reviews) from live chat. Product identity connects both spaces to the same options, related discussions and retailer links. A review is a community post surfaced on the product, not a second duplicate review entry. Writers can turn their own chat messages into posts.

Reviews accept optional usage period, self-selected skin type/tone/undertone, climate, goal, four photos, purchase retailer, USD amount, shipping country/days, and sponsorship disclosure. No demographic or skin attributes are inferred. Product experience and past purchase details are separated from current affiliate offers. Retailer self-report is not verified purchase. Photos are re-rendered to remove EXIF/GPS, limited to 1 MB after encoding; users must conceal names, addresses and order IDs.

## Descriptions and rights

Product pages show our own category guidance, observed identity/options and a source link. Category guidance is explicitly distinct from product-specific manufacturer claims. No new claims about ingredients, clinical effects or individual suitability are invented.

Retailer descriptions come from the Awin feed and are stored on `catalog_items` (`description`, `description_permission`) only when `data/catalog.json` records `descriptionPermission`. As of 2026-10-19 the owner chose to publish Stylevana feed descriptions as unmodified retailer text with a source link; Stylevana's program-specific app reuse terms have not been reviewed yet. Removing `descriptionPermission` stops publishing on the next collection. `product-content.json` remains for individually licensed copy. Never rewrite descriptions or add efficacy claims, and do not label category guidance as official copy.

After verifying applicable advertiser programme terms, run:

```
STYLEVANA_DESCRIPTION_PERMISSION_REFERENCE='public record/reference of the applicable permission' node scripts/product-content.mjs .private/stylevana.csv.gz
```

This reads the official feed's `description`, converts HTML to plain text and writes matching web/iOS bundles. It does not crawl brand pages or copy third-party reviews. Do not put credentials or private contract text in the permission reference, which is distributed publicly. Review and publish the resulting data with the app. If permission is withdrawn, regenerate empty bundles and redeploy.

## Measurement and future B2B

Measure community/post views → product card → variant/merchant click → confirmed affiliate order → net commission. `clickref` uses post/comment/chat IDs, never review text or skin attributes. External orders/refunds remain dependent on affiliate reporting; clicks are not purchases.

The existing community migration provides private profile/consent placeholders and operator aggregate views. Country/age/job surveys, consent UI, commercial dashboards, reports and a customer API are future work, not active services. Do not export personal conversations or infer demographic profiles. Future external aggregates must include sample sizes, time coverage, minimum group sizes, consent scope and bias limitations.

## Validation and boundaries

- Existing main already contains web posts/comments, moderation and review photo upload plus the community SQL migration; this change supplies native iOS parity and descriptions.
- Public REST reads confirmed `community_posts` and topic/catalog endpoints exist. Direct management SQL access was denied; no new remote schema writes were attempted.
- Unit and browser checks, macOS CI build/UI tests and TestFlight delivery are distinct gates. Record actual results in the PR.
- Existing anonymous posting/storage uses device secrets and operator reporting. Stronger upload quotas, ownership-based photo deletion and anti-abuse controls remain operational follow-ups before broad promotion.
