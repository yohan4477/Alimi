import SwiftUI

// Subject products only: an incidental mention does not make a room a product room.
struct ProductRoomFinder: View {
    @EnvironmentObject var store: AlimiStore
    @ObservedObject var model: CommunityHomeModel
    var open: (ChatRoom) -> Void
    @State private var query = ""
    @State private var selected = ""
    @State private var creating = false
    private func matches(_ room: ChatRoom, _ text: String) -> Bool {
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: " ")
        return !words.isEmpty && words.allSatisfy { word in
            room.titleKo.localizedCaseInsensitiveContains(String(word)) || room.titleEn.localizedCaseInsensitiveContains(String(word))
        }
    }
    private var products: [String] {
        let names = store.products.map(\.name) + model.mentioned.map { $0.item.name }
        return Array(Set(names)).filter { name in model.topics.contains { matches($0, name) } }.sorted()
    }
    private var search: String { selected.isEmpty ? query : selected }
    private var rooms: [ChatRoom] { model.topics.filter { matches($0, search) } }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField(L("rooms.productPh"), text: $query).textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("product-room-query").onChange(of: query) { _, _ in selected = "" }
            if search.isEmpty {
                Text(L("rooms.productsActive")).font(.headline)
                if products.isEmpty { Text(L("rooms.noProductRooms")).font(.caption).foregroundStyle(.secondary) }
                ForEach(products, id: \.self) { name in
                    Button { selected = name } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(name).font(.subheadline.bold())
                            Text(model.topics.filter { matches($0, name) }.prefix(2).map(\.intro).joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                        }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 10)
                    }.buttonStyle(.plain)
                }
            } else {
                if rooms.isEmpty { Text(L("rooms.productEmpty")).font(.caption).foregroundStyle(.secondary) }
                ForEach(rooms) { room in
                    Button { open(room) } label: { RoomListCard(room: room, note: room.intro) }.buttonStyle(.plain)
                        .accessibilityIdentifier("product-room-" + room.id)
                }
                Button(L("rooms.productCreate")) { creating = true }.buttonStyle(.bordered)
            }
        }
        .sheet(isPresented: $creating) {
            CreateRoomSheet(interests: Interests.load(), initialTitle: search) { room in creating = false; open(room) }
        }
    }
}
