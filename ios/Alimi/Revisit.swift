import SwiftUI

// Journey 3 (재방문 → 저장 → 공유): welcome back with joined rooms, 내 활동, 알림 from real events, sharing.
// Nothing here invents activity: counts come from fetched messages/posts, "new" only after this device looked.

// MARK: Recently viewed products (this device)

enum RecentViews {
    static let key = "seoulbeauty.recent.v1"
    static func all(_ d: UserDefaults = .standard) -> [ProductFamily] {
        guard let data = d.data(forKey: key), let list = try? JSONDecoder().decode([ProductFamily].self, from: data) else { return [] }
        return list
    }
    static func add(_ f: ProductFamily, _ d: UserDefaults = .standard) {
        let list = [f] + all(d).filter { $0.familyKey != f.familyKey }
        if let data = try? JSONEncoder().encode(Array(list.prefix(20))) { d.set(data, forKey: key) }
    }
}

// MARK: Joined room activity

struct RoomActivity: Identifiable {
    let room: ChatRoom
    let last: ChatMessage?
    let newCount: Int        // messages from others after this device last looked (0 if it never looked)
    let likes: Int           // likes on the messages fetched for the card
    let pictures: [URL]      // products people mentioned in the room, newest first
    var id: String { room.id }
}

@MainActor
final class RevisitModel: ObservableObject {
    @Published var rooms: [ChatRoom] = []
    @Published var activity: [RoomActivity] = []
    @Published var alerts: [AlertItem] = []
    @Published var loaded = false
    func load(store: AlimiStore) async {
        guard let all = try? await ChatAPI.rooms() else { loaded = true; return }
        rooms = all
        let mine = (try? await ChatAPI.myRooms(all: all)) ?? []
        let seen = Seen.all(), me = ChatAPI.myTag
        var acts: [RoomActivity] = [], items: [AlertItem] = []
        for (room, _) in mine {
            let msgs = (try? await ChatAPI.messages(room: room.id)) ?? []
            let others = msgs.filter { $0.authorTag != me }
            let fresh = seen[room.id].map { s in others.filter { $0.createdAt > s } } ?? []
            let pics = msgs.reversed().compactMap { $0.item?.imageUrl }
            acts.append(RoomActivity(room: room, last: msgs.last, newCount: fresh.count, likes: msgs.reduce(0) { $0 + $1.likes }, pictures: pics))
            if let lastFresh = fresh.last {
                items.append(AlertItem(id: "room-\(room.id)", kind: .room, icon: "ellipsis.bubble", tint: 0x2F6BEA, bg: 0xE8F0FE,
                                       title: L("alert.newMessages", ["room": room.title, "n": fresh.count]), body: lastFresh.body,
                                       at: ISODate.parse(lastFresh.createdAt) ?? Date(), room: room, family: nil))
            }
            let mineIds = Set(msgs.filter { $0.authorTag == me }.map(\.id))
            let replies = others.filter { $0.replyTo.map(mineIds.contains) ?? false }
            if let first = replies.last {
                let names = Array(Set(replies.map { Nickname.display($0.nickname) }))
                let who = names.count > 1 ? L("alert.whoMany", ["name": Nickname.display(first.nickname), "n": names.count - 1]) : Nickname.display(first.nickname)
                items.append(AlertItem(id: "reply-\(room.id)", kind: .room, icon: "arrowshape.turn.up.left", tint: 0x2F6BEA, bg: 0xE8F0FE,
                                       title: L("alert.replies", ["who": who]), body: L("alert.repliesBody", ["room": room.title, "n": replies.count]),
                                       at: ISODate.parse(first.createdAt) ?? Date(), room: room, family: nil))
            }
        }
        // Saved products that people talked about this week.
        let weekAgo = Date().addingTimeInterval(-7 * 86_400)
        let saved = store.products.filter { store.saved.favorites.contains($0.id) && $0.familyKey != nil }.prefix(3)
        for p in saved {
            let posts = (try? await CommunityAPI.posts(family: p.familyKey)) ?? []
            let recent = posts.filter { (ISODate.parse($0.created_at) ?? .distantPast) > weekAgo }
            if let newest = recent.first {
                items.append(AlertItem(id: "product-\(p.id)", kind: .product, icon: "link", tint: 0xE5484D, bg: 0xFDE8EA,
                                       title: L("alert.savedTalk"), body: L("alert.savedTalkBody", ["name": p.name, "n": recent.count]),
                                       at: ISODate.parse(newest.created_at) ?? Date(), room: nil,
                                       family: ProductFamily(familyKey: p.familyKey ?? "", brand: p.brand, brandKo: p.brandKo, baseName: p.name, category: p.category,
                                                             imageUrl: p.imageUrl, minPriceMinor: Int(p.price * 100), maxPriceMinor: Int(p.price * 100), variants: 1)))
            }
        }
        activity = acts
        alerts = items.sorted { $0.at > $1.at }
        loaded = true
    }
    var unread: Int { alerts.filter { $0.at > Alerts.lastOpened() }.count }
}

// MARK: Room card for returning visitors (journey 3 screen 4)

struct JoinedRoomCard: View {
    let act: RoomActivity
    let fallback: URL?
    var body: some View {
        RoomListCard(room: act.room, picture: act.pictures.first ?? fallback,
                     note: act.last?.body ?? act.room.intro, fresh: act.newCount > 0)
    }
}

// MARK: My rooms and all rooms share the community room list.
struct MyRoomsView: View {
    @EnvironmentObject var store: AlimiStore
    @StateObject private var model = RevisitModel()
    @StateObject private var home = CommunityHomeModel()
    var onSearch: () -> Void = {}
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    ZStack {
                        HStack { Spacer(); Button(action: onSearch) { Image(systemName: "magnifyingglass").font(.system(size: 24, weight: .medium)).foregroundStyle(Color.sbNavy).frame(width: 44, height: 44) }.accessibilityLabel(L("search.title")) }
                    }
                    if !model.activity.isEmpty {
                        HStack {
                            Text(L("rooms.mine")).font(.title3.bold()).foregroundStyle(Color.sbNavy)
                            Spacer()
                        }.padding(.top, 10)
                        ForEach(model.activity) { act in
                            NavigationLink(value: act.room) { JoinedRoomCard(act: act, fallback: home.pictures[act.room.id]) }
                                .buttonStyle(.plain).accessibilityIdentifier("my-room-" + act.room.id)
                        }
                    }
                    Text(L("home.topics")).font(.title3.bold()).foregroundStyle(Color.sbNavy).padding(.top, 14)
                    ForEach(home.topics) { room in
                        NavigationLink(value: room) { RoomListCard(room: room, picture: home.pictures[room.id], note: room.intro) }
                            .buttonStyle(.plain).accessibilityIdentifier("chat-room-" + room.id)
                    }
                    if !model.loaded { LoadingCompanion(compact: true) }
                }.padding(.horizontal, 16).padding(.bottom, 24)
            }
            .refreshable { await model.load(store: store); await home.load(store: store) }
            .navigationDestination(for: ChatRoom.self) { room in
                CommunityTopic(room: room, member: model.activity.contains { $0.room.id == room.id }, picture: home.pictures[room.id])
            }
            .toolbar(.hidden, for: .navigationBar)
            .task { await model.load(store: store); await home.load(store: store) }
        }
    }
}

// MARK: 알림

enum Alerts {
    static let key = "seoulbeauty.alerts.opened"
    static func lastOpened(_ d: UserDefaults = .standard) -> Date { Date(timeIntervalSince1970: d.double(forKey: key)) }
    static func markOpened(_ d: UserDefaults = .standard) { d.set(Date().timeIntervalSince1970, forKey: key) }
}
struct AlertItem: Identifiable {
    enum Kind: String, CaseIterable { case room, product, service }
    let id: String
    let kind: Kind
    let icon: String
    let tint: UInt32
    let bg: UInt32
    let title: String
    let body: String
    let at: Date
    let room: ChatRoom?
    let family: ProductFamily?
}

struct AlertBell: View {
    let unread: Int
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: "bell").font(.system(size: 23)).foregroundStyle(Color.sbNavy)
                .frame(width: 44, height: 44)
                .overlay(alignment: .topTrailing) {
                    if unread > 0 { Circle().fill(Color.red).frame(width: 8, height: 8).padding(5) }
                }
        }.accessibilityLabel(L("alerts.title")).accessibilityValue(String(unread)).accessibilityIdentifier("open-alerts")
    }
}

struct NotificationsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var store: AlimiStore
    @ObservedObject var model: RevisitModel
    @State private var filter = "all"
    @State private var openFamily: ProductFamily?
    private var shown: [AlertItem] { filter == "all" ? model.alerts : model.alerts.filter { $0.kind.rawValue == filter } }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Text(L("alerts.title")).font(.system(size: 32, weight: .heavy)).foregroundStyle(Color.sbNavy)
                        Spacer()
                        Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }.accessibilityLabel(L("close")).accessibilityIdentifier("alerts-close")
                    }.padding(.top, 12)
                    ScrollView(.horizontal, showsIndicators: false) {
                      HStack(spacing: 10) {
                        ForEach(["all", "room", "product", "service"], id: \.self) { f in
                            Button { filter = f } label: {
                                Text(L("alerts.filter." + f)).font(.system(size: 17, weight: filter == f ? .bold : .medium))
                                    .foregroundStyle(filter == f ? Color.white : Color(rgb: 0x3B4A63))
                                    .padding(.horizontal, 20).frame(minHeight: 46).background(filter == f ? Color.sbBlue : Color(rgb: 0xEEF2F8), in: Capsule())
                            }.buttonStyle(.plain).accessibilityIdentifier("alerts-filter-" + f)
                        }
                      }.fixedSize(horizontal: true, vertical: false)
                    }
                    if shown.isEmpty && model.loaded {
                        Text(L(filter == "service" ? "alerts.emptyService" : "alerts.empty")).font(.subheadline).foregroundStyle(Color.sbGray).padding(.top, 20)
                    }
                    ForEach(shown) { a in
                        if let room = a.room {
                            NavigationLink(value: room) { AlertRow(item: a) }.buttonStyle(.plain)
                        } else {
                            Button { openFamily = a.family } label: { AlertRow(item: a) }.buttonStyle(.plain)
                        }
                    }
                    if !model.loaded { LoadingCompanion(compact: true) }
                }.padding(.horizontal, 16).padding(.bottom, 24)
            }
            .background(Color(rgb: 0xF7F9FC))
            .refreshable { await model.load(store: store) }
            .navigationDestination(for: ChatRoom.self) { CommunityTopic(room: $0, member: true) }
            .toolbar(.hidden, for: .navigationBar)
            .sheet(item: $openFamily) { FamilySheet(family: $0).environmentObject(store) }
            .task { await model.load(store: store); Alerts.markOpened() }
            .accessibilityIdentifier("alerts")
        }
    }
}
struct AlertRow: View {
    let item: AlertItem
    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            Image(systemName: item.icon).font(.system(size: 26)).foregroundStyle(Color(rgb: item.tint))
                .frame(width: 48, height: 48).background(Color(rgb: item.bg), in: Circle())
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top) {
                    Text(item.title).font(.system(size: 18, weight: .heavy)).foregroundStyle(Color.sbNavy).fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    VStack(alignment: .trailing, spacing: 14) {
                        Text(ChatTime.ago(ISO8601DateFormatter().string(from: item.at))).font(.system(size: 14)).foregroundStyle(Color(rgb: 0x8A93A3))
                        Image(systemName: "chevron.right").font(.system(size: 15)).foregroundStyle(Color(rgb: 0x8A93A3))
                    }
                }
                Text(item.body).font(.system(size: 15)).foregroundStyle(Color(rgb: 0x5B6475)).lineLimit(2)
            }
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 20))
    }
}

// MARK: 공유 (share hub)

struct ShareHubView: View {
    @EnvironmentObject var store: AlimiStore
    @State private var rooms: [ChatRoom] = []
    @State private var sheet: String?
    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                VStack(spacing: 10) {
                    Text(L("share.hubTitle")).font(.system(size: 25, weight: .heavy)).foregroundStyle(Color.sbNavy).multilineTextAlignment(.center)
                    Text(L("share.hubSub") + " 💙").font(.system(size: 17)).foregroundStyle(Color(rgb: 0x5B6475))
                }.padding(.top, 28).padding(.horizontal, 16)
                Image("ShareFriends").resizable().scaledToFit().frame(maxWidth: .infinity).padding(.top, 14).accessibilityHidden(true)
                VStack(spacing: 14) {
                    hubRow("ellipsis.bubble", L("share.room"), L("share.roomSub")) { sheet = "rooms" }.accessibilityIdentifier("share-rooms")
                    hubRow("bag", L("share.product"), L("share.productSub")) { sheet = "products" }.accessibilityIdentifier("share-products")
                    ShareLink(item: ShareLinks.site, subject: Text("Seoul Beauty"), message: Text(L("share.inviteMessage"))) {
                        rowLabel("person.badge.plus", L("share.invite"), L("share.inviteSub"))
                    }.buttonStyle(.plain).accessibilityIdentifier("share-invite")
                }
                .padding(18).background(Color.white, in: RoundedRectangle(cornerRadius: 28)).padding(.top, -24)
            }.padding(.bottom, 24)
        }
        .background(Color(rgb: 0xF3F7FE))
        .navigationTitle(L("share.hubNav")).navigationBarTitleDisplayMode(.inline)
        .task { rooms = ((try? await ChatAPI.myRooms(all: (try? await ChatAPI.rooms()) ?? [])) ?? []).map { $0.room } }
        .sheet(item: Binding(get: { sheet.map { SheetID(id: $0) } }, set: { sheet = $0?.id })) { s in
            NavigationStack {
                List {
                    if s.id == "rooms" {
                        if rooms.isEmpty { Text(L("chat.mineEmpty")).foregroundStyle(.secondary) }
                        ForEach(rooms) { r in ShareLink(item: ShareLinks.room(r.id), subject: Text(r.title)) { Label(r.title, systemImage: "ellipsis.bubble") } }
                    } else {
                        let saved = store.products.filter { store.saved.favorites.contains($0.id) && $0.familyKey != nil }
                        if saved.isEmpty { Text(L("saved.hint")).foregroundStyle(.secondary) }
                        ForEach(saved) { p in ShareLink(item: ShareLinks.product(p.familyKey ?? ""), subject: Text(p.name)) { Label(p.brandLabel + " " + p.name, systemImage: "bag") } }
                    }
                }
                .navigationTitle(L(s.id == "rooms" ? "share.room" : "share.product")).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button(L("close")) { sheet = nil } } }
            }.presentationDetents([.medium, .large])
        }
    }
    private struct SheetID: Identifiable { let id: String }
    private func hubRow(_ icon: String, _ title: String, _ sub: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { rowLabel(icon, title, sub) }.buttonStyle(.plain)
    }
    private func rowLabel(_ icon: String, _ title: String, _ sub: String) -> some View {
        HStack(spacing: 18) {
            Image(systemName: icon).font(.system(size: 30)).foregroundStyle(Color.sbBlue)
                .frame(width: 76, height: 76).background(Color.sbTagBg, in: RoundedRectangle(cornerRadius: 22))
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(.system(size: 20, weight: .heavy)).foregroundStyle(Color.sbBlue)
                Text(sub).font(.system(size: 15)).foregroundStyle(Color(rgb: 0x5B6475)).lineLimit(2)
            }
            Spacer(minLength: 4)
            Image(systemName: "chevron.right").font(.system(size: 16)).foregroundStyle(Color(rgb: 0x8A93A3))
        }
        .padding(16).background(Color.white, in: RoundedRectangle(cornerRadius: 20)).overlay(RoundedRectangle(cornerRadius: 20).stroke(Color(rgb: 0xE6EAF1)))
    }
}
