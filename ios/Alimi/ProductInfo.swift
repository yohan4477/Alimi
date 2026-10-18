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
struct ProductInformationView: View {
    let category: String
    var retailer = ""
    var sku = ""
    var source: URL? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L("about.title")).font(.title3.bold())
            Text(L("about.type." + (Product.categories.contains(category) ? category : "기타"))).font(.subheadline)
            if let copy = ProductInformation.copy(retailer: retailer, sku: sku) {
                Text(L("about.official")).font(.caption.bold())
                Text(copy.description).font(.subheadline)
                if let url = Purchase.buyURL(copy.sourceUrl) { Link(L("about.source"), destination: url).font(.caption) }
            } else {
                Text(L("about.general")).font(.caption).foregroundStyle(.secondary)
                if let source { Link(L("about.source"), destination: source).font(.caption) }
            }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(16)
            .background(Color.canvas, in: RoundedRectangle(cornerRadius: 14))
            .accessibilityIdentifier("product-description")
    }
}
