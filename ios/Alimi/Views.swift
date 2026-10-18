import SwiftUI
import UIKit
import Charts

struct RootView: View {
    @EnvironmentObject var store: AlimiStore
    var body: some View {
        TabView {
            BrowseView().tabItem { Label("홈", systemImage: "house.fill") }
            BrowseView(favoritesOnly: true).tabItem { Label("관심 상품", systemImage: "heart.fill") }
            AlertsView().tabItem { Label("알림", systemImage: "bell.fill") }
        }.task { await store.refresh(); EventLogger.shared.log(.homeView, props: ["source": store.source == .live ? "live" : "snapshot"]) }
    }
}
private let dayFormat: Date.FormatStyle = .dateTime.month().day().locale(Locale(identifier: "ko_KR"))

struct SourceBanner: View {
    @EnvironmentObject var store: AlimiStore
    private var text: String {
        switch store.source {
        case .live:
            let latest = store.products.map(\.checkedAt).max()
            return "Stylevana US 공식 가격 · 한국 브랜드" + (latest.map { " · \($0.formatted(dayFormat)) 확인" } ?? "")
        case .snapshot(let at):
            return "오프라인 데이터" + (ISODate.parse(at).map { " · \($0.formatted(dayFormat)) 기준" } ?? "")
        case .none:
            return "가격 데이터를 불러오지 못했어요"
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
                    if failed || url == nil { Text("사진 없음").font(.caption2) } else { ProgressView() }
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
    @State private var browse: [CatalogItem] = []
    @State private var browseDone = false
    @State private var browseLoading = false
    @State private var tracking: String?
    private var results: [Product] { store.search(query, category: category, favoritesOnly: favoritesOnly) }
    private var searching: Bool { CatalogItem.query(query).count >= 2 }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    SourceBanner()
                    if !favoritesOnly {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("매일 쓰는 뷰티,").font(.system(size: 28, weight: .bold))
                            Text("가격은 가볍게.").font(.system(size: 28, weight: .bold))
                            Text("눈여겨본 K-뷰티, 지금은 어떤 가격일까요?").font(.subheadline).foregroundStyle(.secondary)
                        }.padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    CategoryTabs(categories: store.categories, selection: $category)
                    HStack {
                        Text(favoritesOnly ? "내 관심 상품" : "가격을 지켜보는 상품").font(.headline)
                        Spacer()
                        Text("\(results.count)개").font(.subheadline).foregroundStyle(.secondary)
                    }
                    if results.isEmpty {
                        Text(favoritesOnly ? "관심 상품이 없어요. 하트를 눌러 추가해 보세요." : "이 카테고리에서 지켜보는 상품이 아직 없어요. 아래에서 하트를 눌러 보세요.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 16)], spacing: 24) {
                        ForEach(results) { product in TrackedCard(product: product) }
                    }
                    if !favoritesOnly {
                        if searching { catalogSection } else { browseSection }
                    }
                }.padding(20)
            }.navigationTitle(favoritesOnly ? "관심 상품" : "Alimi")
                .task(id: query) {
                    guard !favoritesOnly, searching else { catalog = []; return }
                    try? await Task.sleep(for: .milliseconds(400))
                    guard !Task.isCancelled else { return }
                    catalog = await store.searchCatalog(query)
                }
                .task(id: category) {
                    guard !favoritesOnly else { return }
                    browse = []; browseDone = false
                    await loadMore()
                }
                .navigationBarTitleDisplayMode(.inline)
                .searchable(text: $query, prompt: "브랜드 또는 상품명 검색")
                .onSubmit(of: .search) {
                    let q = query.trimmingCharacters(in: .whitespaces)
                    if !q.isEmpty { EventLogger.shared.log(.search, props: ["length": String(q.count), "results": String(results.count)]) }
                }
                .refreshable { await store.refresh() }
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
                        Text(item).font(.subheadline.weight(.medium)).padding(.horizontal, 16).padding(.vertical, 9)
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
            }.buttonStyle(.plain).accessibilityIdentifier("product-\(product.id)").accessibilityValue(photoLoaded ? "사진 있음" : "사진 없음")
            Button { store.toggle(product.id) } label: {
                Label(saved ? "관심 등록됨" : "관심 등록", systemImage: saved ? "heart.fill" : "heart").font(.caption).frame(minHeight: 44)
            }.accessibilityIdentifier("favorite-\(product.id)")
        }
    }
}
extension BrowseView {
    // Whole-catalog search results: the heart saves the item and moves that exact SKU into the tracking layer.
    var catalogSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("더 많은 상품").font(.headline)
            Text("하트를 누르면 관심에 담고 오늘부터 가격을 지켜봐요").font(.caption).foregroundStyle(.secondary)
            catalogRows
        }.padding(.top, 12)
    }
    @ViewBuilder private var catalogRows: some View {
        if let items = catalog {
            if items.isEmpty {
                Text("전체 카탈로그에서도 찾지 못했어요.").font(.caption).foregroundStyle(.secondary)
            }
            ForEach(items) { item in
                CatalogRow(item: item, busy: tracking == item.id, disabled: tracking != nil) { start(item) }
            }
        } else {
            Text("카탈로그를 불러오지 못했어요.").font(.caption).foregroundStyle(.secondary)
        }
    }
    // Home browsing of the Korean-brand catalog, one page at a time as the user scrolls.
    var browseSection: some View {
        let tracked = Set(store.products.map(\.sku))
        return LazyVStack(alignment: .leading, spacing: 12) {
            Text("전체 상품").font(.headline)
            Text("한국 브랜드 · 하트를 누르면 관심에 담고 오늘부터 가격을 지켜봐요").font(.caption).foregroundStyle(.secondary)
            ForEach(browse.filter { !tracked.contains($0.sku) }) { item in
                CatalogRow(item: item, busy: tracking == item.id, disabled: tracking != nil) { start(item) }
                    .onAppear { if item.id == browse.last?.id { Task { await loadMore() } } }
            }
            if browseLoading { ProgressView().frame(maxWidth: .infinity) }
            else if browseDone && browse.isEmpty { Text("상품이 없어요.").font(.caption).foregroundStyle(.secondary) }
        }.padding(.top, 12)
    }
    func loadMore() async {
        guard !browseLoading, !browseDone else { return }
        browseLoading = true
        let requested = category
        let page = await store.catalogPage(category: requested, offset: browse.count)
        browseLoading = false
        guard requested == category else { return }
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
            .accessibilityLabel(busy ? "담는 중" : "관심에 담기")
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
                    Text("\(product.retailer) · 미국 상품가").font(.caption).foregroundStyle(.secondary)
                    Text(usd(product.price)).font(.largeTitle.bold())
                    Text("\(product.checkedAt.formatted(dayFormat)) 확인 · 가격 변경 \(product.changedAt.formatted(dayFormat))").font(.caption).foregroundStyle(.secondary)
                    Text(product.name).font(.title2.bold())
                    Text("\(product.brandLabel) · \(product.category)" + (product.size.isEmpty ? "" : " · \(product.size)")).font(.subheadline).foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 16) {
                    HStack { Text("가격 흐름").font(.headline); Spacer(); Text("USD").font(.caption).foregroundStyle(.secondary) }
                    Picker("기간", selection: $days) { Text("7일").tag(7); Text("14일").tag(14); Text("30일").tag(30) }.pickerStyle(.segmented)
                    if Set(series.map(\.price)).count >= 2 {
                        Chart {
                            ForEach(series) { point in
                                LineMark(x: .value("날짜", point.date, unit: .day), y: .value("USD", point.price)).foregroundStyle(Color.red)
                            }
                            if let target = store.saved.targets[product.id] {
                                RuleMark(y: .value("목표가", target)).foregroundStyle(.secondary).lineStyle(StrokeStyle(dash: [4]))
                            }
                        }.frame(height: 190).accessibilityLabel("\(product.name), 최근 \(days)일 상품가")
                    } else {
                        VStack(spacing: 6) {
                            Text(PriceHistory.summary(product.history, current: product.price)).font(.subheadline.bold())
                            Text("가격이 바뀌면 여기에 그래프로 보여드려요").font(.caption).foregroundStyle(.secondary)
                        }.frame(maxWidth: .infinity, minHeight: 120).background(Color.canvas, in: RoundedRectangle(cornerRadius: 12))
                    }
                    let prices = series.map(\.price)
                    HStack {
                        metric("기간 최저", prices.min())
                        Spacer()
                        metric("기간 평균", prices.isEmpty ? nil : prices.reduce(0, +) / Double(prices.count))
                        Spacer()
                        metric("기간 최고", prices.max())
                    }
                    Text("수집 시작 \(product.history.first.map { $0.date.formatted(dayFormat) } ?? "—") · 그 이전 가격은 표시하지 않아요").font(.caption2).foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 10) {
                    Text("판매처").font(.title3.bold())
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(product.retailer).font(.subheadline.bold())
                            Text("피드 배송비 \(product.delivery.map(usd) ?? "미확인") · \(product.stockLabel)").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(usd(product.price)).font(.headline)
                    }
                    Button("Stylevana에서 보기 ↗") {
                        EventLogger.shared.log(.merchantClick, productID: product.id, props: ["retailer": product.retailer])
                        openURL(product.buyURL)
                    }.buttonStyle(.bordered)
                    Text("표시 가격은 결제 가격과 다를 수 있어요. 제휴 링크로 구매하면 Alimi가 수수료를 받을 수 있어요.").font(.caption2).foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 10) {
                    Text(store.status(product)).font(.headline).foregroundStyle(Color.alimi)
                    if let target = store.saved.targets[product.id] {
                        Text("목표 상품가 \(usd(target)) · 배송비·세금 제외").font(.subheadline)
                        Button("목표가 삭제", role: .destructive) { store.saved.targets.removeValue(forKey: product.id) }
                    }
                    Text("목표가는 이 기기에 저장돼요. 푸시 알림은 준비 중이에요.").font(.caption).foregroundStyle(.secondary)
                }
            }.padding(20)
        }.navigationTitle("상품 상세").navigationBarTitleDisplayMode(.inline)
            .onAppear { EventLogger.shared.log(.productView, productID: product.id) }
            .safeAreaInset(edge: .bottom) {
                HStack(spacing: 16) {
                    Button { store.toggle(product.id) } label: {
                        Image(systemName: store.saved.favorites.contains(product.id) ? "heart.fill" : "heart").font(.title2).frame(width: 50, height: 48)
                    }.accessibilityLabel("관심 상품 등록 또는 해제")
                    Button { showTarget = true } label: {
                        Label("목표가 설정", systemImage: "bell").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 14)
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
                    Text("현재 \(usd(product.price))").foregroundStyle(.secondary)
                    TextField("목표 상품가 (USD)", text: $text).keyboardType(.decimalPad)
                    if error { Text("USD 0.01~10,000, 소수 둘째 자리까지 입력하세요.").foregroundStyle(.red) }
                } footer: { Text("미국 달러 상품가 기준 · 배송비와 세금 제외. 푸시 알림은 아직 발송하지 않습니다.") }
                Button("목표가 저장") {
                    guard let value = PriceRule.valid(text) else { error = true; return }
                    store.saved.targets[product.id] = value
                    EventLogger.shared.log(.targetPriceSet, productID: product.id)
                    dismiss()
                }
            }.navigationTitle("목표 가격 설정").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } } }
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
                    ContentUnavailableView("설정한 알림이 없어요", systemImage: "bell", description: Text("상품 상세에서 목표 가격을 설정하세요."))
                }
                ForEach(products) { product in
                    NavigationLink { ProductDetail(product: product) } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(product.name).font(.headline)
                            Text(store.status(product)).foregroundStyle(Color.alimi)
                            Text("현재 \(usd(product.price)) · 목표 \(usd(store.saved.targets[product.id] ?? 0))").font(.caption).foregroundStyle(.secondary)
                        }.padding(.vertical, 8)
                    }
                }
            }.listStyle(.plain).navigationTitle("알림").refreshable { await store.refresh() }
        }
    }
}
