import XCTest
@testable import Alimi

final class AlimiTests: XCTestCase {
    private func makeStore() -> AlimiStore {
        let defaults = UserDefaults(suiteName: "AlimiTests.\(UUID().uuidString)")!
        let first = Product(id: "1", brand: "조선미녀", name: "선크림", size: "50ml", category: "선케어", keywords: "Beauty of Joseon", base: 14500, history: Array(repeating: 17000, count: 30), offers: [Offer(name: "A", price: 14500, shipping: 2500, days: "2일"), Offer(name: "B", price: 15700, shipping: 0, days: "1일")])
        let second = Product(id: "2", brand: "아누아", name: "토너", size: "250ml", category: "토너", keywords: "Anua", base: 18900, history: Array(repeating: 20000, count: 30), offers: [Offer(name: "A", price: 18900, shipping: 0, days: "2일")])
        return AlimiStore(defaults: defaults, products: [first, second])
    }
    func testF1Search() {
        let store = makeStore()
        XCTAssertEqual(store.search("조선미녀").map(\.id), ["1"])
        XCTAssertEqual(store.search(" anua ").map(\.id), ["2"])
        XCTAssertTrue(store.search("없는상품").isEmpty)
    }
    func testF2HistoryChangesByProduct() {
        let store = makeStore()
        XCTAssertEqual(store.history(store.products[0]).count, 30)
        XCTAssertNotEqual(store.history(store.products[0]), store.history(store.products[1]))
    }
    func testF3ShippingInclusiveMinimum() {
        let store = makeStore()
        XCTAssertEqual(store.offers(store.products[0]).first?.name, "B")
        XCTAssertEqual(store.price(store.products[0]), 15700)
    }
    func testF4Favorites() {
        let store = makeStore()
        store.toggle("1")
        XCTAssertEqual(store.search("", favoritesOnly: true).map(\.id), ["1"])
        store.toggle("1")
        XCTAssertTrue(store.search("", favoritesOnly: true).isEmpty)
    }
    func testF5TargetAndSimulation() {
        let store = makeStore(); let p = store.products[0]
        store.saved.targets[p.id] = 15000
        XCTAssertEqual(store.status(p), "기다리는 중")
        store.simulations[p.id] = 14000
        XCTAssertEqual(store.status(p), "목표가 도달")
        store.simulations[p.id] = 15000
        XCTAssertEqual(store.status(p), "목표가 도달")
        store.simulations.removeValue(forKey: p.id)
        XCTAssertEqual(store.status(p), "기다리는 중")
    }
    func testOfficialStylevanaResourceIsBundled() {
        guard let snapshot = StylevanaSnapshot.bundled else { return XCTFail("Official Stylevana JSON resource missing or invalid") }
        XCTAssertEqual(snapshot.latest.currency, "USD")
        XCTAssertEqual(snapshot.latest.market, "US")
        XCTAssertEqual(snapshot.latest.size, "100ml")
        XCTAssertEqual(snapshot.latest.quantity, 1)
        XCTAssertGreaterThan(snapshot.latest.amount, 0)
        XCTAssertEqual(snapshot.latest.affiliateUrl.host, "www.awin1.com")
        XCTAssertFalse(snapshot.history.isEmpty)
    }
    func testInputValidation() {
        for invalid in ["", "0", "-1", "1.5", "10000001", "abc"] { XCTAssertNil(PriceRule.valid(invalid)) }
        XCTAssertEqual(PriceRule.valid("15000"), 15000)
    }
    func testPersistence() {
        let defaults = UserDefaults(suiteName: "AlimiTests.\(UUID().uuidString)")!
        let first = AlimiStore(defaults: defaults, products: [])
        first.toggle("1"); first.saved.targets["1"] = 15000
        let second = AlimiStore(defaults: defaults, products: [])
        XCTAssertTrue(second.saved.favorites.contains("1"))
        XCTAssertEqual(second.saved.targets["1"], 15000)
    }
}

