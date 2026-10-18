import XCTest
import UserNotifications
@testable import Alimi

@MainActor
final class AlimiTests: XCTestCase {
    private func point(_ iso: String, _ price: Double) -> PricePoint { PricePoint(date: ISODate.parse(iso)!, price: price) }
    private func product(_ id: String, brand: String, name: String, price: Double, history: [PricePoint] = []) -> Product {
        Product(id: id, sku: id, brand: brand, name: name, size: "50ml", category: Product.category(for: name), retailer: "Stylevana US",
                currency: "USD", url: URL(string: "https://www.stylevana.com/a.html")!, affiliateUrl: nil, imageUrl: nil, price: price,
                delivery: 3.99, availability: "in_stock", changedAt: Date(), checkedAt: Date(), history: history)
    }
    private func makeStore() -> AlimiStore {
        let defaults = UserDefaults(suiteName: "AlimiTests.\(UUID().uuidString)")!
        return AlimiStore(defaults: defaults, products: [
            product("cosrx", brand: "COSRX", name: "Advanced Snail 96 Mucin Power Essence", price: 17.5),
            product("tirtir", brand: "TIRTIR", name: "Mask Fit Red Cushion 21C", price: 20)
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
        XCTAssertEqual(store.search("", category: "메이크업").map(\.id), ["tirtir"])
        XCTAssertTrue(store.search("없는상품").isEmpty)
        XCTAssertEqual(store.categories, ["전체", "메이크업", "스킨케어"])
        XCTAssertEqual(Product.category(for: "Heartleaf Pore Control Cleansing Oil"), "클렌징")
    }
    func testDailyHistoryCarriesForwardInKoreanDays() {
        let now = ISODate.parse("2026-10-20T03:00:00Z")!
        let history = [point("2026-10-17T22:30:00Z", 20), point("2026-10-19T22:30:00Z", 18)]
        let daily = PriceHistory.daily(history, days: 5, now: now)
        XCTAssertEqual(daily.map(\.price), [20, 20, 18])
        XCTAssertEqual(PriceHistory.trackedDays(history, now: now), 3)
        XCTAssertTrue(PriceHistory.daily([], days: 7, now: now).isEmpty)
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
    func testPersistence() {
        let defaults = UserDefaults(suiteName: "AlimiTests.\(UUID().uuidString)")!
        let first = AlimiStore(defaults: defaults, products: [])
        first.toggle("cosrx"); first.saved.targets["cosrx"] = 15
        let second = AlimiStore(defaults: defaults, products: [])
        XCTAssertTrue(second.saved.favorites.contains("cosrx"))
        XCTAssertEqual(second.saved.targets["cosrx"], 15)
    }
}
