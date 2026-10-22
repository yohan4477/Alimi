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
        return ServiceRegion.current == "kr" ? "ko" : "en"
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

// Server nicknames are "Adjective Animal" in English (chat_nickname); Korean screens show the pair in Korean.
// Anything else is shown as stored. Same table as dist/nickname.js.
enum Nickname {
    private static let adj = ["Dewy": "촉촉한", "Glowy": "반짝이는", "Silky": "매끈한", "Calm": "차분한", "Bouncy": "탱탱한", "Fresh": "상큼한",
        "Velvet": "벨벳", "Misty": "안개빛", "Sunny": "햇살", "Plump": "통통한", "Gentle": "순한", "Bright": "밝은", "Cozy": "포근한",
        "Rosy": "장밋빛", "Clear": "맑은", "Soft": "보드라운", "Matte": "보송한", "Peachy": "복숭아빛", "Minty": "민트빛", "Honey": "꿀빛"]
    private static let animal = ["Otter": "수달", "Panda": "판다", "Fox": "여우", "Bunny": "토끼", "Seal": "물범", "Koala": "코알라",
        "Tiger": "호랑이", "Duck": "오리", "Hamster": "햄스터", "Owl": "부엉이", "Deer": "사슴", "Cat": "고양이", "Puppy": "강아지",
        "Penguin": "펭귄", "Turtle": "거북이", "Lamb": "아기양", "Squirrel": "다람쥐", "Whale": "고래", "Swan": "백조", "Bear": "곰"]
    static func display(_ name: String) -> String {
        guard L10n.language == "ko" else { return name }
        let parts = name.split(separator: " ").map(String.init)
        guard parts.count == 2, let a = adj[parts[0]], let b = animal[parts[1]] else { return name }
        return a + " " + b
    }
}
