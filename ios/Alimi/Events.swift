import Foundation

// P0 funnel events (#49). Anonymous random device ID; never sends search text or personal data.
enum AppEvent: String, CaseIterable {
    case homeView = "home_view", search, productView = "product_view", wishlistAdd = "wishlist_add"
    case wishlistRemove = "wishlist_remove", targetPriceSet = "target_price_set", merchantClick = "merchant_click"
    case notificationOptIn = "notification_opt_in", chatOpen = "chat_open", chatJoin = "chat_join", chatSend = "chat_send"
}

struct EventLogger {
    static var shared = EventLogger()
    var defaults: UserDefaults = .standard
    var session: URLSession = .shared
    var enabled = !ProcessInfo.processInfo.arguments.contains("-disableEvents") && NSClassFromString("XCTestCase") == nil

    var deviceID: String {
        if let id = defaults.string(forKey: "alimi.deviceID"), UUID(uuidString: id) != nil { return id }
        let id = UUID().uuidString.lowercased()
        defaults.set(id, forKey: "alimi.deviceID")
        return id
    }
    func payload(_ event: AppEvent, productID: String?, props: [String: String]) -> [String: Any] {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?"
        var body: [String: Any] = ["device_id": deviceID, "platform": "ios", "app_version": String("\(version) (\(build))".prefix(20)),
                                   "name": event.rawValue, "props": props]
        body["product_id"] = productID
        return body
    }
    func log(_ event: AppEvent, productID: String? = nil, props: [String: String] = [:]) {
        guard enabled, let body = try? JSONSerialization.data(withJSONObject: payload(event, productID: productID, props: props)) else { return }
        var request = URLRequest(url: URL(string: "/rest/v1/app_events", relativeTo: LiveAPI.baseURL)!, timeoutInterval: 10)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue(LiveAPI.publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        session.dataTask(with: request).resume()
    }
}
