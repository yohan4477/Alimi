import SwiftUI
import CryptoKit

// Topic chat (#68), same backend as the web app. Anonymous: a random per-device secret proves authorship to
// the RPCs and the server keeps only its hash (author_tag), which is also what Block hides locally.
// New messages arrive by polling every few seconds while a room is open.
struct ChatRoom: Codable, Identifiable, Hashable {
    let id: String
    let titleEn, titleKo, introEn, introKo: String
    let members: Int
    let messages24h: Int
    var kind: String? = nil
    var tag: String? = nil
    var brand: String? = nil
    var logoUrl: URL? = nil
    var lastMessageAt: String? = nil
    // Concern tags (user_rooms migration); nil on servers without it, which also hides room creation.
    var concerns: [String]? = nil
    var isBrand: Bool { kind == "brand" }
    var title: String { L10n.language == "ko" ? titleKo : titleEn }
    var intro: String { L10n.language == "ko" ? introKo : introEn }
    enum CodingKeys: String, CodingKey {
        case id, titleEn = "title_en", titleKo = "title_ko", introEn = "intro_en", introKo = "intro_ko", members, messages24h = "messages_24h", kind, tag, brand, logoUrl = "logo_url", lastMessageAt = "last_message_at", concerns
    }
}
struct ChatItem: Codable, Hashable {
    let retailer, market, sku, brand, name: String
    let brandKo: String?
    let priceMinor: Int
    let imageUrl: URL?
    let familyKey: String?
    var brandLabel: String { L10n.language == "ko" ? (brandKo ?? brand) : brand }
    var family: ProductFamily? {
        familyKey.map { ProductFamily(familyKey: $0, brand: brand, brandKo: brandKo, baseName: name, category: nil, imageUrl: imageUrl,
                                      minPriceMinor: priceMinor, maxPriceMinor: priceMinor, variants: 1) }
    }
    enum CodingKeys: String, CodingKey {
        case retailer, market, sku, brand, name, brandKo = "brand_ko", priceMinor = "price_minor", imageUrl = "image_url", familyKey = "family_key"
    }
}
struct ChatMessage: Codable, Identifiable, Hashable {
    let id: Int
    let authorTag: String
    let nickname: String
    let body: String
    let item: ChatItem?
    let replyTo: Int?
    var likes: Int
    let createdAt: String
    enum CodingKeys: String, CodingKey {
        case id, authorTag = "author_tag", nickname, body, item, replyTo = "reply_to", likes, createdAt = "created_at"
    }
}

enum ChatAPI {
    static var defaults: UserDefaults = .standard
    static var offline: Bool { ProcessInfo.processInfo.arguments.contains("-uiTestingOffline") }
    static var secret: String {
        if let s = defaults.string(forKey: "alimi.chat.secret"), UUID(uuidString: s) != nil { return s }
        let s = UUID().uuidString.lowercased()
        defaults.set(s, forKey: "alimi.chat.secret")
        return s
    }
    static func tag(_ secret: String) -> String {
        SHA256.hash(data: Data(secret.utf8)).map { String(format: "%02x", $0) }.joined().prefix(24).description
    }
    static var myTag: String { tag(secret) }
    static var blocked: [String] { defaults.stringArray(forKey: "alimi.chat.blocked") ?? [] }
    static func block(_ tag: String) { defaults.set(Array(Set(blocked + [tag])), forKey: "alimi.chat.blocked") }
    static var likedIDs: Set<Int> {
        get { Set(defaults.array(forKey: "seoulbeauty.chat.hearts." + myTag) as? [Int] ?? []) }
        set { defaults.set(Array(newValue), forKey: "seoulbeauty.chat.hearts." + myTag) }
    }
    static var agreed: Bool {
        get { defaults.bool(forKey: "alimi.chat.agreed") }
        set { defaults.set(newValue, forKey: "alimi.chat.agreed") }
    }
    // Server errors are "chat:<code>"; anything else is a network / unknown failure.
    static func errorKey(_ message: String) -> String {
        let code = message.range(of: #"chat:(\w+)"#, options: .regularExpression).map { String(message[$0].dropFirst(5)) }
        return ["slow", "link", "blocked", "banned", "long", "short", "duplicate"].contains(code ?? "") ? "chat.err." + code! : "chat.err.other"
    }
    static func messagesURL(room: String, after: Int = 0, limit: Int = 60) -> URL {
        var c = URLComponents(url: URL(string: "/rest/v1/chat_messages", relativeTo: LiveAPI.baseURL)!, resolvingAgainstBaseURL: true)!
        var items = [URLQueryItem(name: "select", value: "id,room_id,author_tag,nickname,body,item,reply_to,likes,created_at"),
                     URLQueryItem(name: "room_id", value: "eq." + room), URLQueryItem(name: "limit", value: String(limit))]
        if after > 0 { items += [URLQueryItem(name: "id", value: "gt.\(after)"), URLQueryItem(name: "order", value: "id.asc")] }
        else { items.append(URLQueryItem(name: "order", value: "id.desc")) }
        c.queryItems = items
        return c.url!
    }

    struct Failure: Error { let message: String }
    static func send(_ url: URL, method: String = "GET", body: Data? = nil) async throws -> Data {
        let request = LiveAPI.request(url, method: method, body: body, contentType: "application/json", timeout: 10)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["message"] as? String
            throw Failure(message: message ?? "HTTP")
        }
        return data
    }
    static func rpc(_ name: String, _ body: [String: Any?]) async throws -> Data {
        let payload = try JSONSerialization.data(withJSONObject: body.mapValues { $0 ?? NSNull() })
        return try await send(URL(string: "/rest/v1/rpc/" + name, relativeTo: LiveAPI.baseURL)!, method: "POST", body: payload)
    }

    static func rooms() async throws -> [ChatRoom] {
        if offline { return [ChatRoom(id: "acne", titleEn: "Acne & breakouts", titleKo: "트러블·여드름", introEn: "What actually worked for your breakouts?",
                                      introKo: "트러블에 효과 본 제품 이야기", members: 3, messages24h: 1, kind: "topic", tag: "skin"),
                                ChatRoom(id: "brand-cosrx", titleEn: "COSRX", titleKo: "코스알엑스", introEn: "COSRX fans", introKo: "코스알엑스 팬 모임",
                                         members: 2, messages24h: 0, kind: "brand", brand: "COSRX")] }
        let url = URL(string: "/rest/v1/chat_room_list?select=*&order=sort", relativeTo: LiveAPI.baseURL)!
        return try JSONDecoder().decode([ChatRoom].self, from: try await send(url))
    }
    struct Last { let body: String; let createdAt: String? }
    // Rooms this device joined (chat_members is publicly readable), each with its newest message for the preview.
    static func myRooms(all: [ChatRoom]) async throws -> [(room: ChatRoom, last: Last?)] {
        if offline { return all.filter { $0.id == "acne" }.map { ($0, nil) } }
        let url = URL(string: "/rest/v1/chat_members?select=room_id&author_tag=eq." + myTag, relativeTo: LiveAPI.baseURL)!
        struct M: Decodable { let room_id: String }
        let ids = Set(try JSONDecoder().decode([M].self, from: try await send(url)).map(\.room_id))
        var out: [(room: ChatRoom, last: Last?)] = []
        for room in all where ids.contains(room.id) {
            struct R: Decodable { let body: String; let created_at: String }
            let u = URL(string: "/rest/v1/chat_messages?select=body,created_at&room_id=eq.\(room.id)&order=id.desc&limit=1", relativeTo: LiveAPI.baseURL)!
            let row = (try? JSONDecoder().decode([R].self, from: try await send(u)))?.first
            out.append((room, row.map { Last(body: $0.body, createdAt: $0.created_at) }))
        }
        return out
    }
    static func messages(room: String, after: Int = 0) async throws -> [ChatMessage] {
        if offline { return after > 0 ? [] : [ChatMessage(id: 1, authorTag: "other", nickname: "Calm Otter", body: "추천 좀 해주세요", item: nil,
                                                           replyTo: nil, likes: 2, createdAt: "2026-10-18T10:00:00Z")] }
        let rows = try JSONDecoder().decode([ChatMessage].self, from: try await send(messagesURL(room: room, after: after)))
        return after > 0 ? rows : rows.reversed()
    }
    // Anyone can open a public topic room; the server checks length, links, words, duplicates and rate.
    static func createRoom(title: String, intro: String, tag: String, concerns: [String]) async throws -> String {
        if offline { return "acne" }
        let body: [String: Any?] = ["p_secret": secret, "p_title": title.trimmingCharacters(in: .whitespacesAndNewlines),
                                    "p_intro": intro.trimmingCharacters(in: .whitespacesAndNewlines), "p_tag": tag, "p_concerns": concerns]
        return try JSONDecoder().decode(String.self, from: try await rpc("create_room", body))
    }
    static func join(room: String) async throws -> String {
        if offline { return "Dewy Panda" }
        return try JSONDecoder().decode(String.self, from: try await rpc("join_chat", ["p_secret": secret, "p_room": room]))
    }
    static func post(room: String, body: String, item: CatalogItem?, replyTo: Int?) async throws -> ChatMessage {
        if offline { return ChatMessage(id: Int(Date().timeIntervalSince1970), authorTag: myTag, nickname: "Dewy Panda", body: body, item: nil,
                                        replyTo: replyTo, likes: 0, createdAt: ISO8601DateFormatter().string(from: Date())) }
        let data = try await rpc("post_chat", ["p_secret": secret, "p_room": room, "p_body": body, "p_retailer": item?.retailer,
                                               "p_market": item?.market, "p_sku": item?.sku, "p_reply_to": replyTo])
        return try JSONDecoder().decode(ChatMessage.self, from: data)
    }
    static func like(_ id: Int) async throws -> Int {
        if offline { return 1 }
        return try JSONDecoder().decode(Int.self, from: try await rpc("like_chat", ["p_secret": secret, "p_message": id]))
    }
    static func report(_ id: Int, reason: String) async throws {
        if offline { return }
        _ = try await rpc("report_chat", ["p_secret": secret, "p_message": id, "p_reason": reason])
    }
}

struct ChatTab: View {
    enum Pane: Int, CaseIterable { case rooms, topics, mine }
    @State private var rooms: [ChatRoom]?
    @State private var mine: [(room: ChatRoom, last: ChatAPI.Last?)]?
    @State private var failed = false
    @State private var asking: ChatRoom?
    @State private var open: ChatRoom?
    @State private var pane = Pane.rooms
    @State private var tag = "all"
    @State private var searching = false
    @State private var query = ""

    private var needle: String { query.trimmingCharacters(in: .whitespaces).lowercased() }
    private var filtered: [ChatRoom] {
        (rooms ?? []).filter { needle.isEmpty || $0.title.lowercased().contains(needle) }
    }
    private var topics: [ChatRoom] { filtered.filter { !$0.isBrand } }
    private var hot: [ChatRoom] {
        Array(topics.sorted { ($0.messages24h, $0.members) > ($1.messages24h, $1.members) }.prefix(6))
    }
    private var tagged: [ChatRoom] {
        if tag == "all" { return topics.sorted { ($0.lastMessageAt ?? "") > ($1.lastMessageAt ?? "") } }
        return topics.filter { $0.tag == tag }
    }
    private func choose(_ room: ChatRoom) { if ChatAPI.agreed { open = room } else { asking = room } }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                header
                if searching {
                    TextField(L("chat.searchRooms"), text: $query).textFieldStyle(.roundedBorder).padding(.horizontal, 16).padding(.bottom, 8)
                }
                ScrollView {
                    if rooms == nil {
                        if failed { Text(L("chat.loadFailed")).foregroundStyle(.secondary).padding(.top, 40) }
                        else { LoadingCompanion().padding(.top, 18) }
                    } else {
                        switch pane {
                        case .rooms: roomsContent
                        case .topics: topicsContent
                        case .mine: mineContent
                        }
                    }
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(item: $open) { ChatRoomView(room: $0) }
            .sheet(item: $asking) { room in JoinSheet(room: room) { ChatAPI.agreed = true; asking = nil; open = room } }
            .task { await load() }
            .refreshable { await load() }
            .onChange(of: pane) { if pane == .mine { Task { await loadMine() } } }
        }
    }

    private var header: some View {
        HStack(alignment: .bottom, spacing: 20) {
            ForEach(Pane.allCases, id: \.self) { p in
                Button { pane = p } label: {
                    VStack(spacing: 4) {
                        Text(L(["chat.tab.rooms", "chat.tab.topics", "chat.tab.mine"][p.rawValue])).font(.title2.bold())
                            .foregroundStyle(pane == p ? Color.black : Color.gray)
                        Capsule().fill(pane == p ? Color.orange : Color.clear).frame(width: 22, height: 3)
                    }
                }.buttonStyle(.plain).accessibilityIdentifier("chat-tab-\(p.rawValue)")
            }
            Spacer()
            Button { searching.toggle(); if !searching { query = "" } } label: {
                Image(systemName: "magnifyingglass").font(.title3).foregroundStyle(.primary)
            }.accessibilityIdentifier("chat-search").accessibilityLabel(L("chat.searchRooms"))
        }.padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 8)
    }

    private var roomsContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(L("chat.hot")).font(.headline).padding(.horizontal, 16).padding(.vertical, 10).frame(maxWidth: .infinity, alignment: .leading)
                .background(LinearGradient(colors: [Color.orange.opacity(0.15), Color.indigo.opacity(0.08)], startPoint: .leading, endPoint: .trailing))
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(hot) { room in
                    Button { choose(room) } label: { RoomCard(room: room) }.buttonStyle(.plain)
                        .accessibilityIdentifier("chat-room-\(room.id)")
                }
            }.padding(16)
            let brands = filtered.filter(\.isBrand)
            if !brands.isEmpty {
                Text(L("chat.brandRooms")).font(.headline).padding(.horizontal, 16).padding(.vertical, 10)
                ForEach(brands) { room in rowButton(room) }
            }
        }
    }
    private var topicsContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(["all", "talk", "skin", "makeup", "deals"], id: \.self) { t in
                        Button { tag = t } label: {
                            Text(L("chat.tag." + t)).font(.subheadline).padding(.vertical, 7).padding(.horizontal, 14)
                                .background(tag == t ? Color.indigo.opacity(0.12) : Color(.systemBackground), in: Capsule())
                                .overlay(Capsule().stroke(tag == t ? Color.indigo : Color.gray.opacity(0.3), lineWidth: 1))
                                .foregroundStyle(tag == t ? Color.indigo : Color.primary)
                        }.buttonStyle(.plain).accessibilityIdentifier("chat-tag-\(t)")
                    }
                }.padding(.horizontal, 16).padding(.vertical, 10)
            }
            ForEach(tagged) { room in rowButton(room) }
        }
    }
    @ViewBuilder private var mineContent: some View {
        if let mine {
            let shown = mine.filter { needle.isEmpty || $0.room.title.lowercased().contains(needle) }
            if shown.isEmpty {
                Text(L("chat.mineEmpty")).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: .infinity).padding(.top, 60)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(shown, id: \.room.id) { item in
                        Button { choose(item.room) } label: {
                            RoomRow(room: item.room, subtitle: item.last?.body ?? L("chat.noMessages"), time: Self.clock(item.last?.createdAt))
                        }.buttonStyle(.plain).accessibilityIdentifier("chat-room-\(item.room.id)")
                    }
                }
            }
        } else {
            LoadingCompanion().padding(.top, 18)
        }
    }
    private static let hhmm: DateFormatter = { let f = DateFormatter(); f.dateFormat = "HH:mm"; return f }()
    private static func clock(_ iso: String?) -> String? {
        iso.flatMap { ISODate.parse($0) }.map { hhmm.string(from: $0) }
    }
    private func rowButton(_ room: ChatRoom) -> some View {
        Button { choose(room) } label: { RoomRow(room: room, subtitle: room.intro, time: nil) }
            .buttonStyle(.plain).accessibilityIdentifier("chat-room-\(room.id)")
    }
    private func load() async {
        EventLogger.shared.log(.chatOpen)
        do { rooms = try await ChatAPI.rooms(); failed = false } catch { failed = rooms == nil }
        if pane == .mine { await loadMine() }
    }
    private func loadMine() async {
        guard let rooms else { return }
        if let result = try? await ChatAPI.myRooms(all: rooms) { mine = result } else if mine == nil { mine = [] }
    }
}

struct RoomCard: View {
    let room: ChatRoom
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                Text(room.title).font(.subheadline.bold()).foregroundStyle(.primary).lineLimit(1)
                Spacer(minLength: 4)
                if room.messages24h > 0 { Circle().fill(Color.orange).frame(width: 7, height: 7).accessibilityLabel(L("chat.active")) }
            }
            Text(L("chat.members", ["n": room.members])).font(.caption).foregroundStyle(.gray)
            HStack {
                Spacer()
                if room.isBrand { RoomBadge(room: room, size: 22) }
                else { Image(systemName: "person.2.fill").font(.caption).foregroundStyle(Color.indigo.opacity(0.5)) }
            }
        }
        .padding(12).frame(maxWidth: .infinity, minHeight: 84, alignment: .topLeading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.gray.opacity(0.25), lineWidth: 1))
    }
}

struct RoomBadge: View {
    let room: ChatRoom
    let size: CGFloat
    var body: some View {
        let name = room.brand ?? room.title
        Group {
            if room.logoUrl != nil { RemoteImage(url: room.logoUrl, label: name).scaledToFill() }
            else { Text(String(name.prefix(2)).uppercased()).font(.system(size: size * 0.4, weight: .bold)).foregroundStyle(Color.indigo) }
        }
        .frame(width: size, height: size).background(Color.indigo.opacity(0.1)).clipShape(Circle())
    }
}

struct RoomRow: View {
    let room: ChatRoom
    let subtitle: String
    let time: String?
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                if room.isBrand { RoomBadge(room: room, size: 48) }
                else {
                    Image(systemName: "bubble.left.and.bubble.right").foregroundStyle(Color.indigo)
                        .frame(width: 48, height: 48).background(Color.indigo.opacity(0.1), in: Circle())
                }
                VStack(alignment: .leading, spacing: 3) {
                    titleText.lineLimit(1)
                    Text(subtitle).font(.subheadline).foregroundStyle(.gray).lineLimit(1)
                }
                Spacer(minLength: 4)
                if let time { Text(time).font(.caption).foregroundStyle(.gray) }
            }.padding(.horizontal, 16).padding(.vertical, 10)
            Divider().padding(.leading, 76)
        }.contentShape(Rectangle())
    }
    private var titleText: Text {
        Text(room.title).font(.body.bold()).foregroundColor(.primary)
            + Text(" " + L("chat.count", ["n": room.members])).font(.subheadline).foregroundColor(.gray)
    }
}
// Room rules shown once before the first join (App Store UGC: users accept terms before posting).
struct JoinSheet: View {
    @Environment(\.dismiss) private var dismiss
    let room: ChatRoom
    let join: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(L("chat.joinTitle", ["room": room.title])).font(.title3.bold())
            Text(room.intro).padding(12).frame(maxWidth: .infinity, alignment: .leading).background(Color.canvas, in: RoundedRectangle(cornerRadius: 10))
            Text(L("chat.rules")).font(.footnote).foregroundStyle(.secondary)
            HStack(spacing: 10) {
                Button(L("cancel")) { dismiss() }.buttonStyle(.bordered).frame(maxWidth: .infinity)
                Button(L("chat.join"), action: join).buttonStyle(.borderedProminent).frame(maxWidth: .infinity).accessibilityIdentifier("chat-join")
            }.controlSize(.large)
        }.padding(22).presentationDetents([.height(340)])
    }
}

struct ChatRoomView: View {
    @EnvironmentObject var store: AlimiStore
    let room: ChatRoom
    var canPost = true
    var onJoin: () -> Void = {}
    @State private var messages: [ChatMessage] = []
    @State private var nickname = ""
    @State private var text = ""
    @State private var item: CatalogItem?
    @State private var replyTo: ChatMessage?
    @State private var blocked = ChatAPI.blocked
    @State private var picking = false
    @State private var openFamily: ProductFamily?
    @State private var savingMessage: ChatMessage?
    @State private var purchaseRef: String?
    @State private var reporting: ChatMessage?
    @State private var notice: String?
    @State private var sending = false
    @State private var likedIDs = ChatAPI.likedIDs
    @State private var likingIDs: Set<Int> = []
    @State private var atBottom = true
    @State private var unread = 0
    private var shown: [ChatMessage] { messages.filter { !blocked.contains($0.authorTag) } }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 22) {
                    if shown.isEmpty { Text(L("chat.empty")).foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.top, 40) }
                    ForEach(Array(shown.enumerated()), id: \.element.id) { index, m in
                        if index == 0 || !ChatTime.sameDay(shown[index - 1].createdAt, m.createdAt) {
                            HStack(spacing: 14) {
                                Rectangle().fill(Color(rgb: 0xE3E7EE)).frame(height: 1)
                                Text(ChatTime.day(m.createdAt)).font(.system(size: 12)).foregroundStyle(Color.sbGray).fixedSize()
                                Rectangle().fill(Color(rgb: 0xE3E7EE)).frame(height: 1)
                            }.padding(.vertical, 8)
                        }
                        MessageRow(message: m, parent: m.replyTo.flatMap { id in shown.first { $0.id == id } }, mine: m.authorTag == ChatAPI.myTag,
                                   replies: shown.filter { $0.replyTo == m.id }.count, liked: likedIDs.contains(m.id), liking: likingIDs.contains(m.id), jump: { if let id = m.replyTo { withAnimation { proxy.scrollTo(id, anchor: .center) } } },
                                   open: { purchaseRef = "chat-\(m.id)"; openFamily = $0 }, like: { like(m) }, reply: { replyTo = m },
                                   report: { reporting = m }, block: { ChatAPI.block(m.authorTag); blocked = ChatAPI.blocked; notice = L("chat.blocked") }, savePost: { savingMessage = m })
                            .id(m.id)
                    }
                    Color.clear.frame(height: 1).id("chat-bottom")
                        .onAppear { atBottom = true; unread = 0 }
                        .onDisappear { atBottom = false }
                }.padding(.horizontal, 16).padding(.vertical, 14)
            }
            .overlay(alignment: .bottom) {
                if unread > 0 {
                    Button(L("chat.newMessages", ["n": unread])) {
                        proxy.scrollTo("chat-bottom", anchor: .bottom); unread = 0
                    }.font(.caption).padding(12).background(Color.sbTagBg, in: Capsule()).padding(.bottom, 8)
                }
            }
            .onChange(of: messages.count) { old, new in
                if old == 0 || atBottom || messages.last?.authorTag == ChatAPI.myTag {
                    withAnimation { proxy.scrollTo("chat-bottom", anchor: .bottom) }
                    unread = 0
                } else { unread += max(0, new - old) }
            }
        }
        .safeAreaInset(edge: .bottom) { if canPost { composer } else { joinBar } }
        .sheet(isPresented: $picking) { ItemPicker { item = $0; picking = false }.environmentObject(store) }
        .sheet(item: $openFamily) { FamilySheet(family: $0, ref: purchaseRef, attach: canPost ? { picked in item = picked } : nil).environmentObject(store) }
        .sheet(item: $savingMessage) { CommunityComposer(room: room, fromMessage: $0).environmentObject(store) }
        .confirmationDialog(L("chat.reportTitle"), isPresented: Binding(get: { reporting != nil }, set: { if !$0 { reporting = nil } }), titleVisibility: .visible) {
            ForEach(["spam", "abuse", "sexual", "other"], id: \.self) { reason in
                Button(L("chat.reason." + reason)) { report(reason) }
            }
        }
        .alert(notice ?? "", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("OK") {} }
        .task(id: canPost) { await start() }
    }

    private var joinBar: some View {
        VStack(spacing: 10) {
            Text(L("chat.rules")).font(.caption).foregroundStyle(Color.sbGray).fixedSize(horizontal: false, vertical: true)
            Button(action: onJoin) {
                Text(L("room.joinTalk")).font(.system(size: 17, weight: .bold)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 52).background(Color.sbBlue, in: RoundedRectangle(cornerRadius: 14))
            }.buttonStyle(.plain).accessibilityIdentifier("chat-join")
        }.padding(.horizontal, 16).padding(.vertical, 10).background(.bar)
    }
    private var composer: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let replyTo {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(L("chat.replyingTo", ["name": replyTo.nickname])).font(.caption.bold())
                        Text(replyTo.body.isEmpty ? replyTo.item?.name ?? "" : replyTo.body).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer()
                    Button { self.replyTo = nil } label: { Image(systemName: "xmark") }.frame(width: 44, height: 44).accessibilityLabel(L("close"))
                }
            }
            if let item { Chip(text: item.brandLabel + " · " + item.name) { self.item = nil } }
            HStack(alignment: .center, spacing: 12) {
                Button { picking = true } label: {
                    Image(systemName: "plus").font(.system(size: 22, weight: .medium)).foregroundStyle(Color.sbNavy)
                        .frame(width: 46, height: 46).overlay(Circle().stroke(Color.sbNavy, lineWidth: 1.6))
                }.buttonStyle(.plain).accessibilityLabel(L("chat.attach"))
                HStack(spacing: 8) {
                    TextField(L("chat.typeHere"), text: $text, axis: .vertical)
                        .lineLimit(1...5).font(.system(size: 16)).accessibilityIdentifier("chat-text")
                    Button { Task { await send() } } label: { Image(systemName: "arrow.up.circle.fill").font(.system(size: 30)).foregroundStyle(Color.sbBlue) }
                        .disabled(sending || (text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && item == nil))
                        .accessibilityLabel(L("chat.send")).accessibilityIdentifier("chat-send")
                }
                .padding(.leading, 18).padding(.trailing, 8).frame(minHeight: 50)
                .background(Color.white, in: Capsule()).overlay(Capsule().stroke(Color(rgb: 0xE3E7EE)))
            }
        }.padding(.horizontal, 16).padding(.vertical, 8).background(.bar)
    }

    private func start() async {
        do {
            if canPost {
                nickname = try await ChatAPI.join(room: room.id)
                EventLogger.shared.log(.chatJoin, props: ["room": room.id])
            }
            messages = try await ChatAPI.messages(room: room.id)
            Seen.mark(room.id, messages.last?.createdAt)
        } catch { notice = L("chat.loadFailed") }
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(4))
            guard let fresh = try? await ChatAPI.messages(room: room.id, after: messages.last?.id ?? 0) else { continue }
            let known = Set(messages.map(\.id))
            messages += fresh.filter { !known.contains($0.id) }
            Seen.mark(room.id, messages.last?.createdAt)
        }
    }
    private func send() async {
        sending = true
        defer { sending = false }
        do {
            let m = try await ChatAPI.post(room: room.id, body: text.trimmingCharacters(in: .whitespacesAndNewlines), item: item, replyTo: replyTo?.id)
            if !messages.contains(where: { $0.id == m.id }) { messages.append(m) }
            EventLogger.shared.log(.chatSend, props: ["room": room.id, "item": item == nil ? "0" : "1", "reply": replyTo == nil ? "0" : "1"])
            text = ""; item = nil; replyTo = nil
        } catch {
            notice = L(ChatAPI.errorKey((error as? ChatAPI.Failure)?.message ?? ""))
        }
    }
    private func like(_ m: ChatMessage) {
        guard !likingIDs.contains(m.id) else { return }
        likingIDs.insert(m.id)
        Task {
            defer { likingIDs.remove(m.id) }
            do {
                let n = ChatAPI.offline ? max(0, m.likes + (likedIDs.contains(m.id) ? -1 : 1)) : try await ChatAPI.like(m.id)
                if let i = messages.firstIndex(where: { $0.id == m.id }) { messages[i].likes = n }
                if likedIDs.contains(m.id) { likedIDs.remove(m.id) } else { likedIDs.insert(m.id) }
                ChatAPI.likedIDs = likedIDs
            } catch { notice = L("chat.err.other") }
        }
    }
    private func report(_ reason: String) {
        guard let m = reporting else { return }
        Task { do { try await ChatAPI.report(m.id, reason: reason); notice = L("chat.reported") } catch { notice = L("chat.err.other") } }
    }
}

struct Chip: View {
    let text: String
    let remove: () -> Void
    var body: some View {
        HStack(spacing: 6) {
            Text(text).font(.caption).lineLimit(1)
            Button(action: remove) { Image(systemName: "xmark.circle.fill") }.foregroundStyle(.secondary)
        }.padding(.vertical, 5).padding(.horizontal, 10).background(Color.canvas, in: Capsule())
    }
}

// Long-press a bubble for reply / like / report / block, like the reference chat app.
struct MessageRow: View {
    let message: ChatMessage
    let parent: ChatMessage?
    let mine: Bool
    var replies = 0
    var liked = false
    var liking = false
    var jump: () -> Void = {}
    let open: (ProductFamily) -> Void
    let like: () -> Void
    let reply: () -> Void
    let report: () -> Void
    let block: () -> Void
    var savePost: (() -> Void)? = nil
    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            VStack(alignment: mine ? .trailing : .leading, spacing: 6) {
                if !mine { Text(message.nickname).font(.system(size: 13, weight: .semibold)).foregroundStyle(nicknameColor) }
                bubble.contextMenu { menu }
                if let item = message.item { ChatProductCard(item: item, open: open).contextMenu { menu } }
                Text(ChatTime.clock(message.createdAt)).font(.system(size: 11)).foregroundStyle(Color.sbGray)
            }.frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading).padding(.leading, mine ? 24 : 0)
            Button(action: like) {
                HStack(spacing: 6) {
                    Text(String(message.likes)).font(.system(size: 13)).foregroundStyle(Color.sbGray)
                    Image(systemName: liked ? "heart.fill" : "heart").font(.system(size: 20))
                        .foregroundStyle(liked ? Color(rgb: 0xED2850) : Color.sbGray)
                }.frame(width: 54, height: 44, alignment: .trailing).contentShape(Rectangle())
            }.buttonStyle(.plain).disabled(liking).padding(.bottom, 16)
                .accessibilityLabel(L("chat.like") + " " + String(message.likes))
                .accessibilityValue(liked ? "Selected" : "Not selected")
                .accessibilityIdentifier("chat-heart-\(message.id)")
        }
    }
    private var nicknameColor: Color {
        let colors: [UInt32] = [0x147B86, 0x2463EB, 0x8056A3, 0x99601B]
        let index = message.authorTag.utf8.reduce(0) { ($0 + Int($1)) % colors.count }
        return Color(rgb: colors[index])
    }

    @ViewBuilder private var bubble: some View {
        if !message.body.isEmpty || parent != nil {
            VStack(alignment: .leading, spacing: 6) {
                if let parent {
                    Button(action: jump) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(parent.nickname).font(.caption.bold()).foregroundStyle(Color.sbBlue)
                            Text(parent.body.isEmpty ? parent.item?.name ?? "" : parent.body)
                                .font(.caption).foregroundStyle(.secondary).lineLimit(2).multilineTextAlignment(.leading)
                        }.frame(maxWidth: .infinity, alignment: .leading)
                    }.buttonStyle(.plain).padding(.bottom, 4)
                }
                if !message.body.isEmpty { Text(message.body).font(.system(size: 16)).foregroundStyle(Color.sbNavy) }
            }
            .padding(.horizontal, 16).padding(.vertical, 13)
            .background(mine ? Color.sbTagBg : Color(rgb: 0xF1F4F9), in: RoundedRectangle(cornerRadius: 18))
            .accessibilityIdentifier("chat-message-\(message.id)")
        }
    }
    private func pill(icon: String, tint: Color, count: Int, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon).foregroundStyle(tint)
                Text(String(count)).foregroundStyle(Color.sbNavy)
            }.font(.system(size: 15, weight: .semibold)).padding(.horizontal, 14).frame(minHeight: 36)
                .background(Color.white, in: Capsule()).overlay(Capsule().stroke(Color(rgb: 0xE6EAF1)))
        }.buttonStyle(.plain)
    }
    @ViewBuilder private var menu: some View {
        Button(L("chat.reply"), systemImage: "arrowshape.turn.up.left", action: reply)
        Button(L("chat.copy"), systemImage: "doc.on.doc") { UIPasteboard.general.string = message.body.isEmpty ? message.item?.name ?? "" : message.body }
        if mine, let savePost { Button(L("community.saveAsPost"), systemImage: "square.and.pencil", action: savePost) }
        if !mine {
            Button(L("chat.report"), systemImage: "exclamationmark.bubble", role: .destructive, action: report)
            Button(L("chat.block"), systemImage: "hand.raised", role: .destructive, action: block)
        }
    }
}

enum ChatTime {
    static func sameDay(_ a: String, _ b: String) -> Bool {
        guard let first = ISODate.parse(a), let second = ISODate.parse(b) else { return false }
        return Calendar.current.isDate(first, inSameDayAs: second)
    }
    static func day(_ iso: String) -> String {
        guard let date = ISODate.parse(iso) else { return "" }
        let f = DateFormatter(); f.locale = L10n.locale
        f.setLocalizedDateFormatFromTemplate("yyyyMMMMd")
        return f.string(from: date)
    }
    static func clock(_ iso: String) -> String {
        guard let date = ISODate.parse(iso) else { return "" }
        let f = DateFormatter(); f.locale = L10n.locale; f.timeStyle = .short
        return f.string(from: date)
    }
    static func ago(_ iso: String, now: Date = Date()) -> String {
        guard let date = ISODate.parse(iso) else { return "" }
        let f = RelativeDateTimeFormatter(); f.locale = L10n.locale; f.unitsStyle = .full
        return f.localizedString(for: date, relativeTo: now)
    }
}
// Product shared in a chat message (journey screen 4): photo, brand, name, price shared at the time.
struct ChatProductCard: View {
    let item: ChatItem
    let open: (ProductFamily) -> Void
    var body: some View {
        Button { if let f = item.family { open(f) } } label: {
            HStack(spacing: 16) {
                RemoteImage(url: item.imageUrl, label: item.brandLabel).frame(width: 64, height: 64)
                    .background(Color.white).clipShape(RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 6) {
                    Text(item.brandLabel).font(.system(size: 17, weight: .bold)).foregroundStyle(Color.sbNavy)
                    Text(item.name).font(.system(size: 15)).foregroundStyle(Color.sbNavy).lineLimit(2).multilineTextAlignment(.leading)
                    Text(usd(Double(item.priceMinor) / 100)).font(.system(size: 19, weight: .bold)).foregroundStyle(Color(rgb: 0xF0335A))
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.system(size: 15)).foregroundStyle(Color.sbGray)
            }.padding(14).frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 18))
        }.buttonStyle(.plain).accessibilityLabel(L("chat.sharedPrice", ["v": usd(Double(item.priceMinor) / 100)]) + " " + item.name)
    }
}

struct ItemCard: View {
    let item: ChatItem
    let open: (ProductFamily) -> Void
    var body: some View {
        Button { if let f = item.family { open(f) } } label: {
            HStack(spacing: 10) {
                RemoteImage(url: item.imageUrl, label: item.brandLabel).frame(width: 52, height: 52).clipShape(RoundedRectangle(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.brandLabel).font(.caption2).foregroundStyle(.secondary)
                    Text(item.name).font(.caption.bold()).lineLimit(2).multilineTextAlignment(.leading)
                    Text(L("chat.sharedPrice", ["v": usd(Double(item.priceMinor) / 100)])).font(.caption2).foregroundStyle(.red)
                }
            }.padding(8).frame(minWidth: 220, alignment: .leading).background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
        }.buttonStyle(.plain)
    }
}

// Search the catalog and attach one product to the next message.
struct ItemPicker: View {
    @EnvironmentObject var store: AlimiStore
    @Environment(\.dismiss) private var dismiss
    let pick: (CatalogItem) -> Void
    @State private var query = ""
    @State private var results: [CatalogItem] = []
    var body: some View {
        NavigationStack {
            List(results) { c in
                Button { pick(c) } label: {
                    HStack(spacing: 10) {
                        RemoteImage(url: c.imageUrl, label: c.brandLabel).frame(width: 48, height: 48)
                        VStack(alignment: .leading) {
                            Text(c.brandLabel).font(.caption).foregroundStyle(.secondary)
                            Text(c.name).font(.subheadline).lineLimit(2)
                        }
                        Spacer()
                        Text(usd(c.price)).font(.subheadline.bold())
                    }
                }.buttonStyle(.plain)
            }
            .overlay { if results.isEmpty { Text(L("chat.attachHint")).font(.footnote).foregroundStyle(.secondary).padding() } }
            .searchable(text: $query, prompt: L("chat.attachSearch"))
            .task(id: query) {
                try? await Task.sleep(for: .milliseconds(300))
                guard !Task.isCancelled else { return }
                results = Array((await store.searchCatalog(query) ?? []).prefix(20))
            }
            .navigationTitle(L("chat.attach")).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(L("close")) { dismiss() } } }
        }
    }
}
