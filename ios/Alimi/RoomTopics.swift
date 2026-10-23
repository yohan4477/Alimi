import Foundation

// Build-time gates only. Activate after the separately approved schema/grants are verified.
enum RoomFeatureRelease {
    static let lifecycle = true
    static let experiences = true
    static func allowsRPC(_ name: String) -> Bool {
        if ["room_actions", "leave_room", "delete_room", "delete_chat_message"].contains(name) { return lifecycle }
        if ["set_room_experience", "delete_room_experience"].contains(name) { return experiences }
        return true
    }
}

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
        if !RoomFeatureRelease.lifecycle { return ids }
        var result: [String] = []
        for id in ids {
            let value = id == "trouble" ? "acne" : id == "cushion" ? "base" : id
            if !result.contains(value) { result.append(value) }
        }
        return result
    }
    static func offered(_ field: String) -> [String] {
        if !RoomFeatureRelease.lifecycle {
            return Interests.catalog.filter { field == "skin" ? $0.group == "skincare" : field == "makeup" ? $0.group == "makeup" : true }.map(\.id)
        }
        return catalog.filter { field == "talk" || $0.group == field || ($0.group == "product" && (field == "skin" ? $0.id == "sun" : $0.id != "sun")) }.map(\.id)
    }
}

extension Notification.Name { static let roomMembershipChanged = Notification.Name("roomMembershipChanged") }
