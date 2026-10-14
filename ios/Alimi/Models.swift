import Foundation
import Combine

struct Offer: Codable, Identifiable {
    var name: String
    var price: Int
    var shipping: Int
    var days: String
    var id: String { name }
    var total: Int { price + shipping }
}
struct Product: Codable, Identifiable {
    let id: String
    let brand: String
    let name: String
    let size: String
    let category: String
    let keywords: String
    let base: Int
    let history: [Int]
    let offers: [Offer]
}
struct SavedState: Codable {
    var favorites: Set<String> = []
    var targets: [String: Int] = [:]
}
enum PriceRule {
    static func valid(_ text: String) -> Int? {
        guard !text.isEmpty, text.allSatisfy({ $0.isASCII && $0.isNumber }),
              let value = Int(text), (1...10_000_000).contains(value) else { return nil }
        return value
    }
    static func status(target: Int?, current: Int) -> String {
        guard let target else { return "미설정" }
        return current <= target ? "목표가 도달" : "기다리는 중"
    }
}
final class AlimiStore: ObservableObject {
    @Published var saved: SavedState { didSet { persist() } }
    @Published var simulations: [String: Int] = [:]
    @Published var loadError: String?
    let products: [Product]
    private let defaults: UserDefaults
    init(defaults: UserDefaults = .standard, products: [Product]? = nil) {
        self.defaults = defaults
        saved = defaults.data(forKey: "alimi.v1").flatMap { try? JSONDecoder().decode(SavedState.self, from: $0) } ?? SavedState()
        if let products { self.products = products }
        else {
            do {
                guard let url = Bundle.main.url(forResource: "products", withExtension: "json") else {
                    throw CocoaError(.fileNoSuchFile)
                }
                self.products = try JSONDecoder().decode([Product].self, from: Data(contentsOf: url))
            } catch {
                self.products = []
                loadError = "테스트 상품을 불러오지 못했습니다. products.json 리소스를 확인하세요."
            }
        }
    }
    private func persist() {
        if let data = try? JSONEncoder().encode(saved) { defaults.set(data, forKey: "alimi.v1") }
    }
    func toggle(_ id: String) {
        if saved.favorites.contains(id) { saved.favorites.remove(id) }
        else { saved.favorites.insert(id) }
    }
    func search(_ query: String, category: String = "전체", favoritesOnly: Bool = false) -> [Product] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return products.filter { p in
            (!favoritesOnly || saved.favorites.contains(p.id)) &&
            (category == "전체" || p.category == category) &&
            (q.isEmpty || "\(p.brand) \(p.name) \(p.keywords)".localizedCaseInsensitiveContains(q))
        }
    }
    func offers(_ p: Product) -> [Offer] {
        p.offers.enumerated().map { index, original in
            var offer = original
            if index == 1, let simulated = simulations[p.id] { offer.price = simulated }
            return offer
        }.sorted { $0.total == $1.total ? $0.name < $1.name : $0.total < $1.total }
    }
    func price(_ p: Product) -> Int { offers(p).first?.total ?? p.base }
    func history(_ p: Product) -> [Int] { Array(p.history.prefix(29)) + [price(p)] }
    func status(_ p: Product) -> String { PriceRule.status(target: saved.targets[p.id], current: price(p)) }
    func reset() { saved = SavedState(); simulations = [:] }
}
