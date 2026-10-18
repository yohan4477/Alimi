import SwiftUI

@main
struct AlimiApp: App {
    @StateObject private var store = AlimiStore()
    var body: some Scene {
        WindowGroup { NotificationOnboarding().environmentObject(store).tint(.alimi) }
    }
}

extension Color {
    static let alimi = Color(red: 0.03, green: 0.53, blue: 1.0)
    static let canvas = Color(uiColor: .systemGroupedBackground)
}
func usd(_ n: Double) -> String { n.formatted(.currency(code: "USD").locale(Locale(identifier: "en_US"))) }
