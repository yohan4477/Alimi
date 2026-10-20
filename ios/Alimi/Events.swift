import Foundation

// P0 funnel events (#49). Anonymous random device ID; never sends search text or personal data.
enum AppEvent: String, CaseIterable {
    case communityOpen = "community_open", postView = "post_view", postCreate = "post_create", commentCreate = "comment_create", productCardClick = "product_card_click", postSave = "post_save"
    case homeView = "home_view", search, productView = "product_view", wishlistAdd = "wishlist_add"
    case wishlistRemove = "wishlist_remove", merchantClick = "merchant_click"
    case chatOpen = "chat_open", chatJoin = "chat_join", chatSend = "chat_send"
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
                                   "name": event.rawValue, "props": props.merging(["service_region": ServiceRegion.current, "ui_language": L10n.language]) { _, context in context }]
        body["product_id"] = productID
        return body
    }
    func log(_ event: AppEvent, productID: String? = nil, props: [String: String] = [:]) {
        guard enabled, let body = try? JSONSerialization.data(withJSONObject: payload(event, productID: productID, props: props)) else { return }
        var request = LiveAPI.request(URL(string: "/rest/v1/app_events", relativeTo: LiveAPI.baseURL)!, method: "POST", body: body,
                                      contentType: "application/json", timeout: 10)
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        session.dataTask(with: request).resume()
    }
}
