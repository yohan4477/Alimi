import XCTest
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
    func testCatalogSaveSurvivesRevisitWithoutHistoryOrTargets() async {
        let defaults = UserDefaults(suiteName: "AlimiTests.catalog.\(UUID().uuidString)")!
        let first = AlimiStore(defaults: defaults, products: [])
        let item = CatalogItem(retailer: "Stylevana US", market: "US", sku: "999", brand: "COSRX", brandKo: nil,
                               name: "Test", category: "립", priceMinor: 1750, currency: "USD", availability: "in_stock",
                               imageUrl: nil, url: "https://www.stylevana.com/test.html")
        let didSave = await first.saveCatalogItem(item)
        XCTAssertTrue(didSave)
        let second = AlimiStore(defaults: defaults, products: [])
        XCTAssertEqual(second.products.count, 1)
        XCTAssertTrue(second.saved.favorites.contains(second.products[0].id))
        XCTAssertTrue(second.products[0].history.isEmpty)
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
    func testEnglishCopy() {
        L10n.language = "en"
        defer { L10n.language = "ko" }
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
    func testBuyURLAddsClickrefOnlyToAwin() {
        let awin = "https://www.awin1.com/pclick.php?p=1&a=2&m=3"
        func clickref(_ url: URL?) -> String? {
            URLComponents(url: url!, resolvingAgainstBaseURL: true)!.queryItems?.first { $0.name == "clickref" }?.value
        }
        XCTAssertEqual(clickref(Purchase.buyURL(awin, ref: "post-12")), "post-12")
        XCTAssertEqual(clickref(Purchase.buyURL(awin, ref: "chat\"<x>")), "chatx")
        XCTAssertEqual(clickref(Purchase.buyURL(awin, ref: String(repeating: "a", count: 80))), String(repeating: "a", count: 50))
        XCTAssertEqual(Purchase.buyURL(awin)?.absoluteString, awin)
        XCTAssertNil(clickref(Purchase.buyURL("https://www.stylevana.com/a.html", ref: "post-12")))
        XCTAssertEqual(Purchase.buyURL("https://www.stylevana.com/a.html", ref: "post-12")?.absoluteString, "https://www.stylevana.com/a.html")
        XCTAssertNil(Purchase.buyURL(nil))
        XCTAssertNil(Purchase.buyURL(""))
    }
    func testChatTagMatchesServerAndErrorsAreFriendly() {
        // Same SHA-256 prefix the post_chat RPC stores, so "mine" and Block line up with the server.
        XCTAssertEqual(ChatAPI.tag("11111111-1111-4111-8111-111111111111"), "bd7662a5eeb41614e720d477")
        XCTAssertEqual(ChatAPI.errorKey("chat:slow"), "chat.err.slow")
        XCTAssertEqual(ChatAPI.errorKey("chat:secret"), "chat.err.secret")
        XCTAssertEqual(ChatAPI.errorKey("HTTP"), "chat.err.other")
        let q = URLComponents(url: ChatAPI.messagesURL(room: "acne", after: 42), resolvingAgainstBaseURL: true)!.queryItems!
        XCTAssertEqual(q.first { $0.name == "id" }?.value, "gt.42")
        XCTAssertEqual(q.first { $0.name == "order" }?.value, "id.asc")
    }
    func testBrandBadgeMatchesWeb() {
        let cosrx = CatalogBrand(brand: "COSRX", brandKo: "코스알엑스", families: 3, logoUrl: nil)
        XCTAssertEqual(cosrx.initials, "CO")
        XCTAssertEqual(CatalogBrand(brand: "Beauty of Joseon", brandKo: nil, families: 1, logoUrl: nil).initials, "BO")
        XCTAssertEqual(CatalogBrand(brand: "A'PIEU", brandKo: nil, families: 1, logoUrl: nil).initials, "AP")
        XCTAssertEqual(cosrx.color, 0x7a5af5, "same color as the web badge")
        let q = URLComponents(url: ProductFamily.pageURL(category: "전체", offset: 0, brand: "COSRX"), resolvingAgainstBaseURL: true)!.queryItems!
        XCTAssertEqual(q.first { $0.name == "brand" }?.value, "eq.COSRX")
    }
    func testCatalogCopyNeedsPermissionAndSafeSource() {
        let row = CatalogCopyRow(url: "https://www.stylevana.com/a.html", description: "Snail mucin essence for hydration.", descriptionPermission: "Awin feed 111294")
        XCTAssertEqual(row.copy(retailer: "Stylevana US", sku: "10759")?.description, "Snail mucin essence for hydration.")
        XCTAssertNil(CatalogCopyRow(url: row.url, description: row.description, descriptionPermission: " ").copy(retailer: "Stylevana US", sku: "10759"))
        XCTAssertNil(CatalogCopyRow(url: row.url, description: nil, descriptionPermission: "x").copy(retailer: "Stylevana US", sku: "10759"))
    }
    func testFavorites() {
        let store = makeStore()
        store.toggle("cosrx")
        XCTAssertEqual(store.search("", favoritesOnly: true).map(\.id), ["cosrx"])
        store.toggle("cosrx")
        XCTAssertTrue(store.search("", favoritesOnly: true).isEmpty)
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
        XCTAssertEqual(Set(AppEvent.allCases.map(\.rawValue)), ["home_view", "search", "product_view", "wishlist_add", "wishlist_remove", "merchant_click", "chat_open", "chat_join", "chat_send", "community_open", "post_view", "post_create", "comment_create", "product_card_click", "post_save"])
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
        first.toggle("cosrx")
        let second = AlimiStore(defaults: defaults, products: [])
        XCTAssertTrue(second.saved.favorites.contains("cosrx"))
        // A payload written by an older build (with "targets") still decodes.
        defaults.set(Data(#"{"favorites":["a"],"targets":{"a":15}}"#.utf8), forKey: "alimi.live.v1")
        XCTAssertEqual(AlimiStore(defaults: defaults, products: []).saved.favorites, ["a"])
    }
    func testSavedLayoutHeadlineAndSlots() {
        XCTAssertEqual(SavedLayout.emptySlots(0), 3)
        XCTAssertEqual(SavedLayout.emptySlots(2), 1)
        XCTAssertEqual(SavedLayout.emptySlots(5), 0)
        XCTAssertEqual(SavedLayout.headline(0).key, "saved.hint")
        XCTAssertEqual(SavedLayout.headline(1).key, "saved.hintMore")
        XCTAssertEqual(SavedLayout.headline(1).vars["n"], 2)
        XCTAssertEqual(SavedLayout.headline(3).key, "saved.count")
        XCTAssertEqual(SavedLayout.headline(7).vars["n"], 7)
    }
    func testBrandStripTwoRowOrder() {
        XCTAssertEqual(BrandStrip.twoRowOrder(Array(0..<15)), [0, 8, 1, 9, 2, 10, 3, 11, 4, 12, 5, 13, 6, 14, 7])
        XCTAssertEqual(BrandStrip.twoRowOrder([1]), [1])
        XCTAssertEqual(BrandStrip.twoRowOrder([Int]()), [])
    }

    // MARK: Journey (same rules as tests/onboarding.test.js and tests/room-card.test.js)
    private func room(_ id: String, tag: String?, messages: Int = 0, concerns: [String]? = nil, kind: String = "topic") -> ChatRoom {
        ChatRoom(id: id, titleEn: id, titleKo: id, introEn: "", introKo: "", members: 1, messages24h: messages, kind: kind, tag: tag, concerns: concerns)
    }
    private var seedRooms: [ChatRoom] {
        [room("everyone", tag: "talk"), room("acne", tag: "skin"), room("dry-sensitive", tag: "skin"), room("makeup", tag: "makeup"),
         room("routine", tag: "skin"), room("deals", tag: "deals"), room("olive", tag: "talk", kind: "brand")]
    }
    func testInterestsDropConcernsOfUnselectedFields() {
        let n = Interests(skincare: true, makeup: false, concerns: ["acne", "lip", "nope", "acne"], done: true).normalized()
        XCTAssertEqual(n.concerns, ["acne"])
        XCTAssertEqual(Interests(makeup: true).visibleConcerns, ["lip", "base", "cushion", "longwear", "shade"])
        XCTAssertEqual(Interests(skincare: true).visibleConcerns, ["acne", "dry", "sensitive", "pores", "spots", "firmness", "sebum", "toneup", "trouble"])
        let defaults = UserDefaults(suiteName: "AlimiTests.interests.\(UUID().uuidString)")!
        XCTAssertNil(Interests.load(defaults))
        Interests(skincare: true, makeup: true, concerns: ["dry", "cushion"], done: true).save(defaults)
        XCTAssertEqual(Interests.load(defaults)?.concerns, ["dry", "cushion"])
    }
    func testOptionalProfileKeepsOldSavedInterestsReadable() throws {
        let data = Data(#"{"skincare":true,"makeup":false,"concerns":["dry"],"done":true}"#.utf8)
        let decoded = try JSONDecoder().decode(Interests.self, from: data)
        XCTAssertNil(decoded.ageRange)
        XCTAssertEqual(decoded.concerns, ["dry"])
        var profile = decoded
        profile.skinType = "oily"
        profile.ageRange = "18–24"
        let young = Recommend.rooms(seedRooms, profile).map(\.room.id)
        profile.ageRange = "45+"
        XCTAssertEqual(young, Recommend.rooms(seedRooms, profile).map(\.room.id))
    }
    func testRecommendationsMatchConcernsAndKeepFieldsApart() {
        let skin = Recommend.rooms(seedRooms, Interests(skincare: true, concerns: ["dry", "sensitive"]))
        XCTAssertEqual(skin.first?.room.id, "dry-sensitive")
        XCTAssertEqual(skin.first?.matched, ["dry", "sensitive"])
        XCTAssertFalse(skin.contains { $0.room.tag == "makeup" || $0.room.isBrand })
        let both = Recommend.rooms(seedRooms, Interests(skincare: true, makeup: true, concerns: ["acne", "cushion"])).map(\.room.id)
        XCTAssertTrue(both.contains("acne") && both.contains("makeup"))
        let tagged = seedRooms + [room("u-1", tag: "talk", messages: 3, concerns: ["acne", "cushion"])]
        XCTAssertEqual(Recommend.rooms(tagged, Interests(skincare: true, makeup: true, concerns: ["acne", "cushion"])).first?.room.id, "u-1")
        let busy = seedRooms.map { $0.id == "routine" ? room("routine", tag: "skin", messages: 9) : $0 }
        XCTAssertEqual(Recommend.rooms(busy, Interests(skincare: true)).first?.room.id, "routine")
        let popular = Recommend.rooms(busy, nil)
        XCTAssertTrue(popular.allSatisfy { $0.popular && $0.matched.isEmpty })
        XCTAssertEqual(popular.first?.room.id, "routine")
    }
    func testRoomPicturesAreNeverReused() {
        let lip1 = URL(string: "https://x/lip1")!, lip2 = URL(string: "https://x/lip2")!, top1 = URL(string: "https://x/top1")!
        let pics = RoomPictures.assign([room("makeup", tag: "makeup"), room("u-1", tag: "talk", concerns: ["lip"]), room("everyone", tag: "talk")],
                                       byCategory: ["립": [lip1, lip2], "전체": [top1, lip1]])
        XCTAssertEqual(pics["makeup"], lip1)
        XCTAssertEqual(pics["u-1"], lip2)
        XCTAssertEqual(pics["everyone"], top1)
    }
    func testNewMessagesOnlyAfterThisDeviceLooked() {
        XCTAssertTrue(Seen.hasNew("2026-10-19T10:00", since: "2026-10-19T09:00"))
        XCTAssertFalse(Seen.hasNew("2026-10-19T08:00", since: "2026-10-19T09:00"))
        XCTAssertFalse(Seen.hasNew("2026-10-19T10:00", since: nil), "never seen: no claim")
        let d = UserDefaults(suiteName: "AlimiTests.seen.\(UUID().uuidString)")!
        Seen.mark("acne", "2026-10-19T10:00", d); Seen.mark("acne", "2026-10-19T09:00", d)
        XCTAssertEqual(Seen.all(d)["acne"], "2026-10-19T10:00")
    }
    func testRoomTextUsesRealCountsOnly() {
        L10n.language = "ko"
        XCTAssertEqual(RoomText.compact(12_400), "1.2만")
        XCTAssertEqual(RoomText.compact(3_800), "3.8천")
        XCTAssertEqual(RoomText.compact(40), "40")
        let now = ISODate.parse("2026-10-19T10:00:00Z")!
        let live = ChatRoom(id: "a", titleEn: "a", titleKo: "a", introEn: "", introKo: "", members: 3, messages24h: 5, lastMessageAt: "2026-10-19T09:30:00Z")
        let quiet = ChatRoom(id: "b", titleEn: "b", titleKo: "b", introEn: "", introKo: "", members: 3, messages24h: 5, lastMessageAt: "2026-10-19T05:00:00Z")
        let idle = ChatRoom(id: "c", titleEn: "c", titleKo: "c", introEn: "", introKo: "", members: 3, messages24h: 0)
        XCTAssertEqual(RoomText.activity(live, now: now), "지금 활발한 대화 중")
        XCTAssertEqual(RoomText.activity(quiet, now: now), "오늘 5개의 새 글")
        XCTAssertNil(RoomText.activity(idle, now: now), "no activity claim without messages")
    }
    func testShareLinksOpenTheWebScreen() {
        XCTAssertEqual(ShareLinks.room("acne").absoluteString, "https://alimi-omega.vercel.app/?room=acne")
        XCTAssertEqual(ShareLinks.product("anua|oil").absoluteString, "https://alimi-omega.vercel.app/?product=anua%7Coil")
        XCTAssertEqual(ChatAPI.errorKey("Failure(message: \"chat:duplicate\")"), "chat.err.duplicate")
    }
}

