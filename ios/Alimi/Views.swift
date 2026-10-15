import SwiftUI
import Charts

struct RootView: View {
    var body: some View {
        TabView {
            BrowseView().tabItem { Label("홈", systemImage: "house.fill") }
            BrowseView(favoritesOnly: true).tabItem { Label("관심 상품", systemImage: "heart.fill") }
            AlertsView().tabItem { Label("알림", systemImage: "bell.fill") }
        }
    }
}
struct DemoBanner: View {
    var body: some View {
        Label("테스트 데이터 · 실제 가격/푸시 알림 아님", systemImage: "info.circle")
            .font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
            .padding(12).background(Color.canvas, in: RoundedRectangle(cornerRadius: 10))
    }
}
struct ProductArt: View {
    let product: Product
    private var isJar: Bool { product.category == "크림" || product.category == "립케어" }
    private var shade: Color {
        switch product.category {
        case "선케어": return .orange
        case "토너": return .cyan
        case "립케어": return .pink
        case "크림": return .mint
        default: return .purple
        }
    }
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 20).fill(shade.opacity(0.10))
            Circle().fill(shade.opacity(0.08)).frame(width: 120, height: 120).offset(x: 22, y: 10)
            VStack(spacing: 0) {
                RoundedRectangle(cornerRadius: 4).fill(Color.primary.opacity(0.8))
                    .frame(width: isJar ? 90 : 42, height: 15)
                VStack(spacing: 8) {
                    Text(product.brand).font(.system(size: 10, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.7)
                    Text(product.size).font(.system(size: 9)).foregroundStyle(.secondary)
                }.frame(width: isJar ? 90 : 68, height: isJar ? 58 : 98)
                    .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
            }.rotationEffect(.degrees(-8)).shadow(color: shade.opacity(0.18), radius: 12, x: 8, y: 14)
            VStack { Spacer(); Text("패키지 컨셉 · 실제 이미지 아님").font(.system(size: 9)).foregroundStyle(.secondary).padding(.bottom, 10) }
        }.accessibilityLabel("\(product.brand) 제품 대체 일러스트")
    }
}
struct BrowseView: View {
    @EnvironmentObject var store: AlimiStore
    var favoritesOnly = false
    @State private var query = ""
    @State private var category = "전체"
    private var results: [Product] { store.search(query, category: category, favoritesOnly: favoritesOnly) }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    DemoBanner()
                    if !favoritesOnly {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Your beauty.").font(.system(size: 36, weight: .bold, design: .rounded))
                            Text("Better priced.").font(.system(size: 36, weight: .bold, design: .rounded)).foregroundStyle(Color.alimi)
                            Text("눈여겨본 K-뷰티, 지금은 어떤 가격일까요?").font(.subheadline).foregroundStyle(.secondary)
                        }.padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(["전체", "선케어", "토너", "에센스", "크림", "립케어"], id: \.self) { item in
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
                    if let error = store.loadError { Text(error).foregroundStyle(.red) }
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
                                        Text(won(store.price(product))).font(.system(size: 23, weight: .bold, design: .rounded))
                                        Text("배송비 포함 · 가상 판매처 3곳").font(.caption2).foregroundStyle(.secondary)
                                    }.foregroundStyle(.primary)
                                }.buttonStyle(.plain)
                                Button { store.toggle(product.id) } label: {
                                    Label(store.saved.favorites.contains(product.id) ? "관심 등록됨" : "관심 등록", systemImage: store.saved.favorites.contains(product.id) ? "heart.fill" : "heart")
                                        .font(.caption).frame(minHeight: 44)
                                }.accessibilityIdentifier("favorite-\(product.id)")
                            }
                        }
                    }
                }.padding(20)
            }.navigationTitle(favoritesOnly ? "관심 상품" : "alimi")
                .navigationBarTitleDisplayMode(.inline)
                .searchable(text: $query, prompt: "브랜드 또는 상품명 검색")
        }
    }
}
struct ProductDetail: View {
    @EnvironmentObject var store: AlimiStore
    let product: Product
    @State private var showTarget = false
    @State private var simulationText = "14000"
    @State private var inputError: String?
    @State private var days = 30
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                DemoBanner()
                ProductArt(product: product).frame(height: 240)
                Text("제품 대체 일러스트 · 실제 포장 아님").font(.caption2).foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(product.brand) · \(product.size)").font(.subheadline).foregroundStyle(.secondary)
                    Text(product.name).font(.title2.bold())
                    Text(won(store.price(product))).font(.largeTitle.bold())
                    Text("배송비 포함 최저가").font(.caption).foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 16) {
                    HStack { Text("가격 변동 그래프").font(.headline); Spacer(); Text("단위: 원").font(.caption).foregroundStyle(.secondary) }
                    Picker("기간", selection: $days) { Text("7일").tag(7); Text("30일").tag(30) }.pickerStyle(.segmented)
                    Chart {
                        ForEach(Array(store.history(product).suffix(days).enumerated()), id: \.offset) { item in
                            LineMark(x: .value("일", item.offset - days + 1), y: .value("원", item.element)).foregroundStyle(Color.alimi)
                        }
                        if let target = store.saved.targets[product.id] {
                            RuleMark(y: .value("목표가", target)).foregroundStyle(.secondary).lineStyle(StrokeStyle(dash: [4]))
                        }
                    }.frame(height: 190).chartXAxisLabel("오늘 기준 경과일")
                        .accessibilityLabel("\(product.name), 최근 \(days)일 가상 가격 이력")
                    HStack {
                        metric("기간 최저", store.history(product).suffix(days).min() ?? 0)
                        Spacer()
                        metric("기간 최고", store.history(product).suffix(days).max() ?? 0)
                    }
                }.padding(16).background(Color.canvas, in: RoundedRectangle(cornerRadius: 16))
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("어디서 살까?").font(.title3.bold())
                        Text("\(store.offers(product).count)").font(.title3.bold()).foregroundStyle(Color.alimi)
                        Spacer()
                        Text("배송비 포함 낮은순").font(.caption).foregroundStyle(.secondary)
                    }
                    Text("\(product.size) · 동일 상품 기준 · 가상 판매처").font(.caption).foregroundStyle(.secondary)
                    ForEach(store.offers(product)) { offer in
                        OfferComparisonCard(offer: offer, lowest: store.price(product))
                    }
                    Text("테스트 가격이에요. 실제 판매처 연결 전입니다.").font(.caption).foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text(store.status(product)).font(.headline).foregroundStyle(Color.alimi)
                    if let target = store.saved.targets[product.id] {
                        Text("목표 가격 \(won(target)) · 배송비 포함").font(.subheadline)
                        Button("목표가 삭제", role: .destructive) { store.saved.targets.removeValue(forKey: product.id) }
                    }
                    DisclosureGroup("가격 하락 시뮬레이션") {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("브랜드몰 B 가격 · 배송비 0원").font(.caption)
                            TextField("가상 가격", text: $simulationText).keyboardType(.numberPad).textFieldStyle(.roundedBorder)
                            Button("가상 가격 적용") {
                                guard let value = PriceRule.valid(simulationText) else { inputError = "1~10,000,000원의 정수를 입력하세요."; return }
                                store.simulations[product.id] = value; inputError = nil
                            }.buttonStyle(.bordered)
                            Button("원래 가격 복원") { store.simulations.removeValue(forKey: product.id) }
                            if let inputError { Text(inputError).font(.caption).foregroundStyle(.red) }
                            Text("실제 가격 변경이나 푸시 발송이 아닙니다.").font(.caption).foregroundStyle(.secondary)
                        }.padding(.top, 12)
                    }
                }
            }.padding(20)
        }.navigationTitle("상품 상세").navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) {
                HStack(spacing: 16) {
                    Button { store.toggle(product.id) } label: {
                        Image(systemName: store.saved.favorites.contains(product.id) ? "heart.fill" : "heart").font(.title2).frame(width: 50, height: 48)
                    }.accessibilityLabel("관심 상품 등록 또는 해제")
                    Button { showTarget = true } label: {
                        Label("목표가 알림 설정", systemImage: "bell").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 14)
                    }.buttonStyle(.borderedProminent)
                }.padding(.horizontal, 20).padding(.vertical, 10).background(.bar)
            }
            .sheet(isPresented: $showTarget) { TargetSheet(product: product).environmentObject(store) }
    }
    private func metric(_ title: String, _ value: Int) -> some View {
        VStack(alignment: .leading, spacing: 6) { Text(title).font(.caption).foregroundStyle(.secondary); Text(won(value)).font(.subheadline.bold()) }
    }
}
struct OfferComparisonCard: View {
    let offer: Offer
    let lowest: Int
    private var isLowest: Bool { offer.total == lowest }
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if isLowest {
                HStack {
                    Text("현재 비교 최저가").font(.caption.bold())
                    Spacer()
                    Text("배송비까지 포함했어요").font(.caption2)
                }.foregroundStyle(Color.alimi).padding(12).background(Color.alimi.opacity(0.07))
            }
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    Text(String(offer.name.suffix(1))).font(.subheadline.bold())
                        .frame(width: 36, height: 36).background(Color.canvas, in: RoundedRectangle(cornerRadius: 10))
                    VStack(alignment: .leading, spacing: 5) {
                        Text(offer.name).font(.subheadline.bold())
                        Text("\(offer.shipping == 0 ? "무료배송" : "배송비 " + won(offer.shipping)) · 예상 \(offer.days)")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                HStack(alignment: .firstTextBaseline) {
                    Text(won(offer.total)).font(.system(size: 25, weight: .bold)).foregroundStyle(isLowest ? Color.alimi : Color.primary)
                    Spacer()
                    Text(isLowest ? "비교 최저가" : "최저가보다 " + won(offer.total - lowest) + " 더 높음")
                        .font(.caption2).foregroundStyle(.secondary)
                }
                Divider()
                DisclosureGroup("가격 구성") {
                    VStack(spacing: 8) {
                        HStack { Text("상품 가격"); Spacer(); Text(won(offer.price)) }
                        HStack { Text("배송비"); Spacer(); Text(won(offer.shipping)) }
                        HStack { Text("합계"); Spacer(); Text(won(offer.total)) }
                    }.font(.caption).padding(.top, 10)
                }.font(.caption).foregroundStyle(.secondary)
            }.padding(16)
        }.background(Color(uiColor: .systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(isLowest ? Color.alimi : Color.secondary.opacity(0.2), lineWidth: 1))
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
                    TextField("목표 가격 (원)", text: $text).keyboardType(.numberPad)
                    if error { Text("1~10,000,000원의 정수를 입력하세요.").foregroundStyle(.red) }
                } footer: { Text("배송비 포함 가격이 목표가 이하가 되면 앱 내 상태가 변경됩니다. 푸시 알림은 아직 발송하지 않습니다.") }
                Button("목표가 저장") {
                    guard let value = PriceRule.valid(text) else { error = true; return }
                    store.saved.targets[product.id] = value
                    dismiss()
                }
            }.navigationTitle("목표 가격 설정").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } } }
                .onAppear { text = store.saved.targets[product.id].map(String.init) ?? "" }
        }.presentationDetents([.medium, .large])
    }
}
struct AlertsView: View {
    @EnvironmentObject var store: AlimiStore
    var body: some View {
        NavigationStack {
            List {
                DemoBanner().listRowSeparator(.hidden)
                let products = store.products.filter { store.saved.targets[$0.id] != nil }
                if products.isEmpty {
                    ContentUnavailableView("설정한 알림이 없어요", systemImage: "bell", description: Text("상품 상세에서 목표 가격을 설정하세요."))
                }
                ForEach(products) { product in
                    NavigationLink { ProductDetail(product: product) } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(product.name).font(.headline)
                            Text(store.status(product)).foregroundStyle(Color.alimi)
                            Text("현재 \(won(store.price(product))) · 목표 \(won(store.saved.targets[product.id] ?? 0))").font(.caption).foregroundStyle(.secondary)
                        }.padding(.vertical, 8)
                    }
                }
            }.listStyle(.plain).navigationTitle("알림")
        }
    }
}
