import SwiftUI
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
            return "Stylevana US 공식 피드 · 실제 상품 \(store.products.count)개" + (latest.map { " · \($0.formatted(dayFormat)) 확인" } ?? "")
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
struct ProductArt: View {
    let product: Product
    var body: some View {
        AsyncImage(url: product.imageUrl) { phase in
            if let image = phase.image { image.resizable().scaledToFit() }
            else {
                VStack(spacing: 10) {
                    Text(product.brand).font(.caption)
                    if phase.error != nil { Text("사진을 불러오지 못했어요").font(.caption2) } else { ProgressView() }
                }.foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity).background(Color.canvas)
            }
        }.frame(maxWidth: .infinity).accessibilityLabel("\(product.brand) \(product.name)")
    }
}
struct BrowseView: View {
    @EnvironmentObject var store: AlimiStore
    var favoritesOnly = false
    @State private var query = ""
    @State private var category = "전체"
    @State private var catalog: [CatalogItem]? = []
    @State private var tracking: String?
    private var results: [Product] { store.search(query, category: category, favoritesOnly: favoritesOnly) }
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
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(store.categories, id: \.self) { item in
                                Button { category = item } label: {
                                    Text(item).font(.subheadline.weight(.medium)).padding(.horizontal, 16).padding(.vertical, 9)
                                        .background(category == item ? Color.alimi : Color.canvas, in: Capsule())
                                        .foregroundStyle(category == item ? .white : .primary)
                                }.accessibilityAddTraits(category == item ? .isSelected : [])
                            }
                        }
                    }
                    HStack {
                        Text(favoritesOnly ? "내가 기다리는 상품" : "오늘의 뷰티 리스트").font(.headline)
                        Spacer()
                        Text("\(results.count)개").font(.subheadline).foregroundStyle(.secondary)
                    }
                    if results.isEmpty {
                        ContentUnavailableView("표시할 상품이 없어요", systemImage: favoritesOnly ? "heart" : "magnifyingglass", description: Text("검색어를 바꾸거나 상품의 하트를 눌러보세요."))
                    }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 16)], spacing: 24) {
                        ForEach(results) { product in
                            VStack(alignment: .leading, spacing: 8) {
                                NavigationLink { ProductDetail(product: product) } label: {
                                    VStack(alignment: .leading, spacing: 8) {
                                        ProductArt(product: product).frame(height: 180)
                                        Text(product.brand).font(.caption).foregroundStyle(.secondary)
                                        Text(product.name).font(.subheadline).lineLimit(2).frame(minHeight: 38, alignment: .top)
                                        Text(usd(product.price)).font(.system(size: 23, weight: .bold, design: .rounded))
                                        Text("\(product.size) · \(product.stockLabel)").font(.caption2).foregroundStyle(.secondary)
                                    }.foregroundStyle(.primary)
                                }.buttonStyle(.plain)
                                Button { store.toggle(product.id) } label: {
                                    Label(store.saved.favorites.contains(product.id) ? "관심 등록됨" : "관심 등록", systemImage: store.saved.favorites.contains(product.id) ? "heart.fill" : "heart")
                                        .font(.caption).frame(minHeight: 44)
                                }.accessibilityIdentifier("favorite-\(product.id)")
                            }
                        }
                    }
                    if !favoritesOnly, CatalogItem.query(query).count >= 2 { catalogSection }
                }.padding(20)
            }.navigationTitle(favoritesOnly ? "관심 상품" : "Alimi")
                .task(id: query) {
                    guard !favoritesOnly, CatalogItem.query(query).count >= 2 else { catalog = []; return }
                    try? await Task.sleep(for: .milliseconds(400))
                    guard !Task.isCancelled else { return }
                    catalog = await store.searchCatalog(query)
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
extension BrowseView {
    // Whole-catalog results: tapping 추적 시작 moves that exact SKU into the tracking layer.
    @ViewBuilder var catalogSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Stylevana 전체에서 찾기").font(.headline)
            Text("추적을 시작하면 오늘부터 가격을 기록해요").font(.caption).foregroundStyle(.secondary)
            if let catalog {
                if catalog.isEmpty { Text("전체 카탈로그에서도 찾지 못했어요.").font(.caption).foregroundStyle(.secondary) }
                ForEach(catalog) { item in
                    HStack(spacing: 12) {
                        AsyncImage(url: item.imageUrl) { $0.resizable().scaledToFit() } placeholder: { Color.canvas }.frame(width: 64, height: 64)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.brand).font(.caption).foregroundStyle(.secondary)
                            Text(item.name).font(.subheadline).lineLimit(2)
                            Text(usd(item.price)).font(.subheadline.bold())
                        }
                        Spacer()
                        Button(tracking == item.id ? "추가 중" : "추적 시작") {
                            tracking = item.id
                            Task {
                                if await store.startTracking(item) { catalog?.removeAll { $0.id == item.id } }
                                tracking = nil
                            }
                        }.buttonStyle(.bordered).disabled(tracking != nil)
                    }
                }
            } else {
                Text("카탈로그를 불러오지 못했어요.").font(.caption).foregroundStyle(.secondary)
            }
        }.padding(.top, 12)
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
                    Text("\(product.brand) · \(product.size)").font(.subheadline).foregroundStyle(.secondary)
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
                            Text("가격 기록 중").font(.subheadline.bold())
                            Text("\(PriceHistory.trackedDays(product.history))일째 수집 중 · 가격이 바뀌면 그래프가 그려져요").font(.caption).foregroundStyle(.secondary)
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
