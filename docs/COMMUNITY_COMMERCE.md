# Community commerce — 2026-10-19

## 2026-10-23 최신 결정 — 게임부터 구매·재방문까지

[전체 CX v1.0](BEAUTY_JOURNEY_CX.md) · [전체 PRD v1.0](BEAUTY_JOURNEY_PRD.md)가 게임 유입·공유·본인 이야기·실제 커뮤니티·상품·판매처·주문·재방문의 최신 기준이다. 아래 10월 20일의 “게임형 온보딩 제외”는 **별도 /beauty-play/ 유입 경로에 한해 대체**한다. 기존 본 서비스 3탭·지역 분리·로딩 캐릭터 제외는 유지한다.

게임은 [실제 도메인](https://seoulbeauty.me/beauty-play/)에 배포됐고 저장·친구 선택 후 비교를 확인했다(PR #167). 현재 서울뷰티 이동은 /kr·/us 홈이며 텍스트 수동 복사다. 게임 D1과 커뮤니티 Supabase의 계정·초안·활동·주문 자동 연결은 미구현이다. 기존 Sites /community는 시제품, /plan v0.5는 과거 기록이며 실제 서비스의 통합 실적으로 사용하지 않는다.

다음 P0는 관련 대화·초안 handoff, 실제 첫 참여, 공통 이벤트·판매처 서버 클릭이다. P1은 공식 주문·취소·승인 수수료 대조와 실제 후기·재방문이다. 게임 선택은 가상 상황 선호, 본인 입력은 실제 자기 보고, 판매처 클릭·자가 구매·승인 주문·순수익은 각각 구분한다. 현재 구매 전환·통합 D7·실제 수익 검증 완료를 뜻하지 않는다.


**최신 결정 D-012:** 소비자 가격 추적·이력·목표가·가격 알림은 제외한다. 관심 저장은 추적을 시작하지 않는 기기 내 상품 스냅샷이다. 현재 가격·판매처·상품 설명·후기·대화는 유지한다. 아래의 이전 추적 관련 계획은 현재 실행 대상이 아니다.


[Strategy](STRATEGY.md) and [service plan](SERVICE_PLAN.md) define current direction and target experience. This document retains implementation details; code presence does not establish user validation or release.

## Product direction

Help people interested in Korea discuss products and experiences, choose suitable products and buy through disclosed affiliate links. Start with K-beauty; Korea travel shopping is an adjacent topic. Additional categories depend on actual discussion and permitted merchant coverage. Consumer price history, target prices and price alerts are excluded under D-012. Current price and retailer information support product choices.

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

## Coupang Partners (Korea)

Viewers whose device time zone is `Asia/Seoul` also see a Coupang row on the product page. It links to `/api/coupang?q=<brand + name>&ref=`, which signs a Coupang Partners Open API deeplink request on the server and redirects (302) to the tracked search link; successful links are cached at the CDN for a day. Set `COUPANG_ACCESS_KEY` and `COUPANG_SECRET_KEY` in Vercel. Without keys, or when Coupang refuses, the plain search page opens without commission. The row shows Coupang's required disclosure sentence. Coupang ships within Korea only, so US viewers do not see the row.

## OLIVE YOUNG US (Rakuten Advertising)

OLIVE YOUNG moved its US affiliate programme to Rakuten Advertising on 2026-05-29; the older global programme does not cover US shoppers. In the US market (`/us`) the product page shows an OLIVE YOUNG US row linking to `/api/oliveyoung?q=<brand + name>&ref=`, which redirects (302) to a LinkShare deep link (`click.linksynergy.com/deeplink?id&mid&murl&u1`) around the OLIVE YOUNG US search page. `u1` carries the post/chat ref. Set `RAKUTEN_PUBLISHER_ID` (encrypted publisher ID from the Rakuten link tools) and `OLIVEYOUNG_US_MID` (the advertiser's MID) in Vercel after approval. Without them the plain search page opens without commission. The existing affiliate disclaimer on the product page covers the FTC disclosure.

## Measurement and future B2B

Measure community/post views → product card → variant/merchant click → confirmed affiliate order → net commission. `clickref` uses post/comment/chat IDs, never review text or skin attributes. External orders/refunds remain dependent on affiliate reporting; clicks are not purchases.

The existing community migration provides private profile/consent placeholders and operator aggregate views. Country/age/job surveys, consent UI, commercial dashboards, reports and a customer API are future work, not active services. Do not export personal conversations or infer demographic profiles. Future external aggregates must include sample sizes, time coverage, minimum group sizes, consent scope and bias limitations.

## Validation and boundaries

- Existing main already contains web posts/comments, moderation and review photo upload plus the community SQL migration; this change supplies native iOS parity and descriptions.
- Public REST reads confirmed `community_posts` and topic/catalog endpoints exist. Direct management SQL access was denied; no new remote schema writes were attempted.
- Unit and browser checks, macOS CI build/UI tests and TestFlight delivery are distinct gates. Record actual results in the PR.
- Existing anonymous posting/storage uses device secrets and operator reporting. Stronger upload quotas, ownership-based photo deletion and anti-abuse controls remain operational follow-ups before broad promotion.
