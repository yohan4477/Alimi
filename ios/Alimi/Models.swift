import Foundation
import Combine

// Public read-only Supabase API. The publishable key is designed to ship in clients;
// row-level security limits it to SELECT on the public price tables.
enum LiveAPI {
    static let baseURL = URL(string: "https://mqsnshnlfwsgabrsmqsz.supabase.co")!
    static let publishableKey = "sb_publishable_CJjQ-l5ev-D4OH0Na0gFoQ_szunygff"
    static let offersQuery = "select=external_id,retailer,currency,url,affiliate_url,image_url,products(slug,brand,brand_ko,name,size,category,family_key,size_label),offer_current(amount_minor,delivery_minor,availability,changed_at,last_success_at),price_observations(observed_at,amount_minor,availability)&active=eq.true&order=external_id"
    static var offersURL: URL { URL(string: "/rest/v1/offers?" + offersQuery, relativeTo: baseURL)! }

    // Every Supabase call goes through here so the apikey header is set in one place.
    static func request(_ url: URL, method: String = "GET", body: Data? = nil, contentType: String? = nil, timeout: TimeInterval = 15) -> URLRequest {
        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.httpMethod = method
        request.httpBody = body
        request.setValue(publishableKey, forHTTPHeaderField: "apikey")
        if let contentType { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        return request
    }
    // GET + 200 check + decode; nil on any failure.
    static func get<T: Decodable>(_ url: URL, session: URLSession) async -> T? {
        guard let (data, response) = try? await session.data(for: request(url)),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
}

// Mirrors one row of the offers query (also the format of the bundled live-snapshot.json).
struct OfferRow: Codable {
    struct ProductRow: Codable {
        let slug, brand, name, size, category, brandKo, familyKey, sizeLabel: String?
        enum CodingKeys: String, CodingKey { case slug, brand, name, size, category, brandKo = "brand_ko", familyKey = "family_key", sizeLabel = "size_label" }
    }
    struct Current: Codable {
        let amountMinor: Int
        let deliveryMinor: Int?
        let availability: String
        let changedAt: String
        let lastSuccessAt: String
        enum CodingKeys: String, CodingKey {
            case amountMinor = "amount_minor", deliveryMinor = "delivery_minor", availability
            case changedAt = "changed_at", lastSuccessAt = "last_success_at"
        }
    }
    struct Observation: Codable {
        let observedAt: String
        let amountMinor: Int
        let availability: String
        enum CodingKeys: String, CodingKey { case observedAt = "observed_at", amountMinor = "amount_minor", availability }
    }
    let externalId: String
    let retailer: String
    let currency: String
    let url: URL
    let affiliateUrl: URL?
    let imageUrl: URL?
    let products: ProductRow?
    let offerCurrent: Current?
    let priceObservations: [Observation]?
    enum CodingKeys: String, CodingKey {
        case externalId = "external_id", retailer, currency, url, affiliateUrl = "affiliate_url", imageUrl = "image_url"
        case products, offerCurrent = "offer_current", priceObservations = "price_observations"
    }
}
// Catalog layer row (whole official feed, current price only).
struct CatalogItem: Codable, Identifiable, Hashable {
    let retailer: String
    let market: String
    let sku: String
    let brand: String
    let brandKo: String?
    let name: String
    let category: String?
    let priceMinor: Int
    let currency: String
    let availability: String
    let imageUrl: URL?
    var sizeLabel: String? = nil
    var optionLabel: String? = nil
    var unit: String? = nil
    var unitPriceMinor: Int? = nil
    var url: String? = nil
    var affiliateUrl: String? = nil
    var familyKey: String? = nil
    var id: String { "\(retailer)|\(market)|\(sku)" }
    var buyLink: URL? { Purchase.buyURL(affiliateUrl ?? url) }
    var variantLabel: String { [sizeLabel, optionLabel].compactMap { $0 }.joined(separator: " · ") }
    var unitPrice: Double? { unitPriceMinor.map { Double($0) / 100 } }
    var price: Double { Double(priceMinor) / 100 }
    var brandLabel: String { L10n.language == "ko" ? (brandKo ?? brand) : brand }
    static let fields = "retailer,market,sku,brand,brand_ko,name,category,price_minor,currency,availability,image_url,url,affiliate_url,family_key"
    enum CodingKeys: String, CodingKey {
        case retailer, market, sku, brand, brandKo = "brand_ko", name, category, priceMinor = "price_minor", currency, availability, imageUrl = "image_url"
        case sizeLabel = "size_label", optionLabel = "option_label", unit, unitPriceMinor = "unit_price_minor"
        case url, affiliateUrl = "affiliate_url", familyKey = "family_key"
    }
    static func unitName(_ unit: String?) -> String { unit == "ml" || unit == "g" ? "10" + (unit ?? "") : unit == "pcs" ? "1pc" : (unit ?? "") }
    // Duplicate listings of the same size/option collapse to the cheapest; best unit price first.
    static func collapse(_ rows: [CatalogItem]) -> [VariantChoice] {
        var best: [String: CatalogItem] = [:]
        for r in rows {
            let k = (r.sizeLabel ?? "") + "|" + (r.optionLabel ?? "")
            if let cur = best[k], cur.priceMinor <= r.priceMinor { continue }
            best[k] = r
        }
        let list = best.values.sorted { ($0.unitPriceMinor ?? .max, $0.priceMinor) < ($1.unitPriceMinor ?? .max, $1.priceMinor) }
        let units = list.compactMap(\.unitPriceMinor)
        let bestUnit = units.count > 1 ? units.min() : nil
        return list.map { VariantChoice(item: $0, bestValue: bestUnit != nil && $0.unitPriceMinor == bestUnit) }
    }
    // One page of the Korean-brand catalog for home browsing, optionally limited to a category.
    static func pageURL(category: String, offset: Int, limit: Int = 24) -> URL {
        var c = URLComponents(url: URL(string: "/rest/v1/catalog_items", relativeTo: LiveAPI.baseURL)!, resolvingAgainstBaseURL: true)!
        var items = [URLQueryItem(name: "select", value: fields), URLQueryItem(name: "active", value: "eq.true"),
                     URLQueryItem(name: "order", value: "sku.desc"), URLQueryItem(name: "offset", value: String(offset)),
                     URLQueryItem(name: "limit", value: String(limit))]
        if category != "전체" { items.append(URLQueryItem(name: "category", value: "eq." + category)) }
        c.queryItems = items
        return c.url!
    }
    // Reduces the query to safe characters before it goes into the PostgREST filter.
    static func query(_ q: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: " &'-"))
        let kept = String(q.unicodeScalars.map { allowed.contains($0) ? Character($0) : " " })
        return String(kept.split(separator: " ").joined(separator: " ").prefix(40))
    }
    static func searchURL(_ q: String, limit: Int = 30) -> URL? {
        let term = query(q)
        guard term.count >= 2 else { return nil }
        var c = URLComponents(url: URL(string: "/rest/v1/catalog_items", relativeTo: LiveAPI.baseURL)!, resolvingAgainstBaseURL: true)!
        let like = "\"*\(term)*\""
        c.queryItems = [URLQueryItem(name: "select", value: fields),
                        URLQueryItem(name: "active", value: "eq.true"),
                        URLQueryItem(name: "or", value: "(brand.ilike.\(like),brand_ko.ilike.\(like),name.ilike.\(like))"),
                        URLQueryItem(name: "order", value: "brand,name"), URLQueryItem(name: "limit", value: String(limit))]
        return c.url
    }
}

struct VariantChoice: Identifiable {
    let item: CatalogItem
    let bestValue: Bool
    var id: String { item.id }
}

// One product family (sizes / shades grouped) for home browsing.
struct ProductFamily: Codable, Identifiable, Hashable {
    let familyKey: String
    let brand: String
    let brandKo: String?
    let baseName: String
    let category: String?
    let imageUrl: URL?
    let minPriceMinor: Int
    let maxPriceMinor: Int
    let variants: Int
    var id: String { familyKey }
    var brandLabel: String { L10n.language == "ko" ? (brandKo ?? brand) : brand }
    var priceText: String { variants > 1 && minPriceMinor != maxPriceMinor ? L("family.from", ["v": usd(Double(minPriceMinor) / 100)]) : usd(Double(minPriceMinor) / 100) }
    enum CodingKeys: String, CodingKey {
        case familyKey = "family_key", brand, brandKo = "brand_ko", baseName = "base_name", category, imageUrl = "image_url"
        case minPriceMinor = "min_price_minor", maxPriceMinor = "max_price_minor", variants
    }
    static func pageURL(category: String, offset: Int, limit: Int = 24, brand: String? = nil) -> URL {
        var c = URLComponents(url: URL(string: "/rest/v1/catalog_families", relativeTo: LiveAPI.baseURL)!, resolvingAgainstBaseURL: true)!
        var items = [URLQueryItem(name: "select", value: "family_key,brand,brand_ko,base_name,category,image_url,min_price_minor,max_price_minor,variants"),
                     URLQueryItem(name: "order", value: "sort_key.desc"), URLQueryItem(name: "offset", value: String(offset)),
                     URLQueryItem(name: "limit", value: String(limit))]
        if category != "전체" { items.append(URLQueryItem(name: "category", value: "eq." + category)) }
        if let brand { items.append(URLQueryItem(name: "brand", value: "eq." + brand)) }
        c.queryItems = items
        return c.url!
    }
}
// Popular-brand strip on home. logoUrl is optional; until a logo is added the app draws an initials badge.
struct CatalogBrand: Codable, Identifiable, Hashable {
    let brand: String
    let brandKo: String?
    let families: Int
    let logoUrl: URL?
    var id: String { brand }
    var label: String { L10n.language == "ko" ? (brandKo ?? brand) : brand }
    var initials: String {
        let words = brand.components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }
        let s = words.count > 1 ? String(words[0].prefix(1)) + String(words[1].prefix(1)) : String((words.first ?? "?").prefix(2))
        return s.uppercased()
    }
    // Same palette and hash as the web (live.js brandColor).
    static let palette: [UInt32] = [0xf35e56, 0xff8a3d, 0xf5b82e, 0x3cba7a, 0x1fa2a8, 0x3d7bf5, 0x7a5af5, 0xd94f9b, 0x5b6472, 0x2f4858]
    var color: UInt32 {
        var h: UInt32 = 7
        for c in brand.unicodeScalars { h = h &* 31 &+ c.value }
        return Self.palette[Int(h % UInt32(Self.palette.count))]
    }
    enum CodingKeys: String, CodingKey { case brand, brandKo = "brand_ko", families, logoUrl = "logo_url" }
    static let listURL = URL(string: "/rest/v1/catalog_brands?select=brand,brand_ko,families,logo_url&order=families.desc&limit=15", relativeTo: LiveAPI.baseURL)!
}

struct LiveSnapshot: Codable {
    let exportedAt: String
    let rows: [OfferRow]
}

struct PricePoint: Codable, Identifiable, Hashable {
    let date: Date
    let price: Double
    var id: Date { date }
}
struct Product: Codable, Identifiable, Hashable {
    let id: String
    let sku: String
    let brand: String
    let brandKo: String?
    let name: String
    let size: String
    let category: String
    var familyKey: String? = nil
    var sizeLabel: String? = nil
    let retailer: String
    let currency: String
    let url: URL
    let affiliateUrl: URL?
    let imageUrl: URL?
    let price: Double
    let delivery: Double?
    let availability: String
    let changedAt: Date
    let checkedAt: Date
    let history: [PricePoint]
    var buyURL: URL { affiliateUrl ?? url }
    var brandLabel: String { L10n.language == "ko" ? (brandKo ?? brand) : brand }
    // Same order as scripts/catalog-taxonomy.mjs; the category itself is computed by the collector and stored.
    static let categories = ["선케어", "클렌징", "토너·패드", "에센스·세럼", "크림·로션", "마스크팩", "립", "베이스메이크업", "아이메이크업", "헤어·바디", "세트", "기타"]
    var stockLabel: String { L(availability == "in_stock" ? "stock.in" : availability == "out_of_stock" ? "stock.out" : "stock.unknown") }

    static func from(_ rows: [OfferRow]) -> [Product] {
        rows.compactMap { r -> Product? in
            guard let p = r.products, let slug = p.slug, let brand = p.brand, let name = p.name, let c = r.offerCurrent,
                  let changed = ISODate.parse(c.changedAt), let checked = ISODate.parse(c.lastSuccessAt) else { return nil }
            let history = (r.priceObservations ?? []).compactMap { o in
                ISODate.parse(o.observedAt).map { PricePoint(date: $0, price: Double(o.amountMinor) / 100) }
            }.sorted { $0.date < $1.date }
            return Product(id: slug, sku: r.externalId, brand: brand, brandKo: p.brandKo, name: name, size: p.size ?? "", category: p.category ?? "기타",
                           familyKey: p.familyKey, sizeLabel: p.sizeLabel ?? p.size,
                           retailer: r.retailer, currency: r.currency, url: r.url, affiliateUrl: r.affiliateUrl, imageUrl: r.imageUrl,
                           price: Double(c.amountMinor) / 100, delivery: c.deliveryMinor.map { Double($0) / 100 },
                           availability: c.availability, changedAt: changed, checkedAt: checked, history: history)
        }.sorted { ($0.brand, $0.name) < ($1.brand, $1.name) }
    }
}

enum ISODate {
    private static let fractional: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f }()
    private static let plain = ISO8601DateFormatter()
    static func parse(_ s: String) -> Date? { fractional.date(from: s) ?? plain.date(from: s) }
}

// Stored in UserDefaults; older payloads may still contain a "targets" key, which decoding ignores.
struct SavedState: Codable {
    var favorites: Set<String> = []
}

@MainActor
final class AlimiStore: ObservableObject {
    enum Source: Equatable { case live, snapshot(String), none }
    @Published var saved: SavedState { didSet { persist() } }
    @Published private(set) var products: [Product]
    @Published private(set) var source: Source
    @Published private(set) var loading = false
    private let defaults: UserDefaults
    private let session: URLSession
    private var catalogSaves: [Product] = []

    init(defaults: UserDefaults = .standard, products: [Product]? = nil, session: URLSession = .shared) {
        self.defaults = defaults
        self.session = session
        // UI tests start from an empty device state and the bundled snapshot only (no network dependency).
        if ProcessInfo.processInfo.arguments.contains("-uiTestingReset") { defaults.removeObject(forKey: "alimi.live.v1"); defaults.removeObject(forKey: "seoulbeauty.catalog-saves.v1") }
        if ProcessInfo.processInfo.arguments.contains("-uiTestingReset") { UserDefaults.standard.removeObject(forKey: Interests.key); UserDefaults.standard.removeObject(forKey: Seen.key) }
        saved = defaults.data(forKey: "alimi.live.v1").flatMap { try? JSONDecoder().decode(SavedState.self, from: $0) } ?? SavedState()
        if let products {
            self.products = products; source = .none
        } else if let snap = Self.bundledSnapshot() {
            self.products = Product.from(snap.rows); source = .snapshot(snap.exportedAt)
        } else {
            self.products = []; source = .none
        }
        catalogSaves = defaults.data(forKey: "seoulbeauty.catalog-saves.v1").flatMap { try? JSONDecoder().decode([Product].self, from: $0) } ?? []
        self.products = mergingCatalogSaves(self.products)
    }
    private func mergingCatalogSaves(_ rows: [Product]) -> [Product] {
        let keys = Set(catalogSaves.map { $0.retailer + "|" + $0.sku })
        return rows.filter { !keys.contains($0.retailer + "|" + $0.sku) } + catalogSaves
    }
    static func bundledSnapshot() -> LiveSnapshot? {
        guard let url = Bundle.main.url(forResource: "live-snapshot", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(LiveSnapshot.self, from: data)
    }
    func refresh() async {
        if ProcessInfo.processInfo.arguments.contains("-uiTestingOffline") { return }
        loading = true
        defer { loading = false }
        guard let rows: [OfferRow] = await LiveAPI.get(LiveAPI.offersURL, session: session) else { return }
        let fresh = Product.from(rows)
        if !fresh.isEmpty { products = mergingCatalogSaves(fresh); source = .live }
    }
    func searchCatalog(_ q: String) async -> [CatalogItem]? {
        if ProcessInfo.processInfo.arguments.contains("-uiTestingOffline") { return [] }
        guard let url = CatalogItem.searchURL(q) else { return [] }
        let rows: [CatalogItem]? = await LiveAPI.get(url, session: session)
        let tracked = Set(products.map(\.sku))
        return rows?.filter { !tracked.contains($0.sku) }
    }
    // Save a local snapshot; no RPC, history subscription or price-alert enrollment.
    func saveCatalogItem(_ item: CatalogItem) async -> Bool {
        if let existing = products.first(where: { $0.sku == item.sku && $0.retailer == item.retailer }) {
            saved.favorites.insert(existing.id)
            return true
        }
        guard let link = item.buyLink else { return false }
        let id = "catalog|" + item.id
        let p = Product(id: id, sku: item.sku, brand: item.brand, brandKo: item.brandKo, name: item.name,
                        size: item.sizeLabel ?? "", category: item.category ?? "기타", familyKey: item.familyKey, retailer: item.retailer,
                        currency: item.currency, url: URL(string: item.url ?? "") ?? link,
                        affiliateUrl: item.affiliateUrl.flatMap { URL(string: $0) }, imageUrl: item.imageUrl,
                        price: item.price, delivery: nil, availability: item.availability,
                        changedAt: .distantPast, checkedAt: .distantPast, history: [])
        let next = catalogSaves.filter { $0.id != id } + [p]
        guard let data = try? JSONEncoder().encode(next) else { return false }
        defaults.set(data, forKey: "seoulbeauty.catalog-saves.v1")
        catalogSaves = next
        products = mergingCatalogSaves(products)
        saved.favorites.insert(id)
        EventLogger.shared.log(.wishlistAdd, productID: id, props: ["from": "catalog"])
        return true
    }
    private func persist() {
        if let data = try? JSONEncoder().encode(saved) { defaults.set(data, forKey: "alimi.live.v1") }
    }
    func toggle(_ id: String) {
        if saved.favorites.contains(id) { saved.favorites.remove(id); EventLogger.shared.log(.wishlistRemove, productID: id) }
        else { saved.favorites.insert(id); EventLogger.shared.log(.wishlistAdd, productID: id) }
    }
    func search(_ query: String, category: String = "전체", favoritesOnly: Bool = false) -> [Product] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return products.filter { p in
            (!favoritesOnly || saved.favorites.contains(p.id)) &&
            (category == "전체" || p.category == category) &&
            (q.isEmpty || "\(p.brand) \(p.brandKo ?? "") \(p.name)".localizedCaseInsensitiveContains(q))
        }
    }
    var categories: [String] { ["전체"] + Product.categories }
    func brands() async -> [CatalogBrand]? {
        if ProcessInfo.processInfo.arguments.contains("-uiTestingOffline") {
            return [CatalogBrand(brand: "COSRX", brandKo: "코스알엑스", families: 2, logoUrl: nil), CatalogBrand(brand: "ANUA", brandKo: "아누아", families: 1, logoUrl: nil)]
        }
        return await LiveAPI.get(CatalogBrand.listURL, session: session)
    }
    func familiesPage(category: String, offset: Int, brand: String? = nil) async -> [ProductFamily]? {
        if ProcessInfo.processInfo.arguments.contains("-uiTestingOffline") { return [] }
        return await LiveAPI.get(ProductFamily.pageURL(category: category, offset: offset, brand: brand), session: session)
    }
    func family(_ key: String) async -> [VariantChoice]? {
        if ProcessInfo.processInfo.arguments.contains("-uiTestingOffline") { return [] }
        var c = URLComponents(url: URL(string: "/rest/v1/catalog_items", relativeTo: LiveAPI.baseURL)!, resolvingAgainstBaseURL: true)!
        c.queryItems = [URLQueryItem(name: "select", value: CatalogItem.fields + ",size_label,option_label,unit,unit_price_minor,url,affiliate_url"),
                        URLQueryItem(name: "active", value: "eq.true"), URLQueryItem(name: "family_key", value: "eq." + key),
                        URLQueryItem(name: "limit", value: "60")]
        guard let rows: [CatalogItem] = await LiveAPI.get(c.url!, session: session) else { return nil }
        return CatalogItem.collapse(rows)
    }
    func catalogPage(category: String, offset: Int) async -> [CatalogItem]? {
        if ProcessInfo.processInfo.arguments.contains("-uiTestingOffline") { return [] }
        return await LiveAPI.get(CatalogItem.pageURL(category: category, offset: offset), session: session)
    }
    func reset() { saved = SavedState() }
}

// Retailer links. Awin affiliate links carry a click reference so sales can be traced to a post or chat.
enum Purchase {
    static func buyURL(_ raw: String?, ref: String? = nil) -> URL? {
        guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty,
              var c = URLComponents(string: raw), c.scheme == "https", c.host != nil, c.user == nil, c.password == nil else { return nil }
        if c.host == "www.awin1.com", let ref {
            let allowed = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")
            let clean = String(ref.filter { allowed.contains($0) }.prefix(50))
            if !clean.isEmpty {
                var items = (c.queryItems ?? []).filter { $0.name != "clickref" }
                items.append(URLQueryItem(name: "clickref", value: clean))
                c.queryItems = items
            }
        }
        return c.url
    }
}
