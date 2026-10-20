import SwiftUI

@main
struct AlimiApp: App {
    @StateObject private var store = AlimiStore()
    var body: some Scene {
        WindowGroup { RootView().environmentObject(store).tint(.alimi) }
    }
}

extension Color {
    static let alimi = Color(red: 0.078, green: 0.388, blue: 0.91)  // #1463E8
    static let canvas = Color(uiColor: .systemGroupedBackground)
    init(rgb: UInt32) { self.init(red: Double(rgb >> 16 & 0xff) / 255, green: Double(rgb >> 8 & 0xff) / 255, blue: Double(rgb & 0xff) / 255) }
}
func usd(_ n: Double) -> String { ServiceRegion.money(n) }
