import XCTest
import UserNotifications
@testable import Alimi

@MainActor
final class AlimiTests: XCTestCase {
    // Assertions use the Korean copy; testEnglishCopy covers English.
    nonisolated override func setUp() { super.setUp(); L10n.language = "ko" }
    private func point(_ iso: String, _ price: Double) -> PricePoint { PricePoint(date: ISODate.parse(iso)!, price: price) }
    private func product(_ id: String, brand: String, brandKo: String? = nil, name: String, category: String, price: Double, history: [PricePoint] = []) -> Product {
        Product(id: id, sku: id, brand: brand, brandKo: brandKo, name: name, size: "50ml", category: category, retailer: "Stylevana US",
                currency: "USD", url: URL(string: "https://www.stylevana.com/a.html")!, affiliateUrl: nil, imageUrl: nil, price: price,
                delivery: 3.99, availability: "in_stock", changedAt: Date(), checkedAt: Date(), history: history)
    }
    private func makeStore() -> AlimiStore {
        let defaults = UserDefaults(suiteName: "AlimiTests.\(UUID().uuidString)")!
        return AlimiStore(defaults: defaults, products: [
            product("cosrx", brand: "COSRX", brandKo: "코스알엑스", name: "Advanced Snail 96 Mucin Power Essence", category: "에센스·세럼", price: 17.5),
            product("tirtir", brand: "TIRTIR", brandKo: "티르티르", name: "Mask Fit Red Cushion 21C", category: "베이스메이크업", price: 20)
        ])
    }
    func testNotificationPermissionRouting() {
        XCTAssertEqual(NotificationPermissionAction.resolve(.notDetermined), .request)
        XCTAssertEqual(NotificationPermissionAction.resolve(.denied), .settings)
        XCTAssertEqual(NotificationPermissionAction.resolve(.authorized), .enabled)
        XCTAssertEqual(NotificationPermissionAction.resolve(.provisional), .enabled)
        XCTAssertEqual(NotificationPermissionAction.resolve(.ephemeral), .enabled)
    }
    func testBundledSnapshotHasTenRealProducts() {
        guard let snap = AlimiStore.bundledSnapshot() else { return XCTFail("live-snapshot.json missing or invalid") }
        let products = Product.from(snap.rows)
        XCTAssertEqual(products.count, 10)
        for p in products {
            XCTAssertEqual(p.currency, "USD")
            XCTAssertGreaterThan(p.price, 0)
            XCTAssertEqual(p.affiliateUrl?.host, "www.awin1.com")
            XCTAssertFalse(p.history.isEmpty)
        }
    }
    func testSearchAndCategories() {
        let store = makeStore()
        XCTAssertEqual(store.search(" cosrx ").map(\.id), ["cosrx"])
        XCTAssertEqual(store.search("", category: "베이스메이크업").map(\.id), ["tirtir"])
        XCTAssertEqual(store.search("코스알엑스").map(\.id), ["cosrx"])
        XCTAssertTrue(store.search("없는상품").isEmpty)
        XCTAssertEqual(store.categories.first, "전체")
        XCTAssertEqual(Array(store.categories.dropFirst()), Product.categories)
        XCTAssertEqual(store.products[0].brandLabel, "코스알엑스")
    }
    func testDailyHistoryCarriesForwardInKoreanDays() {
        let now = ISODate.parse("2026-10-20T03:00:00Z")!
        let history = [point("2026-10-17T22:30:00Z", 20), point("2026-10-19T22:30:00Z", 18)]
        let daily = PriceHistory.daily(history, days: 5, now: now)
        XCTAssertEqual(daily.map(\.price), [20, 20, 18])
        XCTAssertEqual(PriceHistory.trackedDays(history, now: now), 3)
        XCTAssertTrue(PriceHistory.daily([], days: 7, now: now).isEmpty)
    }
    func testWatchSummary() {
        let now = ISODate.parse("2026-10-20T03:00:00Z")!
        XCTAssertEqual(PriceHistory.summary([point("2026-10-17T22:30:00Z", 20)], current: 20, now: now), "지켜본 지 3일 · 아직 가격 변동 없음")
        XCTAssertEqual(PriceHistory.summary([point("2026-10-17T22:30:00Z", 20), point("2026-10-19T22:30:00Z", 18)], current: 18, now: now), "지켜본 3일 중 지금이 최저가")
    }
    func testEnglishCopy() {
        L10n.language = "en"
        defer { L10n.language = "ko" }
        let now = ISODate.parse("2026-10-20T03:00:00Z")!
        XCTAssertEqual(PriceHistory.summary([point("2026-10-17T22:30:00Z", 20)], current: 20, now: now), "Watched 3d · no price change yet")
        XCTAssertEqual(PriceRule.status(target: 25, current: 20), "Target reached")
        XCTAssertEqual(L10n.category("선케어"), "Sun care")
        XCTAssertEqual(makeStore().products[0].brandLabel, "COSRX")
        XCTAssertEqual(L("count", ["n": 4]), "4 items")
    }
    func testFamilyVariantsCollapseAndBestValue() {
        func item(_ sku: String, _ size: String?, _ price: Int, _ unit: Int?) -> CatalogItem {
            CatalogItem(retailer: "S", market: "US", sku: sku, brand: "ANUA", brandKo: nil, name: "Oil", category: "클렌징", priceMinor: price,
                        currency: "USD", availability: "in_stock", imageUrl: nil, sizeLabel: size, optionLabel: nil, unit: "ml", unitPriceMinor: unit)
        }
        let v = CatalogItem.collapse([item("a", "200ml", 1700, 85), item("b", "200ml", 1800, 90), item("c", "20ml", 424, 212), item("d", nil, 3000, nil)])
        XCTAssertEqual(v.map(\.item.sku), ["a", "c", "d"])
        XCTAssertEqual(v.map(\.bestValue), [true, false, false])
        XCTAssertEqual(CatalogItem.unitName("ml"), "10ml")
        let q = URLComponents(url: ProductFamily.pageURL(category: "립", offset: 24), resolvingAgainstBaseURL: true)!.queryItems!
        XCTAssertEqual(q.first { $0.name == "category" }?.value, "eq.립")
        XCTAssertEqual(q.first { $0.name == "order" }?.value, "sort_key.desc")
    }
    func testChatTagMatchesServerAndErrorsAreFriendly() {
        // Same SHA-256 prefix the post_chat RPC stores, so "mine" and Block line up with the server.
        XCTAssertEqual(ChatAPI.tag("11111111-1111-4111-8111-111111111111"), "bd7662a5eeb41614e720d477")
        XCTAssertEqual(ChatAPI.errorKey("chat:slow"), "chat.err.slow")
        XCTAssertEqual(ChatAPI.errorKey("chat:secret"), "chat.err.other")
        XCTAssertEqual(ChatAPI.errorKey("HTTP"), "chat.err.other")
        let q = URLComponents(url: ChatAPI.messagesURL(room: "acne", after: 42), resolvingAgainstBaseURL: true)!.queryItems!
        XCTAssertEqual(q.first { $0.name == "id" }?.value, "gt.42")
        XCTAssertEqual(q.first { $0.name == "order" }?.value, "id.asc")
    }
    func testFavorites() {
        let store = makeStore()
        store.toggle("cosrx")
        XCTAssertEqual(store.search("", favoritesOnly: true).map(\.id), ["cosrx"])
        store.toggle("cosrx")
        XCTAssertTrue(store.search("", favoritesOnly: true).isEmpty)
    }
    func testTargetStatusAndBoundary() {
        let store = makeStore(); let p = store.products[0]
        XCTAssertEqual(store.status(p), "미설정")
        store.saved.targets[p.id] = 15
        XCTAssertEqual(store.status(p), "기다리는 중")
        store.saved.targets[p.id] = 17.5
        XCTAssertEqual(store.status(p), "목표가 도달")
    }
    func testInputValidation() {
        for invalid in ["", "0", "-1", "1.234", "10000.01", "abc"] { XCTAssertNil(PriceRule.valid(invalid)) }
        XCTAssertEqual(PriceRule.valid("12.5"), 12.5)
    }
    func testEventPayloadIsAnonymousAndWhitelisted() {
        var logger = EventLogger()
        logger.defaults = UserDefaults(suiteName: "AlimiTests.\(UUID().uuidString)")!
        let id = logger.deviceID
        XCTAssertNotNil(UUID(uuidString: id))
        XCTAssertEqual(logger.deviceID, id)
        let body = logger.payload(.productView, productID: "cosrx", props: ["k": "v"])
        XCTAssertEqual(Set(body.keys), ["device_id", "platform", "app_version", "name", "props", "product_id"])
        XCTAssertEqual(body["platform"] as? String, "ios")
        XCTAssertEqual(body["name"] as? String, "product_view")
        XCTAssertLessThanOrEqual((body["app_version"] as? String)?.count ?? 99, 20)
        XCTAssertEqual(Set(AppEvent.allCases.map(\.rawValue)), ["home_view", "search", "product_view", "wishlist_add", "wishlist_remove", "target_price_set", "merchant_click", "notification_opt_in"])
    }
    func testCatalogQueryIsSanitized() {
        XCTAssertNil(CatalogItem.searchURL("a"))
        XCTAssertEqual(CatalogItem.query("rom&nd),name.eq.x"), "rom&nd name eq x")
        XCTAssertEqual(CatalogItem.query("조선미녀  선크림"), "조선미녀 선크림")
        let url = CatalogItem.searchURL("juicy tint")!
        let items = URLComponents(url: url, resolvingAgainstBaseURL: true)!.queryItems!
        XCTAssertEqual(items.first { $0.name == "or" }?.value, "(brand.ilike.\"*juicy tint*\",brand_ko.ilike.\"*juicy tint*\",name.ilike.\"*juicy tint*\")")
        XCTAssertEqual(items.first { $0.name == "active" }?.value, "eq.true")
    }
    func testCatalogPageURL() {
        let all = URLComponents(url: CatalogItem.pageURL(category: "전체", offset: 48), resolvingAgainstBaseURL: true)!.queryItems!
        XCTAssertNil(all.first { $0.name == "category" })
        XCTAssertEqual(all.first { $0.name == "offset" }?.value, "48")
        let sun = URLComponents(url: CatalogItem.pageURL(category: "선케어", offset: 0), resolvingAgainstBaseURL: true)!.queryItems!
        XCTAssertEqual(sun.first { $0.name == "category" }?.value, "eq.선케어")
    }
    func testPersistence() {
        let defaults = UserDefaults(suiteName: "AlimiTests.\(UUID().uuidString)")!
        let first = AlimiStore(defaults: defaults, products: [])
        first.toggle("cosrx"); first.saved.targets["cosrx"] = 15
        let second = AlimiStore(defaults: defaults, products: [])
        XCTAssertTrue(second.saved.favorites.contains("cosrx"))
        XCTAssertEqual(second.saved.targets["cosrx"], 15)
    }
}
