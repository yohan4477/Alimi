import SwiftUI
import Charts

/// UI-only USD scenario. Never persisted into the KRW product/target store.
struct USPricePreview: View {
    private struct Seller: Identifiable {
        let name: String
        let prices: [Int] // USD cents, oldest to newest; explicitly fictional
        let shipping: Int
        let delivery: String
        var id: String { name }
        var current: Int { prices.last ?? 0 }
        var total: Int { current + shipping }
    }
    private struct Point: Identifiable {
        let seller: String
        let day: Int
        let cents: Int
        var id: String { "\(seller)-\(day)" }
    }
    private let sellers = [
        Seller(name: "YesStyle", prices: [2200,2200,2200,2100,2100,2100,1900,1900,1900,2300,2300,2300,2000,2000,2000,2000,1600,1600,1900,1900,1900,1900,1900,1900,1900,1800,1800,1800,1800,1800], shipping: 500, delivery: "7–11영업일"),
        Seller(name: "Ulta", prices: [2500,2500,2500,2500,2500,2500,2400,2400,2400,2400,2300,2300,2300,2300,2300,2300,2200,2200,2200,2200,2200,2200,2100,2100,2100,2000,2000,2000,2000,2000], shipping: 400, delivery: "3–5영업일")
    ]
    @State private var days = 30
    @State private var targetCents = 1700
    @State private var targetText = "17.00"
    @State private var targetSheet = false
    @State private var favorite = false
    @State private var validationError: String?
    private let olive = Color(red: 0.30, green: 0.42, blue: 0.23)
    private var points: [Point] {
        sellers.flatMap { seller in
            Array(seller.prices.suffix(days)).enumerated().map {
                Point(seller: seller.name, day: $0.offset - days + 1, cents: $0.element)
            }
        }
    }
    private var current: Int { sellers.map(\.current).min() ?? 0 }
    private var low: Int { points.map(\.cents).min() ?? 0 }
    private func usd(_ cents: Int) -> String {
        (Double(cents) / 100).formatted(.currency(code: "USD").locale(Locale(identifier: "en_US")))
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Label("UI 예시 · 모든 가격·배송·이력은 가상", systemImage: "info.circle")
                    .font(.caption).foregroundStyle(.secondary)
                HStack(spacing: 20) {
                    Image(systemName: "bottle.tonic.fill")
                        .font(.system(size: 72)).foregroundStyle(olive.opacity(0.65))
                        .accessibilityLabel("실제 포장과 다른 상품 대체 일러스트")
                    VStack(alignment: .leading, spacing: 7) {
                        Text("COSRX").font(.caption).foregroundStyle(.secondary)
                        Text("스네일 96\n뮤신 파워 에센스").font(.title2.bold())
                        Text("100mL · 1개 · US / USD").font(.subheadline)
                        Text("설명용 일러스트").font(.caption2).foregroundStyle(.secondary)
                    }
                }.padding(20).frame(maxWidth: .infinity, alignment: .leading)
                    .background(olive.opacity(0.08), in: RoundedRectangle(cornerRadius: 18))
                VStack(alignment: .leading, spacing: 7) {
                    Text("비교 중인 2곳의 최저 상품가").font(.caption).foregroundStyle(.secondary)
                    Text(usd(current)).font(.largeTitle.bold()).monospacedDigit()
                    Text("YesStyle · 배송비·세금 제외").font(.subheadline)
                    Text("가상 관측 시작 대비 $4.00 저렴해요").font(.caption).foregroundStyle(olive)
                }
                chartPanel
                comparisonPanel
                Text("판매 제시 가격 기준 · 실거래가 아님\n실제 가격 수집·구매 연결·푸시 알림은 미연결")
                    .font(.caption).foregroundStyle(.secondary)
            }.padding(20)
        }
        .navigationTitle("미국 가격 비교 예시")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            HStack(spacing: 12) {
                Button { favorite.toggle() } label: {
                    Image(systemName: favorite ? "heart.fill" : "heart")
                        .font(.title2).frame(width: 48, height: 48)
                }.accessibilityLabel(favorite ? "예시 관심 상품 해제" : "예시 관심 상품 등록")
                Button { targetText = String(format: "%.2f", Double(targetCents) / 100); validationError = nil; targetSheet = true } label: {
                    Text("상품가 \(usd(targetCents)) 이하 알림")
                        .font(.subheadline.bold()).frame(maxWidth: .infinity).padding(.vertical, 12)
                }.buttonStyle(.borderedProminent)
            }.padding(.horizontal, 20).padding(.vertical, 10).background(.bar)
        }
        .tint(olive)
        .sheet(isPresented: $targetSheet) { targetEditor }
    }
    private var chartPanel: some View {
        VStack(alignment: .leading, spacing: 15) {
            Text("지금 사도 좋은 가격일까?").font(.headline)
            Picker("가격 이력 기간", selection: $days) {
                Text("7일").tag(7)
                Text("30일").tag(30)
            }.pickerStyle(.segmented)
            Chart {
                ForEach(points) { point in
                    LineMark(x: .value("오늘 기준 경과일", point.day), y: .value("상품가 USD", Double(point.cents) / 100))
                        .foregroundStyle(by: .value("판매처", point.seller))
                        .interpolationMethod(.stepEnd)
                }
                RuleMark(y: .value("목표 상품가", Double(targetCents) / 100))
                    .foregroundStyle(.secondary).lineStyle(StrokeStyle(dash: [4, 4]))
            }
            .chartForegroundStyleScale(["YesStyle": olive, "Ulta": Color.blue.opacity(0.65)])
            .chartYScale(domain: Double(min(low, targetCents) - 100) / 100 ... Double(max(points.map(\.cents).max() ?? current, targetCents) + 100) / 100)
            .chartXAxisLabel("오늘 기준 경과일")
            .chartYAxisLabel("상품가 · USD")
            .frame(height: 210)
            .accessibilityLabel("최근 \(days)일 판매처별 가상 상품가. 기간 최저 \(usd(low)), 현재 최저 \(usd(current)), 목표 \(usd(targetCents)).")
            Text("점선: 목표 상품가 \(usd(targetCents)) · 배송비·세금 제외")
                .font(.caption).foregroundStyle(.secondary)
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 18) { metrics }
                VStack(alignment: .leading, spacing: 12) { metrics }
            }
        }.padding(16).background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
    }
    @ViewBuilder private var metrics: some View {
        metric("기간 최저", usd(low))
        metric("현재 최저", usd(current))
        metric("최저가와 차이", "+" + usd(current - low))
    }
    private func metric(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.headline).monospacedDigit()
        }
    }
    private var comparisonPanel: some View {
        VStack(alignment: .leading, spacing: 15) {
            Text("어디서 사는 게 좋을까?").font(.headline)
            Text("단품 1개 · 세금 전 합계 낮은 순 · 가상 조건").font(.caption).foregroundStyle(.secondary)
            ForEach(sellers.sorted { $0.total < $1.total }) { seller in
                VStack(alignment: .leading, spacing: 7) {
                    HStack {
                        Text(seller.name).font(.headline)
                        Spacer()
                        Text(usd(seller.current)).font(.title3.bold()).monospacedDigit()
                    }
                    Text("배송비 \(usd(seller.shipping)) → 세금 전 합계 \(usd(seller.total))").font(.subheadline)
                    Text("예상 \(seller.delivery) · 가상 재고 있음").font(.caption).foregroundStyle(.secondary)
                    if seller.name == "YesStyle" {
                        Text("예시 조건: $35 이상 주문 시 무료배송").font(.caption).foregroundStyle(.secondary)
                    }
                }
                Divider()
            }
            Text("회원·정기구독 할인 제외. 위 배송비와 기간은 실제 판매처 정책이 아닌 UI 설명용 가정입니다.")
                .font(.caption).foregroundStyle(.secondary)
        }.padding(16).background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
    }
    private var targetEditor: some View {
        NavigationStack {
            Form {
                Section("목표 상품가 · USD") {
                    TextField("17.00", text: $targetText).keyboardType(.decimalPad)
                    if let validationError { Text(validationError).foregroundStyle(.red) }
                }
                Section {
                    Button("예시 목표가 적용") {
                        let trimmed = targetText.trimmingCharacters(in: .whitespacesAndNewlines)
                        let normalized = trimmed.replacingOccurrences(of: ",", with: ".")
                        guard normalized.range(of: #"^[0-9]+(\.[0-9]{1,2})?$"#, options: .regularExpression) != nil,
                              let value = Double(normalized), value.isFinite, (1...1000).contains(value) else {
                            validationError = "$1–1,000 범위에서 소수 둘째 자리까지 입력하세요."
                            return
                        }
                        targetCents = Int((value * 100).rounded())
                        targetSheet = false
                    }
                } footer: {
                    Text("배송비·세금 제외 상품가 기준. 이 화면에서만 유지되는 예시 설정이며 실제 알림을 발송하지 않습니다.")
                }
            }.navigationTitle("목표가 설정").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("닫기") { targetSheet = false } } }
        }
    }
}
