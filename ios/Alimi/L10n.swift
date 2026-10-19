import Foundation

// UI text shared with the web app (strings.json is a copy of dist/strings.json; tests keep them identical).
// Korean by default (Korean build); English when chosen in Settings.
enum L10n {
    static var deviceLanguage: String { Locale.preferredLanguages.first?.lowercased().hasPrefix("ko") == true ? "ko" : "en" }
    // Settings can override the device language ("ko" or "en").
    static var forced: String?   // tests set this through `language`
    static var language: String {
        get { forced ?? stored }
        set { forced = newValue }
    }
    private static var stored: String {
        if let o = UserDefaults.standard.string(forKey: "alimi.lang"), o == "ko" || o == "en" { return o }
        return "ko"
    }
    static var locale: Locale { Locale(identifier: language == "ko" ? "ko_KR" : "en_US") }
    private static let table: [String: [String: String]] = {
        guard let url = Bundle.main.url(forResource: "strings", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return raw.compactMapValues { $0 as? [String: String] }
    }()
    static func t(_ key: String, _ vars: [String: CustomStringConvertible] = [:]) -> String {
        var text = table[key]?[language] ?? table[key]?["en"] ?? key
        for (name, value) in vars { text = text.replacingOccurrences(of: "{\(name)}", with: value.description) }
        return text
    }
    static func category(_ c: String) -> String { table["category." + c] == nil ? c : t("category." + c) }
}
func L(_ key: String, _ vars: [String: CustomStringConvertible] = [:]) -> String { L10n.t(key, vars) }
