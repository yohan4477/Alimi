import Foundation

enum RoomTopics {
    static let catalog: [(id: String, group: String)] = [
        ("acne", "skin"),
        ("dry", "skin"),
        ("sensitive", "skin"),
        ("pores", "skin"),
        ("sebum", "skin"),
        ("redness", "skin"),
        ("spots", "skin"),
        ("flakes", "skin"),
        ("firmness", "skin"),
        ("shade", "makeup"),
        ("caking", "makeup"),
        ("longwear", "makeup"),
        ("coverage", "makeup"),
        ("color", "makeup"),
        ("lip", "product"),
        ("base", "product"),
        ("eye", "product"),
        ("cheek", "product"),
        ("sun", "product"),
    ]
    static func canonical(_ ids: [String]) -> [String] {
        var result: [String] = []
        for id in ids {
            let value = id == "trouble" ? "acne" : id == "cushion" ? "base" : id
            if !result.contains(value) { result.append(value) }
        }
        return result
    }
    static func offered(_ field: String) -> [String] {
        catalog.filter { field == "talk" || $0.group == field || ($0.group == "product" && (field == "skin" ? $0.id == "sun" : $0.id != "sun")) }.map(\.id)
    }
}

extension Notification.Name { static let roomMembershipChanged = Notification.Name("roomMembershipChanged") }
