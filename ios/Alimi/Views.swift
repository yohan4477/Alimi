import SwiftUI
import UIKit
import Charts

struct RootView: View {
    @EnvironmentObject var store: AlimiStore
    @State private var tab = MainTab.home
    @AppStorage("alimi.lang") private var lang = ""
    var body: some View {
        TabView(selection: $tab) {
            BrowseView().tabItem { Label(L("tab.home"), systemImage: "house") }.tag(MainTab.home)
            SavedView(tab: $tab).tabItem { Label(L("favorites"), systemImage: "heart") }.tag(MainTab.saved)
            SearchView().tabItem { Label(L("search.title"), systemImage: "magnifyingglass") }.tag(MainTab.search)
            CommunityTab().tabItem { Label(L("nav.community"), systemImage: "bubble.left.and.bubble.right") }.tag(MainTab.chat)
            AlertsView().tabItem { Label(L("alerts.title"), systemImage: "bell") }.tag(MainTab.alerts)
        }.id(lang).task { await store.refresh(); EventLogger.shared.log(.homeView, props: ["source": store.source == .live ? "live" : "snapshot"]) }
    }
}
private let dayFormat: Date.FormatStyle = .dateTime.month().day().locale(L10n.locale)

struct SourceBanner: View {
    @EnvironmentObject var store: AlimiStore
    private var text: String {
        switch store.source {
        case .live:
            let latest = store.products.map(\.checkedAt).max()
            return latest.map { L("notice.live", ["date": $0.formatted(dayFormat)]) } ?? L("notice.liveShort")
        case .snapshot(let at):
            return ISODate.parse(at).map { L("notice.offline", ["date": $0.formatted(dayFormat)]) } ?? L("notice.offlineShort")
        case .none:
            return L("dataFailed")
        }
    }
    var body: some View {
        Label(text, systemImage: store.source == .live ? "checkmark.seal" : "wifi.slash")
            .font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
            .padding(12).background(Color.canvas, in: RoundedRectangle(cornerRadius: 10))
    }
}
// Product photo loader. AsyncImage restarts (and reports a cancellation error) whenever a list cell is
// re-rendered, e.g. after tapping the heart, which left "사진을 불러오지 못했어요" in the favorites tab.
// This keeps the loaded image in memory, ignores cancellations and retries a failed load once.
@MainActor final class ImageCache {
    static let shared = ImageCache()
    private let cache = NSCache<NSURL, UIImage>()
    func image(for url: URL) -> UIImage? { cache.object(forKey: url as NSURL) }
    func clear() { cache.removeAllObjects() }
    func load(_ url: URL) async -> UIImage? {
        if let hit = image(for: url) { return hit }
        for attempt in 0..<2 {
            if Task.isCancelled { return nil }
            if let (data, response) = try? await URLSession.shared.data(from: url),
               (response as? HTTPURLResponse)?.statusCode == 200, let image = UIImage(data: data) {
                cache.setObject(image, forKey: url as NSURL)
                return image
            }
            if attempt == 0 { try? await Task.sleep(for: .milliseconds(500)) }
        }
        return nil
    }
}
struct RemoteImage: View {
    let url: URL?
    let label: String
    var onLoad: (Bool) -> Void = { _ in }
    @State private var image: UIImage?
    @State private var failed = false
    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image).resizable().scaledToFit().accessibilityIdentifier("product-image")
            } else {
                VStack(spacing: 8) {
                    Text(label).font(.caption).lineLimit(1)
                    if failed || url == nil { Text(L("noPhoto")).font(.caption2) } else { ProgressView() }
                }.foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity).background(Color.canvas)
            }
        }
        .frame(maxWidth: .infinity)
        .task(id: url) {
            guard let url else { return }
            if let hit = ImageCache.shared.image(for: url) { image = hit; onLoad(true); return }
            let loaded = await ImageCache.shared.load(url)
            if let loaded { image = loaded; failed = false; onLoad(true) } else if !Task.isCancelled { failed = true; onLoad(false) }
        }
    }
}
struct ProductArt: View {
    let product: Product
    var onLoad: (Bool) -> Void = { _ in }
    var body: some View {
        RemoteImage(url: product.imageUrl, label: product.brandLabel, onLoad: onLoad).accessibilityLabel("\(product.brandLabel) \(product.name)")
    }
}
struct BrowseView: View {
    @EnvironmentObject var store: AlimiStore
    @State private var category = "전체"
    @State private var catalog: [CatalogItem]? = []
    @State private var browse: [ProductFamily] = []
    @State private var openFamily: ProductFamily?
    @State private var browseDone = false
    @State private var browseLoading = false
    @State private var brands: [CatalogBrand] = []
    @State private var brandsLoading = false
    @State private var brandsFailed = false
    private var results: [Product] { store.search("", category: category) }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    SourceBanner()
                    VStack(alignment: .leading, spacing: 8) {
                        Text(L("hero.line1")).font(.system(size: 28, weight: .bold))
                        Text(L("hero.line2")).font(.system(size: 28, weight: .bold))
                        Text(L("hero.subApp")).font(.subheadline).foregroundStyle(.secondary)
                    }.padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading)
                    if brandsLoading { ProgressView(L("loading")).frame(maxWidth: .infinity) }
                    else if brandsFailed {
                        VStack(alignment: .leading) {
                            Text(L("brands.title")).font(.title3.bold())
                            Text(L("loadFailed")).font(.caption)
                            Button(L("retry")) { Task { await loadBrands() } }
                        }
                    } else if !brands.isEmpty { BrandStrip(brands: brands) }
                    CategoryTabs(categories: store.categories, selection: $category)
                    HStack {
                        Text(L("section.watching")).font(.headline)
                        Spacer()
                        Text(L("count", ["n": results.count])).font(.subheadline).foregroundStyle(.secondary)
                    }
                    if results.isEmpty {
                        Text(L("empty.watchingCategory"))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 16)], spacing: 24) {
                        ForEach(results) { product in TrackedCard(product: product) }
                    }
                    browseSection
                }.padding(20)
            }.navigationTitle("SeoulBeauty")
                .task(id: category) {
                    browse = []; browseDone = false
                    await loadMore()
                }
                .task { if brands.isEmpty { await loadBrands() } }
                .navigationBarTitleDisplayMode(.inline)
                .navigationDestination(for: CatalogBrand.self) { BrandView(brand: $0) }
                .refreshable { await store.refresh() }
                .sheet(item: $openFamily) { family in FamilySheet(family: family).environmentObject(store) }
        }
    }
    private func loadBrands() async {
        guard !brandsLoading else { return }
        brandsLoading = true
        let list = await store.brands()
        brandsLoading = false
        brandsFailed = list == nil
        if let list { brands = list }
    }

}
// Round brand badges, five per row, like a delivery app's popular-brand grid. Tapping one opens the brand page.
struct BrandStrip: View {
    let brands: [CatalogBrand]
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L("brands.title")).font(.title3.bold())
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHGrid(rows: [GridItem(.fixed(88), spacing: 12), GridItem(.fixed(88))], spacing: 4) {
                    ForEach(BrandStrip.twoRowOrder(brands)) { b in
                        NavigationLink(value: b) { BrandBadge(brand: b) }
                            .buttonStyle(.plain).frame(width: 64).accessibilityIdentifier("brand-\(b.brand)")
                    }
                }
            }
        }
    }
    // LazyHGrid fills column by column; interleave so ranks 1...ceil(n/2) read left to right on the top row.
    static func twoRowOrder<T>(_ a: [T]) -> [T] {
        let cols = (a.count + 1) / 2
        var out: [T] = []
        for c in 0..<cols {
            out.append(a[c])
            if cols + c < a.count { out.append(a[cols + c]) }
        }
        return out
    }
}
struct BrandBadge: View {
    let brand: CatalogBrand
    var size: CGFloat = 60
    var showLabel = true
    @State private var logoImage: UIImage?
    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                Circle().fill(Color(rgb: brand.color))
                Text(brand.initials).font(.system(size: size * 0.3, weight: .heavy)).foregroundStyle(.white)
                if let logoImage {
                    Image(uiImage: logoImage).resizable().scaledToFit().background(Color.white).clipShape(Circle())
                }
            }
            .frame(width: size, height: size)
            .overlay(Circle().stroke(Color(.separator), lineWidth: 0.5))
            .task(id: brand.logoUrl) {
                logoImage = nil
                guard let url = brand.logoUrl else { return }
                let image = await ImageCache.shared.load(url)
                guard !Task.isCancelled else { return }
                logoImage = image
            }
            if showLabel {
                Text(brand.label).font(.caption2).multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.85)
                    .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity)
            }
        }
    }
}
struct CategoryTabs: View {
    let categories: [String]
    @Binding var selection: String
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                ForEach(categories, id: \.self) { item in
                    Button { selection = item } label: {
                        Text(L10n.category(item)).font(.subheadline.weight(.medium)).padding(.horizontal, 16).padding(.vertical, 9)
                            .background(selection == item ? Color.alimi : Color.canvas, in: Capsule())
                            .foregroundStyle(selection == item ? .white : .primary)
                    }
                    .accessibilityIdentifier("category-\(item)")
                    .accessibilityAddTraits(selection == item ? .isSelected : [])
                }
            }
        }
    }
}
struct TrackedCard: View {
    @EnvironmentObject var store: AlimiStore
    let product: Product
    @State private var photoLoaded = false
    var body: some View {
        let saved = store.saved.favorites.contains(product.id)
        VStack(alignment: .leading, spacing: 8) {
            NavigationLink { ProductDetail(product: product) } label: {
                VStack(alignment: .leading, spacing: 8) {
                    ProductArt(product: product) { photoLoaded = $0 }.frame(height: 180)
                    Text(product.brandLabel).font(.caption).foregroundStyle(.secondary)
                    Text(product.name).font(.subheadline).lineLimit(2).frame(minHeight: 38, alignment: .top)
                    Text(usd(product.price)).font(.system(size: 23, weight: .bold, design: .rounded))
                    Text(L10n.category(product.category) + (product.size.isEmpty ? "" : " · " + product.size)).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }.foregroundStyle(.primary)
            }.buttonStyle(.plain).accessibilityIdentifier("product-\(product.id)").accessibilityValue(photoLoaded ? "photo-loaded" : "photo-missing")
            Button { store.toggle(product.id) } label: {
                Label(L(saved ? "favorite.saved" : "favorite.add"), systemImage: saved ? "heart.fill" : "heart").font(.caption).frame(minHeight: 44)
            }.accessibilityIdentifier("favorite-\(product.id)")
        }
    }
}
extension BrowseView {
    // Home browsing: one row per product family (sizes / shades grouped), one page at a time.
    var browseSection: some View {
        LazyVStack(alignment: .leading, spacing: 12) {
            Text(L("section.all")).font(.headline)
            Text(L("family.pick")).font(.caption).foregroundStyle(.secondary)
            ForEach(browse) { family in
                FamilyRow(family: family) { openFamily = family }
                    .onAppear { if family.id == browse.last?.id { Task { await loadMore() } } }
            }
            if browseLoading { ProgressView().frame(maxWidth: .infinity) }
            else if browseDone && browse.isEmpty { Text(L("empty.products")).font(.caption).foregroundStyle(.secondary) }
        }.padding(.top, 12)
    }
    func loadMore() async {
        guard !browseLoading, !browseDone else { return }
        browseLoading = true
        let requested = category
        let page = await store.familiesPage(category: requested, offset: browse.count)
        browseLoading = false
        guard requested == category else { return }
        guard let page else { browseDone = true; return }
        browse.append(contentsOf: page)
        if page.count < 24 { browseDone = true }
    }
}
struct FamilyRow: View {
    let family: ProductFamily
    let open: () -> Void
    var body: some View {
        Button(action: open) {
            HStack(spacing: 12) {
                RemoteImage(url: family.imageUrl, label: family.brandLabel).frame(width: 64, height: 64)
                VStack(alignment: .leading, spacing: 4) {
                    Text(family.brandLabel).font(.caption).foregroundStyle(.secondary)
                    Text(family.baseName).font(.subheadline).lineLimit(2)
                    Text(family.priceText).font(.subheadline.bold())
                    if family.variants > 1 { Text(L("family.options", ["n": family.variants])).font(.caption2).foregroundStyle(.secondary) }
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.tertiary)
            }.contentShape(Rectangle())
        }.buttonStyle(.plain).accessibilityIdentifier("family-\(family.familyKey)")
    }
}
// Sizes / options of one family with price, unit price, best-value badge and a heart per variant.
struct VariantList: View {
    @EnvironmentObject var store: AlimiStore
    let variants: [VariantChoice]
    var ref: String? = nil
    @State private var busy: String?
    @Environment(\.openURL) private var openURL
    var body: some View {
        ForEach(variants) { v in
            let trackedID = store.products.first { $0.sku == v.item.sku }?.id
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(v.item.variantLabel.isEmpty ? L("family.default") : v.item.variantLabel).font(.subheadline.bold())
                        if v.bestValue { Text(L("badge.bestValue")).font(.caption2.bold()).foregroundStyle(.red) }
                    }
                    if let unit = v.item.unitPrice {
                        Text(L("unit.price", ["v": usd(unit), "u": CatalogItem.unitName(v.item.unit)])).font(.caption).foregroundStyle(.secondary)
                    }
                    if trackedID != nil { Text(L("family.watching")).font(.caption2).foregroundStyle(.secondary) }
                }
                Spacer()
                Text(usd(v.item.price)).font(.headline)
                if let link = Purchase.buyURL(v.item.affiliateUrl ?? v.item.url, ref: ref) {
                    Button(L("variant.buy")) {
                        EventLogger.shared.log(.merchantClick, props: ["from": ref ?? "options", "sku": v.item.sku])
                        openURL(link)
                    }.buttonStyle(.borderedProminent).controlSize(.small).accessibilityIdentifier("variant-buy-\(v.item.sku)")
                }
                Button {
                    if let id = trackedID { store.toggle(id) }
                    else { busy = v.item.id; Task { _ = await store.startTracking(v.item); busy = nil } }
                } label: {
                    let saved = trackedID.map { store.saved.favorites.contains($0) } ?? false
                    Image(systemName: busy == v.item.id ? "hourglass" : saved ? "heart.fill" : "heart").font(.title3).frame(width: 44, height: 44)
                }.disabled(busy != nil).accessibilityLabel(L("save.action"))
            }
            Divider()
        }
    }
}
struct FamilySheet: View {
    @EnvironmentObject var store: AlimiStore
    @Environment(\.dismiss) private var dismiss
    let family: ProductFamily
    var ref: String? = nil
    @State private var variants: [VariantChoice]?
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    RemoteImage(url: family.imageUrl, label: family.brandLabel).frame(height: 180)
                    Text(family.brandLabel).font(.caption).foregroundStyle(.secondary)
                    Text(family.baseName).font(.title3.bold())
                    Text(L("family.buyHint")).font(.caption).foregroundStyle(.secondary)
                    if let variants { VariantList(variants: variants, ref: ref) } else { ProgressView().frame(maxWidth: .infinity) }
                }.padding(20)
            }
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(L("close")) { dismiss() } } }
            .task {
                variants = await store.family(family.familyKey) ?? []
                EventLogger.shared.log(.productView, props: ["family": family.familyKey, "variants": String(variants?.count ?? 0)])
            }
        }.presentationDetents([.medium, .large])
    }
}
// Other sizes / options of a tracked product, compared by unit price.
struct OtherSizes: View {
    @EnvironmentObject var store: AlimiStore
    let product: Product
    @State private var variants: [VariantChoice] = []
    var body: some View {
        Group {
            if variants.count >= 2 {
                VStack(alignment: .leading, spacing: 10) {
                    Text(L("family.otherSizes")).font(.title3.bold())
                    VariantList(variants: variants)
                }
            }
        }.task(id: product.familyKey) {
            guard let key = product.familyKey else { return }
            variants = await store.family(key) ?? []
        }
    }
}
struct CatalogRow: View {
    let item: CatalogItem
    let busy: Bool
    let disabled: Bool
    let action: () -> Void
    var body: some View {
        HStack(spacing: 12) {
            RemoteImage(url: item.imageUrl, label: item.brandLabel).frame(width: 64, height: 64)
            VStack(alignment: .leading, spacing: 4) {
                Text(item.brandLabel).font(.caption).foregroundStyle(.secondary)
                Text(item.name).font(.subheadline).lineLimit(2)
                Text(usd(item.price)).font(.subheadline.bold())
            }
            Spacer()
            Button(action: action) {
                Image(systemName: busy ? "hourglass" : "heart").font(.title3).frame(width: 44, height: 44)
            }
            .disabled(disabled)
            .accessibilityLabel(L(busy ? "save.saving" : "save.action"))
        }
    }
}
struct ProductDetail: View {
    @EnvironmentObject var store: AlimiStore
    let product: Product
    @State private var showTarget = false
    @State private var days = 30
    @Environment(\.openURL) private var openURL
    private var series: [PricePoint] { PriceHistory.daily(product.history, days: days) }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header
                ProductInformationView(category: product.category, retailer: product.retailer, sku: product.sku, source: product.url)
                OtherSizes(product: product)
                retailerSection
                if let key = product.familyKey { ProductDiscussion(familyKey: key) }
                historySection
                alertSection
            }.padding(20)
        }.navigationTitle(L("detail.title")).navigationBarTitleDisplayMode(.inline)
            .onAppear { EventLogger.shared.log(.productView, productID: product.id) }
            .safeAreaInset(edge: .bottom) { bottomBar }
            .sheet(isPresented: $showTarget) { TargetSheet(product: product).environmentObject(store) }
    }
    private func buy() {
        EventLogger.shared.log(.merchantClick, productID: product.id, props: ["from": "detail_cta", "retailer": product.retailer])
        if let link = Purchase.buyURL((product.affiliateUrl ?? product.url).absoluteString) { openURL(link) }
    }
    private var header: some View {
        VStack(alignment: .leading, spacing: 22) {
            ProductArt(product: product).frame(height: 240)
            VStack(alignment: .leading, spacing: 8) {
                Text(L("detail.usPrice", ["retailer": product.retailer])).font(.caption).foregroundStyle(.secondary)
                Text(usd(product.price)).font(.largeTitle.bold())
                Text(L("detail.checked", ["checked": product.checkedAt.formatted(dayFormat), "changed": product.changedAt.formatted(dayFormat)])).font(.caption).foregroundStyle(.secondary)
                Text(product.name).font(.title2.bold())
                Text("\(product.brandLabel) · \(L10n.category(product.category))" + (product.size.isEmpty ? "" : " · \(product.size)")).font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }
    private var retailerSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L("detail.retailer")).font(.title3.bold())
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(product.retailer).font(.subheadline.bold())
                    Text(L("detail.feedShipping", ["v": product.delivery.map(usd) ?? L("unknown")]) + " · \(product.stockLabel)").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Text(usd(product.price)).font(.headline)
            }
            Button(L("detail.buy")) { buy() }.buttonStyle(.bordered)
            Text(L("detail.disclaimer")).font(.caption2).foregroundStyle(.secondary)
        }
    }
    private var historySection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack { Text(L("detail.priceHistory")).font(.headline); Spacer(); Text("USD").font(.caption).foregroundStyle(.secondary) }
            Picker(L("period"), selection: $days) { Text(L("days", ["n": 7])).tag(7); Text(L("days", ["n": 14])).tag(14); Text(L("days", ["n": 30])).tag(30) }.pickerStyle(.segmented)
            if Set(series.map(\.price)).count >= 2 {
                priceChart
            } else {
                VStack(spacing: 6) {
                    Text(PriceHistory.summary(product.history, current: product.price)).font(.subheadline.bold())
                    Text(L("chart.pendingHint")).font(.caption).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, minHeight: 120).background(Color.canvas, in: RoundedRectangle(cornerRadius: 12))
            }
            let prices = series.map(\.price)
            HStack {
                metric(L("period.low"), prices.min())
                Spacer()
                metric(L("period.avg"), prices.isEmpty ? nil : prices.reduce(0, +) / Double(prices.count))
                Spacer()
                metric(L("period.high"), prices.max())
            }
            Text(L("chart.note", ["date": product.history.first.map { $0.date.formatted(dayFormat) } ?? "—"])).font(.caption2).foregroundStyle(.secondary)
        }
    }
    private var priceChart: some View {
        Chart {
            ForEach(series) { point in
                LineMark(x: .value(L("date"), point.date, unit: .day), y: .value("USD", point.price)).foregroundStyle(Color.red)
            }
            if let target = store.saved.targets[product.id] {
                RuleMark(y: .value(L("target.rule"), target)).foregroundStyle(.secondary).lineStyle(StrokeStyle(dash: [4]))
            }
        }.frame(height: 190).accessibilityLabel(L("chart.a11y", ["name": product.name, "days": days]))
    }
    private var alertSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L("detail.alertsTitle")).font(.title3.bold())
            Text(store.status(product)).font(.headline).foregroundStyle(Color.alimi)
            if let target = store.saved.targets[product.id] {
                Text(L("target.current", ["v": usd(target)])).font(.subheadline)
            }
            HStack {
                Button { showTarget = true } label: {
                    Label(L(store.saved.targets[product.id] == nil ? "target.secondary" : "target.set"), systemImage: "bell")
                }.buttonStyle(.bordered).accessibilityIdentifier("target-button")
                if store.saved.targets[product.id] != nil {
                    Button(L("target.remove"), role: .destructive) { store.saved.targets.removeValue(forKey: product.id) }.buttonStyle(.bordered)
                }
            }
            Text(L("target.deviceNote")).font(.caption).foregroundStyle(.secondary)
        }
    }
    private var bottomBar: some View {
        HStack(spacing: 12) {
            Button { store.toggle(product.id) } label: {
                Label(L("save.short"), systemImage: store.saved.favorites.contains(product.id) ? "heart.fill" : "heart").font(.subheadline)
                    .frame(minHeight: 48)
            }.accessibilityIdentifier("detail-save")
            Button { buy() } label: {
                Text(L("buy.at", ["retailer": product.retailer])).font(.headline).frame(maxWidth: .infinity).padding(.vertical, 14)
            }.buttonStyle(.borderedProminent).accessibilityIdentifier("detail-buy")
        }.padding(.horizontal, 20).padding(.vertical, 10).background(.bar)
    }
    private func metric(_ title: String, _ value: Double?) -> some View {
        VStack(alignment: .leading, spacing: 6) { Text(title).font(.caption).foregroundStyle(.secondary); Text(value.map(usd) ?? "—").font(.subheadline.bold()) }
    }
}
struct TargetSheet: View {
    @EnvironmentObject var store: AlimiStore
    @Environment(\.dismiss) private var dismiss
    let product: Product
    @State private var text = ""
    @State private var error = false
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(product.name)
                    Text(L("now", ["v": usd(product.price)])).foregroundStyle(.secondary)
                    TextField(L("target.field"), text: $text).keyboardType(.decimalPad)
                    if error { Text(L("target.invalid")).foregroundStyle(.red) }
                } footer: { Text(L("target.footer")) }
                Button(L("dialog.save")) {
                    guard let value = PriceRule.valid(text) else { error = true; return }
                    store.saved.targets[product.id] = value
                    EventLogger.shared.log(.targetPriceSet, productID: product.id)
                    dismiss()
                }
            }.navigationTitle(L("target.sheetTitle")).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button(L("cancel")) { dismiss() } } }
                .onAppear { text = store.saved.targets[product.id].map { String(format: "%.2f", $0) } ?? "" }
        }.presentationDetents([.medium, .large])
    }
}
struct AlertsView: View {
    @EnvironmentObject var store: AlimiStore
    var body: some View {
        NavigationStack {
            List {
                SourceBanner().listRowSeparator(.hidden)
                let products = store.products.filter { store.saved.targets[$0.id] != nil }
                if products.isEmpty {
                    ContentUnavailableView(L("alerts.empty"), systemImage: "bell", description: Text(L("alerts.emptyHint")))
                }
                ForEach(products) { product in
                    NavigationLink { ProductDetail(product: product) } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(product.name).font(.headline)
                            Text(store.status(product)).foregroundStyle(Color.alimi)
                            Text(L("alerts.row", ["now": usd(product.price), "target": usd(store.saved.targets[product.id] ?? 0)])).font(.caption).foregroundStyle(.secondary)
                        }.padding(.vertical, 8)
                    }
                }
            }.listStyle(.plain).navigationTitle(L("alerts.title")).refreshable { await store.refresh() }
        }
    }
}
