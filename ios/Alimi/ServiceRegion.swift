import Foundation
import SwiftUI

// Service country, UI language, and product currency are independent concepts.
enum ServiceRegion {
    static let key = "seoulbeauty.region"
    static var current: String {
        let saved = UserDefaults.standard.string(forKey: key)
        return saved == "kr" ? "kr" : "us"
    }
    static var market: String { current.uppercased() }
    static var currency: String { current == "kr" ? "KRW" : "USD" }
    static func set(_ value: String) {
        guard ["kr", "us"].contains(value) else { return }
        UserDefaults.standard.set(value, forKey: key)
    }
    static func matches(market: String?, currency: String? = nil) -> Bool {
        if let market { return market.lowercased() == current }
        return currency == self.currency
    }
    static func amount(_ value: Int, currency: String? = nil) -> Double { Double(value) / ((currency ?? self.currency) == "KRW" ? 1 : 100) }
    static func money(_ value: Double, currency: String? = nil) -> String {
        let code = currency ?? self.currency
        return value.formatted(.currency(code: code).locale(Locale(identifier: code == "KRW" ? "ko_KR" : "en_US")))
    }
}
struct ServiceRegionMenu: View {
    @AppStorage("seoulbeauty.region") private var region = "us"
    var body: some View {
        Menu {
            Picker(L("region.title"), selection: $region) {
                Text(L("region.kr")).tag("kr")
                Text(L("region.us")).tag("us")
            }
        } label: {
            HStack(spacing: 3) { Text(L("region." + region)); Image(systemName: "chevron.down").font(.system(size: 9)) }
                .font(.system(size: 12)).foregroundStyle(Color.secondary).frame(minHeight: 32)
        }.accessibilityLabel(L("region.open")).accessibilityIdentifier("service-region-menu")
    }
}
