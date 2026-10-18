import Foundation
import Combine

// Public read-only Supabase API. The publishable key is designed to ship in clients;
// row-level security limits it to SELECT on the public price tables.
enum LiveAPI {
    static let baseURL = URL(string: "https://mqsnshnlfwsgabrsmqsz.supabase.co")!
    static let publishableKey = "sb_publishable_CJjQ-l5ev-D4OH0Na0gFoQ_szunygff"
    static let offersQuery = "select=external_id,retailer,currency,url,affiliate_url,image_url,products(slug,brand,name,size),offer_current(amount_minor,delivery_minor,availability,changed_at,last_success_at),price_observations(observed_at,amount_minor,availability)&active=eq.true&order=external_id"
    static var offersURL: URL { URL(string: "/rest/v1/offers?" + offersQuery, relativeTo: baseURL)! }
}

// Mirrors one row of the offers query (also the format of the bundled live-snapshot.json).
struct OfferRow: Codable {
    struct ProductRow: Codable { let slug, brand, name, size: String? }
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
struct LiveSnapshot: Codable {
    let exportedAt: String
    let rows: [OfferRow]
}

struct PricePoint: Identifiable, Hashable {
    let date: Date
    let price: Double
    var id: Date { date }
}
struct Product: Identifiable, Hashable {
    let id: String
    let sku: String
    let brand: String
    let name: String
    let size: String
    let category: String
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
    var stockLabel: String { availability == "in_stock" ? "재고 있음" : availability == "out_of_stock" ? "품절" : "재고 미확인" }

    static func category(for name: String) -> String {
        let n = name.lowercased()
        if ["cushion", "tint", "gloss", "pudding"].contains(where: { n.contains($0) }) { return "메이크업" }
        if n.contains("oil") || n.contains("cleans") { return "클렌징" }
        return "스킨케어"
    }
    static func from(_ rows: [OfferRow]) -> [Product] {
        rows.compactMap { r -> Product? in
            guard let p = r.products, let slug = p.slug, let brand = p.brand, let name = p.name, let c = r.offerCurrent,
                  let changed = ISODate.parse(c.changedAt), let checked = ISODate.parse(c.lastSuccessAt) else { return nil }
            let history = (r.priceObservations ?? []).compactMap { o in
                ISODate.parse(o.observedAt).map { PricePoint(date: $0, price: Double(o.amountMinor) / 100) }
            }.sorted { $0.date < $1.date }
            return Product(id: slug, sku: r.externalId, brand: brand, name: name, size: p.size ?? "", category: category(for: name),
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

enum PriceHistory {
    static var calendar: Calendar = { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "Asia/Seoul")!; return c }()
    // History is change-only: each day shows the last price observed by the end of that Korean day.
    // Days before tracking started have no value.
    static func daily(_ history: [PricePoint], days: Int, now: Date = Date()) -> [PricePoint] {
        let today = calendar.startOfDay(for: now)
        return (0..<days).reversed().compactMap { back in
            guard let day = calendar.date(byAdding: .day, value: -back, to: today),
                  let end = calendar.date(byAdding: .day, value: 1, to: day),
                  let last = history.last(where: { $0.date < end }) else { return nil }
            return PricePoint(date: day, price: last.price)
        }
    }
    static func trackedDays(_ history: [PricePoint], now: Date = Date()) -> Int {
        guard let first = history.first else { return 0 }
        return (calendar.dateComponents([.day], from: calendar.startOfDay(for: first.date), to: calendar.startOfDay(for: now)).day ?? 0) + 1
    }
}

enum PriceRule {
    static func valid(_ text: String) -> Double? {
        guard text.range(of: #"^\d+(\.\d{1,2})?$"#, options: .regularExpression) != nil,
              let value = Double(text), (0.01...10_000).contains(value) else { return nil }
        return value
    }
    static func status(target: Double?, current: Double) -> String {
        guard let target else { return "미설정" }
        return current <= target ? "목표가 도달" : "기다리는 중"
    }
}

struct SavedState: Codable {
    var favorites: Set<String> = []
    var targets: [String: Double] = [:]
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

    init(defaults: UserDefaults = .standard, products: [Product]? = nil, session: URLSession = .shared) {
        self.defaults = defaults
        self.session = session
        saved = defaults.data(forKey: "alimi.live.v1").flatMap { try? JSONDecoder().decode(SavedState.self, from: $0) } ?? SavedState()
        if let products {
            self.products = products; source = .none
        } else if let snap = Self.bundledSnapshot() {
            self.products = Product.from(snap.rows); source = .snapshot(snap.exportedAt)
        } else {
            self.products = []; source = .none
        }
    }
    static func bundledSnapshot() -> LiveSnapshot? {
        guard let url = Bundle.main.url(forResource: "live-snapshot", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(LiveSnapshot.self, from: data)
    }
    func refresh() async {
        loading = true
        defer { loading = false }
        var request = URLRequest(url: LiveAPI.offersURL, timeoutInterval: 15)
        request.setValue(LiveAPI.publishableKey, forHTTPHeaderField: "apikey")
        guard let (data, response) = try? await session.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let rows = try? JSONDecoder().decode([OfferRow].self, from: data) else { return }
        let fresh = Product.from(rows)
        if !fresh.isEmpty { products = fresh; source = .live }
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
            (q.isEmpty || "\(p.brand) \(p.name)".localizedCaseInsensitiveContains(q))
        }
    }
    var categories: [String] { ["전체"] + Array(Set(products.map(\.category))).sorted() }
    func status(_ p: Product) -> String { PriceRule.status(target: saved.targets[p.id], current: p.price) }
    func reset() { saved = SavedState() }
}
