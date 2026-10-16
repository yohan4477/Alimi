import SwiftUI
import Charts

struct StylevanaObservation: Decodable, Identifiable {
    let productId: String
    let market: String
    let currency: String
    let size: String
    let quantity: Int
    let amount: Double
    let observedAt: String
    let observedOn: String
    let reportedDelivery: Double?
    let availability: String
    let affiliateUrl: URL
    let imageUrl: URL
    var id: String { observedAt }
    var formattedAmount: String { amount.formatted(.currency(code: currency)) }
}
struct StylevanaSnapshot: Decodable {
    let schemaVersion: Int
    let latest: StylevanaObservation
    let history: [StylevanaObservation]
    static let bundled: StylevanaSnapshot? = {
        guard let url = Bundle.main.url(forResource: "stylevana-us", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let snapshot = try? JSONDecoder().decode(StylevanaSnapshot.self, from: data),
              snapshot.schemaVersion == 1,
              snapshot.latest.productId == "2", snapshot.latest.market == "US",
              snapshot.latest.currency == "USD", snapshot.latest.size == "100ml", snapshot.latest.quantity == 1,
              snapshot.latest.affiliateUrl.host == "www.awin1.com" else { return nil }
        return snapshot
    }()
}
struct ProductDestination: View {
    let product: Product
    var body: some View {
        if product.id == "2" {
            if let snapshot = StylevanaSnapshot.bundled {
                StylevanaDetail(product: product, snapshot: snapshot)
            } else {
                ContentUnavailableView("공식 가격을 불러오지 못했어요", systemImage: "exclamationmark.triangle", description: Text("가격 데이터가 포함된 최신 빌드가 필요합니다."))
            }
        } else {
            ProductDetail(product: product)
        }
    }
}
struct StylevanaDetail: View {
    @EnvironmentObject var store: AlimiStore
    let product: Product
    let snapshot: StylevanaSnapshot
    @AppStorage("alimi.stylevana.us.cosrx.target") private var target = ""
    @State private var draft = ""
    @State private var targetError = false
    private var observation: StylevanaObservation { snapshot.latest }
    private var daily: [StylevanaObservation] {
        Dictionary(grouping: snapshot.history, by: \.observedOn).values.compactMap { $0.max { $0.observedAt < $1.observedAt } }.sorted { $0.observedOn < $1.observedOn }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Stylevana 공식 제휴 피드 · 미국 USD").font(.caption).foregroundStyle(.secondary)
                AsyncImage(url: observation.imageUrl) { image in image.resizable().scaledToFit() } placeholder: { ProgressView() }.frame(height: 240).frame(maxWidth: .infinity)
                Text(product.name).font(.title2.bold())
                Text("100ml · 단품 1개").font(.subheadline).foregroundStyle(.secondary)
                Text(observation.formattedAmount).font(.largeTitle.bold())
                Text("상품가 · \(observation.observedOn) 수집 (한국 날짜)").font(.caption)
                Text("배송비·세금 별도 · 현재 가격은 판매처에서 확인").font(.caption).foregroundStyle(.secondary)
                Text("가격 흐름").font(.headline)
                if daily.count >= 2 {
                    Chart(daily) { row in
                        PointMark(x: .value("관측일", row.observedOn), y: .value("USD", row.amount))
                    }.chartYAxisLabel("USD").frame(height: 180)
                    Text("실제 관측일의 상품가 · 관측 사이 변동 미확인").font(.caption)
                } else {
                    Text("공식 피드 이력 수집 중 · \(daily.count)개 날짜").foregroundStyle(.secondary)
                }
                Text("Stylevana US").font(.headline)
                if let delivery = observation.reportedDelivery {
                    Text("피드 배송비: \(delivery.formatted(.currency(code: "USD"))) · 주소별 결제 총액 미확인").font(.caption)
                }
                Text(observation.availability == "in_stock" ? "피드 재고 있음 · 결제 전 확인" : "현재 재고는 판매처에서 확인").font(.caption)
                Link("Stylevana에서 현재 조건 확인 ↗", destination: observation.affiliateUrl).buttonStyle(.borderedProminent).tint(.alimi)
                Text("제휴 링크로 구매하면 Alimi가 수수료를 받을 수 있어요.").font(.caption).foregroundStyle(.secondary)
                Text("나의 목표 상품가 (USD)").font(.headline)
                TextField("USD 상품가", text: $draft).keyboardType(.decimalPad).textFieldStyle(.roundedBorder)
                Button("목표 상품가 저장") {
                    guard draft.range(of: #"^\d+(\.\d{1,2})?$"#, options: .regularExpression) != nil,
                          let value = Double(draft), (0.01...10000).contains(value) else { targetError = true; return }
                    target = draft; targetError = false
                }.buttonStyle(.bordered)
                if targetError { Text("USD 0.01~10,000, 소수 둘째 자리까지 입력하세요.").font(.caption).foregroundStyle(.red) }
                if let value = Double(target) {
                    Text("저장한 목표: \(value.formatted(.currency(code: "USD"))) · 현재 도달 여부 미확인").font(.caption)
                    Button("목표가 삭제") { target = ""; draft = "" }
                }
                Text("목표가는 이 기기에 저장합니다. 앱에는 수집 시점의 피드가 포함돼 있으며, 자동 감시·푸시는 아직 연결되지 않았어요.").font(.caption).foregroundStyle(.secondary)
                Button { store.toggle(product.id) } label: {
                    Label(store.saved.favorites.contains(product.id) ? "관심 등록됨" : "관심 등록", systemImage: store.saved.favorites.contains(product.id) ? "heart.fill" : "heart")
                }
            }.padding(20)
        }.navigationTitle("상품 상세").navigationBarTitleDisplayMode(.inline).onAppear { draft = target }
    }
}
