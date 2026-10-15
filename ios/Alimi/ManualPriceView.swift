import SwiftUI

enum ManualTorridenPrice {
    static let price = 16900
    static let shipping = 2500
    static let total = price + shipping
    static let source = URL(string: "https://www.torriden.com/goods/goods_view.php?goodsNo=2268")!
    static func assessment(target: Int) -> String {
        guard (1...10_000_000).contains(target) else { return "목표가 미설정" }
        return total <= target ? "확인 당시 가격은 목표가 이하" : "확인 당시 가격은 목표가 초과"
    }
}

struct ManualPriceView: View {
    @AppStorage("alimi.manual.torriden2268.target") private var target = 0
    @State private var input = ""
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label("수동 확인 데이터 · 자동 갱신 안 됨", systemImage: "info.circle")
                    Text("토리든 다이브인 저분자 히알루론산 세럼")
                        .font(.headline)
                    Text("[NEW] 50ml 단품 · 공식몰 상품 2268")
                    LabeledContent("표시 상품 가격", value: won(ManualTorridenPrice.price))
                    LabeledContent("기본 배송비", value: won(ManualTorridenPrice.shipping))
                    LabeledContent("예상 합계", value: won(ManualTorridenPrice.total))
                } footer: {
                    Text("단품 1개, 일반 배송, 쿠폰 미적용 기준. 실결제 30,000원 이상 무료배송. 제주·도서산간 추가 비용 가능. 결제 금액과 재고는 미확인입니다.")
                }
                Section("출처와 최신성") {
                    Text("확인일: 2026년 10월 15일 (한국시간)")
                    Text("웹 공개 페이지 확인값입니다. 정확한 확인 시각과 판매처 갱신 시각은 기록되지 않았습니다. 현재 가격은 달라질 수 있습니다.")
                        .font(.caption).foregroundStyle(.secondary)
                    Link("토리든 공식몰에서 현재 가격 확인", destination: ManualTorridenPrice.source)
                }
                Section("가격 이력") {
                    Label("확인 기록 1건", systemImage: "clock")
                    Text("가격 이력이 부족합니다. 자동 수집은 아직 시작되지 않았습니다.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section("확인 당시 가격으로 목표가 비교") {
                    TextField("배송비 포함 목표 가격 (원)", text: $input)
                        .keyboardType(.numberPad)
                        .accessibilityIdentifier("manual-target-input")
                    Button("목표가 저장 및 비교") {
                        guard let value = PriceRule.valid(input) else {
                            error = "1~10,000,000원의 정수를 입력하세요."
                            return
                        }
                        target = value
                        error = nil
                    }.accessibilityIdentifier("manual-target-save")
                    if let error { Text(error).foregroundStyle(.red) }
                    Text(ManualTorridenPrice.assessment(target: target))
                        .accessibilityIdentifier("manual-target-result")
                    if target > 0 {
                        Text("저장한 목표가: \(won(target))")
                        Button("목표가 삭제", role: .destructive) {
                            target = 0; input = ""; error = nil
                        }
                    }
                } footer: {
                    Text("이 기기에 저장됩니다. 과거 확인값과의 비교이며 현재 구매 가능 또는 가격 하락을 의미하지 않습니다. 자동 추적·푸시 알림은 제공하지 않습니다.")
                }
            }
            .navigationTitle("실제 가격 확인")
            .onAppear { input = target > 0 ? String(target) : "" }
        }
    }
}
