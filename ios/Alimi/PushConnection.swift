import SwiftUI
import UserNotifications
import Security

struct AlertBackendConfiguration {
    let url: URL
    let publicKey: String
    let environment: String
    static var bundled: Self? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "ALIMISupabaseURL") as? String,
              let url = URL(string: raw), url.scheme == "https", url.path.isEmpty || url.path == "/",
              let host = url.host, host.hasSuffix(".supabase.co"),
              let key = Bundle.main.object(forInfoDictionaryKey: "ALIMISupabasePublishableKey") as? String,
              key.hasPrefix("sb_publishable_"),
              let environment = Bundle.main.object(forInfoDictionaryKey: "ALIMIAPNSEnvironment") as? String,
              ["sandbox", "production"].contains(environment) else { return nil }
        return Self(url: url, publicKey: key, environment: environment)
    }
}
private struct AlertSession: Codable {
    struct User: Codable { let id: String }
    let access_token: String
    let refresh_token: String
    let expires_at: Double
    let user: User
}
private enum AlertKeychain {
    static let account = "alimi.alert.session.v1"
    static func read() -> Data? {
        let query: [String: Any] = [kSecClass as String:kSecClassGenericPassword,
            kSecAttrService as String:"com.alimi.alerts", kSecAttrAccount as String:account,
            kSecReturnData as String:true, kSecMatchLimit as String:kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }
    static func save(_ data: Data) throws {
        let query: [String: Any] = [kSecClass as String:kSecClassGenericPassword,
            kSecAttrService as String:"com.alimi.alerts", kSecAttrAccount as String:account]
        let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String:data] as CFDictionary)
        if status == errSecItemNotFound {
            var insert = query
            insert[kSecValueData as String] = data
            insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else { throw URLError(.cannotWriteToFile) }
        } else if status != errSecSuccess { throw URLError(.cannotWriteToFile) }
    }
}

struct AlertQuote: Decodable {
    let product_id: String
    let amount_cents: Int
    let collected_at: String
    let in_stock: Bool
}

@MainActor final class PushConnection: ObservableObject {
    static let shared = PushConnection()
    @Published private(set) var status = "가격 알림 서버 연결 준비 중"
    @Published private(set) var quote: AlertQuote?
    private var session: AlertSession? = AlertKeychain.read().flatMap { try? JSONDecoder().decode(AlertSession.self, from:$0) }
    private var token: String?
    private var favorites: Set<String> = []
    private var syncing = false
    private var needsSync = false

    func update(favorites: Set<String>) {
        self.favorites = favorites
        needsSync = true
        Task { await synchronize() }
    }
    func registered(_ deviceToken: Data) {
        token = deviceToken.map { String(format:"%02x", $0) }.joined()
        needsSync = true
        Task { await synchronize() }
    }
    func registrationFailed() { status = "푸시 기기 등록 실패 · 앱을 다시 열어 재시도해 주세요" }
    func refreshPermission() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        guard AlertBackendConfiguration.bundled != nil else { status = "가격 알림 서버 연결 준비 중"; return }
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            UIApplication.shared.registerForRemoteNotifications()
            needsSync = true
            await synchronize()
        default:
            status = "아이폰 알림 허용 필요"
            needsSync = true
            await synchronize()
        }
    }
    private func request(_ config: AlertBackendConfiguration, path: String, method: String = "POST",
                         body: [String: Any], bearer: String? = nil, prefer: String? = nil) async throws -> Data {
        guard let url = URL(string:path, relativeTo:config.url)?.absoluteURL,
              url.host == config.url.host else { throw URLError(.badURL) }
        var request = URLRequest(url:url, timeoutInterval:20)
        request.httpMethod = method
        request.setValue(config.publicKey, forHTTPHeaderField:"apikey")
        request.setValue("application/json", forHTTPHeaderField:"Content-Type")
        if let bearer { request.setValue("Bearer \(bearer)", forHTTPHeaderField:"Authorization") }
        if let prefer { request.setValue(prefer, forHTTPHeaderField:"Prefer") }
        if method != "GET" { request.httpBody = try JSONSerialization.data(withJSONObject:body) }
        let (data, response) = try await URLSession.shared.data(for:request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw URLError(.badServerResponse) }
        return data
    }
    private func authenticated(_ config: AlertBackendConfiguration) async throws -> AlertSession {
        if let session, session.expires_at > Date().timeIntervalSince1970 + 60 { return session }
        let data: Data
        if let session {
            data = try await request(config, path:"/auth/v1/token?grant_type=refresh_token", body:["refresh_token":session.refresh_token])
        } else {
            data = try await request(config, path:"/auth/v1/signup", body:[:])
        }
        let updated = try JSONDecoder().decode(AlertSession.self, from:data)
        try AlertKeychain.save(try JSONEncoder().encode(updated))
        session = updated
        return updated
    }
    func loadQuote() async {
        guard let config = AlertBackendConfiguration.bundled else { return }
        // Serialize authentication with device synchronization to avoid refresh-token races.
        guard !syncing else { return }
        syncing = true
        defer { syncing = false; if needsSync { Task { await synchronize() } } }
        do {
            let auth = try await authenticated(config)
            let data = try await request(config, path:"/rest/v1/alimi_quotes?product_id=eq.2&select=product_id,amount_cents,collected_at,in_stock",
                method:"GET", body:[:], bearer:auth.access_token)
            let rows = try JSONDecoder().decode([AlertQuote].self, from:data)
            if let row = rows.first, row.product_id == "2", (1...1000000).contains(row.amount_cents) { quote = row }
        } catch { quote = nil }
    }
    private func synchronize() async {
        guard !syncing, let config = AlertBackendConfiguration.bundled else { return }
        syncing = true
        defer { syncing = false }
        while needsSync {
            needsSync = false
            do {
                let settings = await UNUserNotificationCenter.current().notificationSettings()
                let allowed = NotificationPermissionAction.resolve(settings.authorizationStatus) == .enabled
                // Never create a user solely to record a denied permission.
                guard allowed || session != nil else { return }
                let auth = try await authenticated(config)
                if !allowed {
                    _ = try await request(config, path:"/rest/v1/alimi_devices?user_id=eq.\(auth.user.id)", method:"PATCH",
                        body:["enabled":false], bearer:auth.access_token, prefer:"return=minimal")
                    return
                }
                guard let token else { status = "푸시 기기 등록 중"; return }
                _ = try await request(config, path:"/rest/v1/alimi_devices?on_conflict=user_id",
                    body:["user_id":auth.user.id,"token":token,"environment":config.environment,
                          "time_zone":TimeZone.current.identifier,"enabled":true,"updated_at":ISO8601DateFormatter().string(from:Date())],
                    bearer:auth.access_token, prefer:"resolution=merge-duplicates,return=minimal")
                // Only the real official-feed product is eligible. Demo products never subscribe.
                let enabled = favorites.contains("2")
                let path = "/rest/v1/alimi_watches?user_id=eq.\(auth.user.id)&product_id=eq.2"
                // PATCH retains server-assigned baseline. Insertion is ignore-duplicates, never a baseline reset.
                if enabled {
                    _ = try await request(config, path:"/rest/v1/alimi_watches?on_conflict=user_id,product_id",
                    body:["user_id":auth.user.id,"product_id":"2","enabled":enabled], bearer:auth.access_token,
                    prefer:"resolution=ignore-duplicates,return=minimal")
                }
                _ = try await request(config, path:path, method:"PATCH", body:["enabled":enabled],
                    bearer:auth.access_token, prefer:"return=minimal")
                status = enabled ? "가격 하락 알림 연결됨 · 기본 5% · 밤 10시~오전 8시 제외" : "알림 허용됨 · 관심 상품을 등록해 주세요"
            } catch {
                status = "알림 서버 연결 실패 · 앱을 다시 열어 재시도해 주세요"
                return
            }
        }
    }
}

final class PushAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in PushConnection.shared.registered(deviceToken) }
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Task { @MainActor in PushConnection.shared.registrationFailed() }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }
}
