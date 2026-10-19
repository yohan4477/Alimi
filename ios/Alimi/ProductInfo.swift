import SwiftUI

struct LicensedProductCopy: Decodable {
    let retailer, market, sku, description, sourceUrl, permissionReference: String
}
enum ProductInformation {
    struct File: Decodable { let items: [LicensedProductCopy] }
    static let items: [LicensedProductCopy] = {
        guard let url = Bundle.main.url(forResource: "product-content", withExtension: "json"),
              let data = try? Data(contentsOf: url), let file = try? JSONDecoder().decode(File.self, from: data) else { return [] }
        return file.items
    }()
    static func copy(retailer: String, sku: String) -> LicensedProductCopy? {
        items.first { $0.retailer == retailer && $0.market == "US" && $0.sku == sku &&
            !$0.permissionReference.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !$0.description.isEmpty &&
            Purchase.buyURL($0.sourceUrl) != nil }
    }
}
// Retailer description stored with the catalog row; shown only when its permission basis is recorded.
struct CatalogCopyRow: Decodable {
    let url: String?
    let description: String?
    let descriptionPermission: String?
    enum CodingKeys: String, CodingKey { case url, description, descriptionPermission = "description_permission" }
    func copy(retailer: String, sku: String) -> LicensedProductCopy? {
        guard let text = description?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty,
              let permission = descriptionPermission?.trimmingCharacters(in: .whitespacesAndNewlines), !permission.isEmpty,
              let url, Purchase.buyURL(url) != nil else { return nil }
        return LicensedProductCopy(retailer: retailer, market: "US", sku: sku, description: text, sourceUrl: url, permissionReference: permission)
    }
}
extension ProductInformation {
    static func fetchCatalogCopy(retailer: String, sku: String) async -> LicensedProductCopy? {
        if ProcessInfo.processInfo.arguments.contains("-uiTestingOffline") || sku.isEmpty { return nil }
        var c = URLComponents(url: URL(string: "/rest/v1/catalog_items", relativeTo: LiveAPI.baseURL)!, resolvingAgainstBaseURL: true)!
        c.queryItems = [URLQueryItem(name: "select", value: "url,description,description_permission"), URLQueryItem(name: "sku", value: "eq." + sku),
                        URLQueryItem(name: "retailer", value: "eq." + retailer), URLQueryItem(name: "limit", value: "1")]
        let rows: [CatalogCopyRow]? = await LiveAPI.get(c.url!, session: .shared)
        guard let row = rows?.first else { return nil }
        return row.copy(retailer: retailer, sku: sku)
    }
}
struct ProductInformationView: View {
    let category: String
    var retailer = ""
    var sku = ""
    var source: URL? = nil
    @State private var fetched: LicensedProductCopy?
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L("about.title")).font(.title3.bold())
            Text(L("about.type." + (Product.categories.contains(category) ? category : "기타"))).font(.subheadline)
            if let copy = ProductInformation.copy(retailer: retailer, sku: sku) ?? fetched {
                DisclosureGroup(L("about.official")) {
                    Text(copy.description).font(.subheadline)
                }
                if let url = Purchase.buyURL(copy.sourceUrl) { Link(L("about.source"), destination: url).font(.caption) }
            } else {
                Text(L("about.general")).font(.caption).foregroundStyle(.secondary)
                if let source { Link(L("about.source"), destination: source).font(.caption) }
            }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(16)
            .background(Color.canvas, in: RoundedRectangle(cornerRadius: 14))
            .accessibilityIdentifier("product-description")
            .task(id: sku) { if ProductInformation.copy(retailer: retailer, sku: sku) == nil { fetched = await ProductInformation.fetchCatalogCopy(retailer: retailer, sku: sku) } }
    }
}
