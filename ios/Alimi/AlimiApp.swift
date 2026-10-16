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
func won(_ n: Int) -> String { n.formatted(.number.locale(Locale(identifier: "ko_KR"))) + "원" }
