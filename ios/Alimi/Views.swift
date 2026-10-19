import SwiftUI
import UIKit

// Short action labels stay together; their parent must reserve their intrinsic width.
struct InlineActionLabel: View {
    let title: String
    let icon: String
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
            Text(title).lineLimit(1)
        }.fixedSize(horizontal: true, vertical: false)
    }
}

struct RootView: View {
    @EnvironmentObject var store: AlimiStore
    @State private var tab = MainTab.chat
    @State private var onboarding: OnboardingStep? = Interests.load()?.done == true || ProcessInfo.processInfo.arguments.contains("-skipOnboarding") ? nil : .splash
    @State private var openRoom: ChatRoom?
    @State private var searching = false
    @State private var showingAlerts = false
    @State private var activitySection = "saved"
    @StateObject private var revisit = RevisitModel()
    @AppStorage("alimi.lang") private var lang = ""
    var body: some View {
        TabView(selection: $tab) {
            CommunityHome(openRoom: $openRoom, onEditInterests: { onboarding = .choose }, onSearch: { searching = true }, onMyRooms: { activitySection = "rooms"; tab = .saved }, onAlerts: { showingAlerts = true }, unreadAlerts: revisit.unread)
                .tabItem { Label(L("nav.community"), systemImage: "house") }.tag(MainTab.chat)
            BrowseView(onCommunity: { tab = .chat }, onSearch: { searching = true })
                .tabItem { Label(L("nav.explore"), systemImage: "magnifyingglass") }.tag(MainTab.home)
            SavedView(section: $activitySection, editInterests: { onboarding = .choose }, onSearch: { searching = true }, onAlerts: { showingAlerts = true }, unreadAlerts: revisit.unread)
                .tabItem { Label(L("nav.activity"), systemImage: "person") }.tag(MainTab.saved)
        }.id(lang)
        .sheet(isPresented: $searching) { SearchView().environmentObject(store) }
        .sheet(isPresented: $showingAlerts, onDismiss: { Task { await revisit.load(store: store) } }) { NotificationsView(model: revisit).environmentObject(store) }
        .toolbar(onboarding == nil ? .automatic : .hidden, for: .tabBar)
        // First-visit flow drawn over the tabs (not a modal cover), so closing it and opening the picked room happen
        // in one state change and the community stack is already on screen to receive the room.
        .overlay {
            if let step = onboarding {
                OnboardingFlow(step: step) { room in tab = .chat; onboarding = nil; openRoom = room }
                    .environmentObject(store).transition(.opacity).zIndex(1)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: onboarding == nil)
        .task { await revisit.load(store: store) }
        .task { await store.refresh(); await AuthSession.shared.restore(); EventLogger.shared.log(.homeView, props: ["source": store.source == .live ? "live" : "snapshot"]) }
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
    var onCommunity: () -> Void = {}
    var onSearch: () -> Void = {}
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
                        Button(L("community.homeCTA"), action: onCommunity).buttonStyle(.borderedProminent)
                    }.padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading)
                    if brandsLoading { LoadingCompanion() }
                    else if brandsFailed {
                        VStack(alignment: .leading) {
                            Text(L("brands.title")).font(.title3.bold())
                            Text(L("loadFailed")).font(.caption)
                            Button(L("retry")) { Task { await loadBrands() } }
                        }
                    } else if !brands.isEmpty { BrandStrip(brands: brands) }
                    CategoryTabs(categories: store.categories, selection: $category)
                    HStack {
                        Text(L("section.products")).font(.headline)
                        Spacer()
                        Text(L("count", ["n": results.count])).font(.subheadline).foregroundStyle(.secondary)
                    }
                    if results.isEmpty {
                        Text(L("empty.category"))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 16)], spacing: 24) {
                        ForEach(results) { product in TrackedCard(product: product) }
                    }
                    browseSection
                }.padding(20)
            }.navigationTitle(L("nav.explore"))
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(action: onSearch) { Image(systemName: "magnifyingglass").frame(width: 44, height: 44) }.accessibilityLabel(L("search.title")).accessibilityIdentifier("explore-search") } }
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
// Two rows of brand badges with space between logos and labels. Tapping one opens the brand page.
struct BrandStrip: View {
    let brands: [CatalogBrand]
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L("brands.title")).font(.title3.bold())
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHGrid(rows: [GridItem(.fixed(96), spacing: 20), GridItem(.fixed(96))], spacing: 12) {
                    ForEach(BrandStrip.twoRowOrder(brands)) { b in
                        NavigationLink(value: b) { BrandBadge(brand: b) }
                            .buttonStyle(.plain).frame(width: 72).accessibilityIdentifier("brand-\(b.brand)")
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

// An alpha channel does not always imply transparent pixels. Check the actual
// decoded pixels so opaque Stylevana assets are never mistakenly recolored.
private extension UIImage {
    var hasTransparency: Bool {
        guard let cgImage,
              cgImage.dataProvider != nil else { return false }
        let alpha = cgImage.alphaInfo
        guard alpha == .premultipliedFirst || alpha == .premultipliedLast ||
              alpha == .first || alpha == .last else { return false }
        // Color-space and byte order vary between files; decode into RGBA8.
        let width = cgImage.width, height = cgImage.height
        guard width > 0, height > 0 else { return false }
        let sampleWidth = min(width, 64), sampleHeight = min(height, 64)
        let bytesPerRow = sampleWidth * 4
        var bytes = [UInt8](repeating: 255, count: sampleHeight * bytesPerRow)
        guard let context = CGContext(data: &bytes, width: sampleWidth, height: sampleHeight,
            bitsPerComponent: 8, bytesPerRow: bytesPerRow,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
        context.interpolationQuality = .low
        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: sampleWidth, height: sampleHeight))
        return stride(from: 3, to: bytes.count, by: 4).contains { bytes[$0] < 250 }
    }
}

struct BrandBadge: View {
    let brand: CatalogBrand
    var size: CGFloat = 60
    var showLabel = true
    @State private var logoImage: UIImage?
    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle().fill(Color(rgb: brand.color))
                Text(brand.initials).font(.system(size: size * 0.3, weight: .heavy)).foregroundStyle(.white)
                if let logoImage {
                    Image(uiImage: logoImage)
                        .resizable()
                        .scaledToFit()
                        // Transparent logos show the brand's assigned surface color.
                        // Opaque images retain a white backing rather than a false recolor.
                        .background(logoImage.hasTransparency ? Color.clear : Color.white)
                        .clipShape(Circle())
                }
            }
            .frame(width: size, height: size)
            .overlay(Circle().stroke(Color(.separator), lineWidth: 0.5))
            .task(id: brand.logoUrl) {
                if let bundled = UIImage(named: brand.bundledLogoName) { logoImage = bundled; return }
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
            if browseLoading { LoadingCompanion(compact: true) }
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
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    FlowLayout(spacing: 6) {
                        Text(v.item.variantLabel.isEmpty ? L("family.default") : v.item.variantLabel).font(.subheadline.bold())
                        if v.bestValue { Text(L("badge.bestValue")).font(.caption2.bold()).foregroundStyle(.red) }
                    }
                    if let unit = v.item.unitPrice {
                        Text(L("unit.price", ["v": usd(unit), "u": CatalogItem.unitName(v.item.unit)])).font(.caption).foregroundStyle(.secondary)
                    }
                }
                HStack(spacing: 10) {
                    Text(usd(v.item.price)).font(.headline).lineLimit(1).minimumScaleFactor(0.85)
                    Spacer(minLength: 8)
                    if let link = Purchase.buyURL(v.item.affiliateUrl ?? v.item.url, ref: ref) {
                        Button(L("variant.buy")) {
                            EventLogger.shared.log(.merchantClick, props: ["from": ref ?? "options", "sku": v.item.sku])
                            openURL(link)
                        }.buttonStyle(.borderedProminent).controlSize(.regular).fixedSize(horizontal: true, vertical: false).accessibilityIdentifier("variant-buy-\(v.item.sku)")
                    }
                    Button {
                        if let id = trackedID { store.toggle(id) }
                        else { busy = v.item.id; Task { _ = await store.saveCatalogItem(v.item); busy = nil } }
                    } label: {
                        let saved = trackedID.map { store.saved.favorites.contains($0) } ?? false
                        Image(systemName: busy == v.item.id ? "hourglass" : saved ? "heart.fill" : "heart").font(.title3).frame(width: 44, height: 44)
                    }.disabled(busy != nil).accessibilityLabel(L("save.action"))
                }
            }
            Divider()
        }
    }
}
struct FamilySheet: View {
    @EnvironmentObject var store: AlimiStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    let family: ProductFamily
    var ref: String? = nil
    // Set when opened from a live room: 대화에 첨부 puts the chosen option into the composer.
    var attach: ((CatalogItem) -> Void)? = nil
    @State private var variants: [VariantChoice]?
    @State private var selected = 0
    @State private var busy = false
    // Product page of journey 2: photo of each option, name, price, real facts, then every option with its seller.
    private var photos: [URL] {
        var seen = Set<URL>(), out: [URL] = []
        for u in (variants ?? []).compactMap(\.item.imageUrl) + [family.imageUrl].compactMap({ $0 }) where !seen.contains(u) { seen.insert(u); out.append(u) }
        return out
    }
    // The option shown in the photo; options without a photo of their own fall back to the cheapest.
    private var current: CatalogItem? {
        let list = variants ?? []
        let url = photos.indices.contains(selected) ? photos[selected] : nil
        return list.first { $0.item.imageUrl != nil && $0.item.imageUrl == url }?.item ?? list.first?.item
    }
    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    hero
                    if photos.count > 1 { thumbs }
                    info.padding(.horizontal, 20).padding(.top, 18)
                    facts.padding(.horizontal, 20).padding(.top, 20)
                    VStack(alignment: .leading, spacing: 8) {
                        Text(L("family.buyHint")).font(.caption).foregroundStyle(.secondary)
                        if let variants { VariantList(variants: variants, ref: ref) } else { LoadingCompanion(compact: true) }
                    }.padding(.horizontal, 20).padding(.top, 20)
                }.padding(.bottom, 20)
            }
            cta.padding(.horizontal, 20).padding(.vertical, 10)
        }
        .background(Color.white)
        .task {
            RecentViews.add(family)
            variants = await store.family(family.familyKey) ?? []
            EventLogger.shared.log(.productView, props: ["family": family.familyKey, "variants": String(variants?.count ?? 0)])
        }
        .presentationDetents([.large])
    }
    private var hero: some View {
        ZStack(alignment: .top) {
            Color(rgb: 0xF7E9EA)
            TabView(selection: $selected) {
                ForEach(Array(photos.enumerated()), id: \.offset) { i, url in
                    RemoteImage(url: url, label: family.brandLabel).padding(28).tag(i)
                }
            }.tabViewStyle(.page(indexDisplayMode: .never))
            HStack {
                circleButton("chevron.left", label: L("close")) { dismiss() }
                Spacer()
                ShareLink(item: ShareLinks.product(family.familyKey), subject: Text(family.baseName)) {
                    Image(systemName: "square.and.arrow.up").font(.system(size: 19, weight: .medium)).foregroundStyle(Color.sbNavy)
                        .frame(width: 50, height: 50).background(Color.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 16))
                }.accessibilityLabel(L("share.product")).accessibilityIdentifier("product-share")
            }.padding(16)
            if photos.count > 1 {
                VStack { Spacer(); HStack { Spacer()
                    Text("\(selected + 1)/\(photos.count)").font(.system(size: 14, weight: .semibold)).foregroundStyle(.white)
                        .padding(.horizontal, 12).padding(.vertical, 6).background(Color.black.opacity(0.45), in: Capsule())
                } }.padding(16)
            }
        }.frame(height: 380)
    }
    private var thumbs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(Array(photos.enumerated()), id: \.offset) { i, url in
                    Button { withAnimation { selected = i } } label: {
                        RemoteThumb(url: url).frame(width: 68, height: 68).clipShape(RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(i == selected ? Color.sbBlue : Color(rgb: 0xE6EAF1), lineWidth: i == selected ? 2 : 1))
                    }.buttonStyle(.plain)
                }
            }.padding(.horizontal, 20)
        }.padding(.top, 14)
    }
    private var info: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                Text(family.brandLabel).font(.system(size: 17)).foregroundStyle(Color.sbGray)
                Spacer()
                Button { Task { await save() } } label: {
                    Image(systemName: isSaved ? "heart.fill" : "heart").font(.system(size: 26)).foregroundStyle(Color(rgb: 0xF0476A)).frame(width: 44, height: 44)
                }.buttonStyle(.plain).disabled(busy).accessibilityLabel(L("save.action")).accessibilityIdentifier("product-save")
            }
            Text(family.baseName).font(.system(size: 26, weight: .heavy)).foregroundStyle(Color.sbNavy).fixedSize(horizontal: false, vertical: true)
            Text(usd(current?.price ?? Double(family.minPriceMinor) / 100)).font(.system(size: 26, weight: .heavy)).foregroundStyle(Color.sbNavy).padding(.top, 6)
        }
    }
    // Facts the catalog actually knows (no ratings, delivery or gift claims).
    private var facts: some View {
        let list = variants ?? []
        let sellers = Set(list.map(\.item.retailer)).count
        let unit = list.compactMap { v in v.item.unitPrice.map { (v.item, $0) } }.min { $0.1 < $1.1 }
        let items: [(String, String, String)] = [
            ("square.stack.3d.up", L("product.fact.options"), L("product.fact.count", ["n": max(list.count, family.variants)])),
            ("shippingbox", L("product.fact.sellers"), L("product.fact.places", ["n": max(sellers, 1)])),
            ("scalemass", L("product.fact.unit"), unit.map { usd($0.1) + "/" + CatalogItem.unitName($0.0.unit) } ?? "—"),
            ("sparkles", L("product.fact.category"), family.category.map(L10n.category) ?? "—"),
        ]
        return LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: 12)], spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, f in
                VStack(spacing: 8) {
                    Image(systemName: f.0).font(.system(size: 26, weight: .light)).foregroundStyle(Color.sbNavy)
                    Text(f.1).font(.system(size: 14)).foregroundStyle(Color(rgb: 0x5B6475)).multilineTextAlignment(.center)
                    Text(f.2).font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.sbNavy).lineLimit(1).minimumScaleFactor(0.7)
                }.frame(maxWidth: .infinity).padding(.vertical, 16)
            }
        }
        .background(Color.white, in: RoundedRectangle(cornerRadius: 18)).overlay(RoundedRectangle(cornerRadius: 18).stroke(Color(rgb: 0xE6EAF1)))
        .accessibilityElement(children: .combine).accessibilityIdentifier("product-facts")
    }
    @ViewBuilder private var cta: some View {
        if let attach, let item = current {
            Button { attach(item); dismiss() } label: {
                Label(L("family.attach"), systemImage: "ellipsis.bubble").font(.system(size: 19, weight: .bold)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 58).background(Color.sbBlue, in: RoundedRectangle(cornerRadius: 16))
            }.buttonStyle(.plain).accessibilityIdentifier("family-attach")
        } else if let item = current, let link = Purchase.buyURL(item.affiliateUrl ?? item.url, ref: ref) {
            Button {
                EventLogger.shared.log(.merchantClick, props: ["from": ref ?? "product", "sku": item.sku])
                openURL(link)
            } label: {
                Label(L("product.buy", ["seller": item.retailer]), systemImage: "bag").font(.system(size: 19, weight: .bold)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 58).background(Color.sbBlue, in: RoundedRectangle(cornerRadius: 16))
            }.buttonStyle(.plain).accessibilityIdentifier("product-buy")
        }
    }
    private var isSaved: Bool {
        guard let sku = current?.sku, let id = store.products.first(where: { $0.sku == sku })?.id else { return false }
        return store.saved.favorites.contains(id)
    }
    private func save() async {
        guard let item = current else { return }
        if let id = store.products.first(where: { $0.sku == item.sku })?.id { store.toggle(id); return }
        busy = true; _ = await store.saveCatalogItem(item); busy = false
    }
    private func circleButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 19, weight: .medium)).foregroundStyle(Color.sbNavy)
                .frame(width: 50, height: 50).background(Color.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 16))
        }.buttonStyle(.plain).accessibilityLabel(label)
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
    @Environment(\.openURL) private var openURL
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header
                ProductInformationView(category: product.category, retailer: product.retailer, sku: product.sku, source: product.url)
                OtherSizes(product: product)
                retailerSection
                if let key = product.familyKey { ProductDiscussion(familyKey: key) }
            }.padding(20)
        }.navigationTitle(L("detail.title")).navigationBarTitleDisplayMode(.inline)
            .onAppear { EventLogger.shared.log(.productView, productID: product.id) }
            .safeAreaInset(edge: .bottom) { bottomBar }
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
                Text(product.id.hasPrefix("catalog|") ? L("catalog.savedSnapshot") : L("detail.checked", ["checked": product.checkedAt.formatted(dayFormat)])).font(.caption).foregroundStyle(.secondary)
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
}
