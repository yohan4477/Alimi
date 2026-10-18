import SwiftUI
import UIKit
import Charts

struct RootView: View {
    @EnvironmentObject var store: AlimiStore
    var body: some View {
        TabView {
            BrowseView().tabItem { Label(L("tab.home"), systemImage: "house.fill") }
            BrowseView(favoritesOnly: true).tabItem { Label(L("favorites"), systemImage: "heart.fill") }
            AlertsView().tabItem { Label(L("alerts.title"), systemImage: "bell.fill") }
            ChatTab().tabItem { Label(L("nav.chat"), systemImage: "bubble.left.and.bubble.right.fill") }
        }.task { await store.refresh(); EventLogger.shared.log(.homeView, props: ["source": store.source == .live ? "live" : "snapshot"]) }
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
    var favoritesOnly = false
    @State private var query = ""
    @State private var category = "전체"
    @State private var catalog: [CatalogItem]? = []
    @State private var browse: [ProductFamily] = []
    @State private var openFamily: ProductFamily?
    @State private var browseDone = false
    @State private var browseLoading = false
    @State private var tracking: String?
    @State private var brand: String?
    @State private var brands: [CatalogBrand] = []
    private var results: [Product] { store.search(query, category: category, favoritesOnly: favoritesOnly) }
    private var searching: Bool { CatalogItem.query(query).count >= 2 }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    SourceBanner()
                    if !favoritesOnly {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(L("hero.line1")).font(.system(size: 28, weight: .bold))
                            Text(L("hero.line2")).font(.system(size: 28, weight: .bold))
                            Text(L("hero.subApp")).font(.subheadline).foregroundStyle(.secondary)
                        }.padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if !favoritesOnly && !brands.isEmpty { BrandStrip(brands: brands, selection: $brand) }
                    CategoryTabs(categories: store.categories, selection: $category)
                    HStack {
                        Text(L(favoritesOnly ? "section.saved" : "section.watching")).font(.headline)
                        Spacer()
                        Text(L("count", ["n": results.count])).font(.subheadline).foregroundStyle(.secondary)
                    }
                    if results.isEmpty {
                        Text(L(favoritesOnly ? "empty.saved" : "empty.watchingCategory"))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 16)], spacing: 24) {
                        ForEach(results) { product in TrackedCard(product: product) }
                    }
                    if !favoritesOnly {
                        if searching { catalogSection } else { browseSection }
                    }
                }.padding(20)
            }.navigationTitle(favoritesOnly ? L("favorites") : "Alimi")
                .task(id: query) {
                    guard !favoritesOnly, searching else { catalog = []; return }
                    try? await Task.sleep(for: .milliseconds(400))
                    guard !Task.isCancelled else { return }
                    catalog = await store.searchCatalog(query)
                }
                .task(id: category + "|" + (brand ?? "")) {
                    guard !favoritesOnly else { return }
                    browse = []; browseDone = false
                    await loadMore()
                }
                .task { if !favoritesOnly && brands.isEmpty { brands = await store.brands() } }
                .navigationBarTitleDisplayMode(.inline)
                .searchable(text: $query, prompt: L("search.prompt"))
                .onSubmit(of: .search) {
                    let q = query.trimmingCharacters(in: .whitespaces)
                    if !q.isEmpty { EventLogger.shared.log(.search, props: ["length": String(q.count), "results": String(results.count)]) }
                }
                .refreshable { await store.refresh() }
                .sheet(item: $openFamily) { family in FamilySheet(family: family).environmentObject(store) }
        }
    }
}
// Round brand badges, five per row, like a delivery app's popular-brand grid. Tap again to clear.
struct BrandStrip: View {
    let brands: [CatalogBrand]
    @Binding var selection: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L("brands.title")).font(.title3.bold())
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 5), spacing: 14) {
                ForEach(brands) { b in
                    Button { selection = selection == b.brand ? nil : b.brand } label: { BrandBadge(brand: b, selected: selection == b.brand) }
                        .buttonStyle(.plain).accessibilityIdentifier("brand-\(b.brand)")
                        .accessibilityAddTraits(selection == b.brand ? .isSelected : [])
                }
            }
        }
    }
}
struct BrandBadge: View {
    let brand: CatalogBrand
    let selected: Bool
    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                Circle().fill(Color(rgb: brand.color))
                Text(brand.initials).font(.system(size: 18, weight: .heavy)).foregroundStyle(.white)
                if let url = brand.logoUrl { RemoteImage(url: url, label: brand.label).clipShape(Circle()) }
            }
            .frame(width: 60, height: 60)
            .overlay(Circle().stroke(selected ? Color.primary : .clear, lineWidth: 2))
            Text(brand.label).font(.caption2).lineLimit(1)
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
                    Text(PriceHistory.summary(product.history, current: product.price)).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }.foregroundStyle(.primary)
            }.buttonStyle(.plain).accessibilityIdentifier("product-\(product.id)").accessibilityValue(photoLoaded ? "photo-loaded" : "photo-missing")
            Button { store.toggle(product.id) } label: {
                Label(L(saved ? "favorite.saved" : "favorite.add"), systemImage: saved ? "heart.fill" : "heart").font(.caption).frame(minHeight: 44)
            }.accessibilityIdentifier("favorite-\(product.id)")
        }
    }
}
extension BrowseView {
    // Whole-catalog search results: the heart saves the item and moves that exact SKU into the tracking layer.
    var catalogSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L("section.more")).font(.headline)
            Text(L("section.moreHint")).font(.caption).foregroundStyle(.secondary)
            catalogRows
        }.padding(.top, 12)
    }
    @ViewBuilder private var catalogRows: some View {
        if let items = catalog {
            if items.isEmpty {
                Text(L("empty.catalogSearch")).font(.caption).foregroundStyle(.secondary)
            }
            ForEach(items) { item in
                CatalogRow(item: item, busy: tracking == item.id, disabled: tracking != nil) { start(item) }
            }
        } else {
            Text(L("catalogFailed")).font(.caption).foregroundStyle(.secondary)
        }
    }
    // Home browsing: one row per product family (sizes / shades grouped), one page at a time.
    var browseSection: some View {
        LazyVStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(browseTitle).font(.headline)
                Spacer()
                if brand != nil { Button(L("brands.clear")) { brand = nil }.font(.caption).buttonStyle(.bordered) }
            }
            Text(L("family.pick")).font(.caption).foregroundStyle(.secondary)
            ForEach(browse) { family in
                FamilyRow(family: family) { openFamily = family }
                    .onAppear { if family.id == browse.last?.id { Task { await loadMore() } } }
            }
            if browseLoading { ProgressView().frame(maxWidth: .infinity) }
            else if browseDone && browse.isEmpty { Text(L("empty.products")).font(.caption).foregroundStyle(.secondary) }
        }.padding(.top, 12)
    }
    private var browseTitle: String {
        guard let brand else { return L("section.all") }
        return L("brands.products", ["brand": brands.first { $0.brand == brand }?.label ?? brand])
    }
    func loadMore() async {
        guard !browseLoading, !browseDone else { return }
        browseLoading = true
        let requested = category, requestedBrand = brand
        let page = await store.familiesPage(category: requested, offset: browse.count, brand: requestedBrand)
        browseLoading = false
        guard requested == category, requestedBrand == brand else { return }
        guard let page else { browseDone = true; return }
        browse.append(contentsOf: page)
        if page.count < 24 { browseDone = true }
    }
    private func start(_ item: CatalogItem) {
        tracking = item.id
        Task {
            if await store.startTracking(item) { catalog?.removeAll { $0.id == item.id } }
            tracking = nil
        }
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
    @State private var busy: String?
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
    @State private var variants: [VariantChoice]?
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    RemoteImage(url: family.imageUrl, label: family.brandLabel).frame(height: 180)
                    Text(family.brandLabel).font(.caption).foregroundStyle(.secondary)
                    Text(family.baseName).font(.title3.bold())
                    Text(L("family.pick")).font(.caption).foregroundStyle(.secondary)
                    if let variants { VariantList(variants: variants) } else { ProgressView().frame(maxWidth: .infinity) }
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
                ProductArt(product: product).frame(height: 240)
                VStack(alignment: .leading, spacing: 8) {
                    Text(L("detail.usPrice", ["retailer": product.retailer])).font(.caption).foregroundStyle(.secondary)
                    Text(usd(product.price)).font(.largeTitle.bold())
                    Text(L("detail.checked", ["checked": product.checkedAt.formatted(dayFormat), "changed": product.changedAt.formatted(dayFormat)])).font(.caption).foregroundStyle(.secondary)
                    Text(product.name).font(.title2.bold())
                    Text("\(product.brandLabel) · \(L10n.category(product.category))" + (product.size.isEmpty ? "" : " · \(product.size)")).font(.subheadline).foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 16) {
                    HStack { Text(L("detail.priceHistory")).font(.headline); Spacer(); Text("USD").font(.caption).foregroundStyle(.secondary) }
                    Picker(L("period"), selection: $days) { Text(L("days", ["n": 7])).tag(7); Text(L("days", ["n": 14])).tag(14); Text(L("days", ["n": 30])).tag(30) }.pickerStyle(.segmented)
                    if Set(series.map(\.price)).count >= 2 {
                        Chart {
                            ForEach(series) { point in
                                LineMark(x: .value(L("date"), point.date, unit: .day), y: .value("USD", point.price)).foregroundStyle(Color.red)
                            }
                            if let target = store.saved.targets[product.id] {
                                RuleMark(y: .value(L("target.rule"), target)).foregroundStyle(.secondary).lineStyle(StrokeStyle(dash: [4]))
                            }
                        }.frame(height: 190).accessibilityLabel(L("chart.a11y", ["name": product.name, "days": days]))
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
                OtherSizes(product: product)
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
                    Button(L("detail.buy")) {
                        EventLogger.shared.log(.merchantClick, productID: product.id, props: ["retailer": product.retailer])
                        openURL(product.buyURL)
                    }.buttonStyle(.bordered)
                    Text(L("detail.disclaimer")).font(.caption2).foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 10) {
                    Text(store.status(product)).font(.headline).foregroundStyle(Color.alimi)
                    if let target = store.saved.targets[product.id] {
                        Text(L("target.current", ["v": usd(target)])).font(.subheadline)
                        Button(L("target.remove"), role: .destructive) { store.saved.targets.removeValue(forKey: product.id) }
                    }
                    Text(L("target.deviceNote")).font(.caption).foregroundStyle(.secondary)
                }
            }.padding(20)
        }.navigationTitle(L("detail.title")).navigationBarTitleDisplayMode(.inline)
            .onAppear { EventLogger.shared.log(.productView, productID: product.id) }
            .safeAreaInset(edge: .bottom) {
                HStack(spacing: 16) {
                    Button { store.toggle(product.id) } label: {
                        Image(systemName: store.saved.favorites.contains(product.id) ? "heart.fill" : "heart").font(.title2).frame(width: 50, height: 48)
                    }.accessibilityLabel(L("favorite.toggle"))
                    Button { showTarget = true } label: {
                        Label(L("target.set"), systemImage: "bell").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 14)
                    }.buttonStyle(.borderedProminent)
                }.padding(.horizontal, 20).padding(.vertical, 10).background(.bar)
            }
            .sheet(isPresented: $showTarget) { TargetSheet(product: product).environmentObject(store) }
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
