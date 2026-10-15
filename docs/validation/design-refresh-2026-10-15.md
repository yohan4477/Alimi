# Alimi UI refresh — 2026-10-15

## Direction
Beauty discovery with prominent product areas, price hierarchy, quieter surfaces, violet actions, and mobile bottom navigation. Web branding now matches Alimi. iOS uses the same headline, accent and category-dependent concept artwork.

Reference research: Shop discovery/saved collections (https://help.shop.app/en/shop/getting-started), Sephora saved beauty lists (https://www.sephora.com/beauty/loves), and Mobbin for future screen-by-screen reference gathering (https://mobbin.com/). These informed the direction; this is not a pixel copy or a claim of exhaustive visual benchmarking.

## Scope
- Web: typography, spacing, cards, category-specific concept packaging, navigation, detail panel, chart colors, form tap targets.
- Native iOS: accent, product art, home typography and card sizes.
- Search, price calculation, persistence and target-price rules unchanged.
- All prices remain simulated; product artwork is explicitly conceptual, not official packaging.

## Validation
- Existing Node feature tests: 6/6 passed.
- Native iOS build/device visual verification: not performed locally; requires macOS/Xcode CI.
- Real product photography, US retailer data and currency localization remain separate work.

- Browser screenshot/interaction check blocked: no installed Chromium; browser download returned an invalid archive. Visual QA remains pending.
