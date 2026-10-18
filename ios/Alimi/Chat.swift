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
    var title: String { L10n.language == "ko" ? titleKo : titleEn }
    var intro: String { L10n.language == "ko" ? introKo : introEn }
    enum CodingKeys: String, CodingKey {
        case id, titleEn = "title_en", titleKo = "title_ko", introEn = "intro_en", introKo = "intro_ko", members, messages24h = "messages_24h"
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
    static var agreed: Bool {
        get { defaults.bool(forKey: "alimi.chat.agreed") }
        set { defaults.set(newValue, forKey: "alimi.chat.agreed") }
    }
    // Server errors are "chat:<code>"; anything else is a network / unknown failure.
    static func errorKey(_ message: String) -> String {
        let code = message.range(of: #"chat:(\w+)"#, options: .regularExpression).map { String(message[$0].dropFirst(5)) }
        return ["slow", "link", "blocked", "banned", "long"].contains(code ?? "") ? "chat.err." + code! : "chat.err.other"
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
    private static func send(_ request: URLRequest) async throws -> Data {
        var request = request
        request.setValue(LiveAPI.publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 10
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["message"] as? String
            throw Failure(message: message ?? "HTTP")
        }
        return data
    }
    private static func rpc(_ name: String, _ body: [String: Any?]) async throws -> Data {
        var request = URLRequest(url: URL(string: "/rest/v1/rpc/" + name, relativeTo: LiveAPI.baseURL)!)
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: body.mapValues { $0 ?? NSNull() })
        return try await send(request)
    }

    static func rooms() async throws -> [ChatRoom] {
        if offline { return [ChatRoom(id: "acne", titleEn: "Acne & breakouts", titleKo: "트러블·여드름", introEn: "What actually worked for your breakouts?",
                                      introKo: "트러블에 효과 본 제품 이야기", members: 3, messages24h: 1)] }
        let url = URL(string: "/rest/v1/chat_room_list?select=*&order=sort", relativeTo: LiveAPI.baseURL)!
        return try JSONDecoder().decode([ChatRoom].self, from: try await send(URLRequest(url: url)))
    }
    static func messages(room: String, after: Int = 0) async throws -> [ChatMessage] {
        if offline { return after > 0 ? [] : [ChatMessage(id: 1, authorTag: "other", nickname: "Calm Otter", body: "추천 좀 해주세요", item: nil,
                                                           replyTo: nil, likes: 2, createdAt: "2026-10-18T10:00:00Z")] }
        let rows = try JSONDecoder().decode([ChatMessage].self, from: try await send(URLRequest(url: messagesURL(room: room, after: after))))
        return after > 0 ? rows : rows.reversed()
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
    @State private var rooms: [ChatRoom]?
    @State private var failed = false
    @State private var asking: ChatRoom?
    @State private var open: ChatRoom?
    var body: some View {
        NavigationStack {
            List {
                Section { Text(L("chat.sub")).font(.subheadline).foregroundStyle(.secondary) }
                if let rooms {
                    ForEach(rooms) { room in
                        Button { if ChatAPI.agreed { open = room } else { asking = room } } label: { RoomRow(room: room) }
                            .accessibilityIdentifier("chat-room-\(room.id)")
                    }
                } else if failed {
                    Text(L("chat.loadFailed")).foregroundStyle(.secondary)
                } else {
                    ProgressView().frame(maxWidth: .infinity)
                }
            }
            .navigationTitle(L("chat.title"))
            .navigationDestination(item: $open) { ChatRoomView(room: $0) }
            .sheet(item: $asking) { room in JoinSheet(room: room) { ChatAPI.agreed = true; asking = nil; open = room } }
            .task { await load() }
            .refreshable { await load() }
        }
    }
    private func load() async {
        EventLogger.shared.log(.chatOpen)
        do { rooms = try await ChatAPI.rooms(); failed = false } catch { failed = rooms == nil }
    }
}
struct RoomRow: View {
    let room: ChatRoom
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(room.title).font(.headline).foregroundStyle(.primary)
                Text(room.intro).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if room.messages24h > 0 { Circle().fill(.orange).frame(width: 8, height: 8).accessibilityLabel(L("chat.active")) }
            Text(L("chat.members", ["n": room.members])).font(.caption).foregroundStyle(.secondary)
        }.padding(.vertical, 6)
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
    @State private var messages: [ChatMessage] = []
    @State private var nickname = ""
    @State private var text = ""
    @State private var item: CatalogItem?
    @State private var replyTo: ChatMessage?
    @State private var blocked = ChatAPI.blocked
    @State private var picking = false
    @State private var openFamily: ProductFamily?
    @State private var reporting: ChatMessage?
    @State private var notice: String?
    @State private var sending = false
    private var shown: [ChatMessage] { messages.filter { !blocked.contains($0.authorTag) } }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    if shown.isEmpty { Text(L("chat.empty")).foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.top, 40) }
                    ForEach(shown) { m in
                        MessageRow(message: m, parent: m.replyTo.flatMap { id in shown.first { $0.id == id } }, mine: m.authorTag == ChatAPI.myTag,
                                   open: { openFamily = $0 }, like: { like(m) }, reply: { replyTo = m },
                                   report: { reporting = m }, block: { ChatAPI.block(m.authorTag); blocked = ChatAPI.blocked; notice = L("chat.blocked") })
                            .id(m.id)
                    }
                }.padding(16)
            }
            .onChange(of: messages.count) { if let last = shown.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } } }
        }
        .safeAreaInset(edge: .bottom) { composer }
        .navigationTitle(room.title).navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $picking) { ItemPicker { item = $0; picking = false }.environmentObject(store) }
        .sheet(item: $openFamily) { FamilySheet(family: $0).environmentObject(store) }
        .confirmationDialog(L("chat.reportTitle"), isPresented: Binding(get: { reporting != nil }, set: { if !$0 { reporting = nil } }), titleVisibility: .visible) {
            ForEach(["spam", "abuse", "sexual", "other"], id: \.self) { reason in
                Button(L("chat.reason." + reason)) { report(reason) }
            }
        }
        .alert(notice ?? "", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("OK") {} }
        .task { await start() }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let replyTo { Chip(text: L("chat.replyingTo", ["name": replyTo.nickname])) { self.replyTo = nil } }
            if let item { Chip(text: item.brandLabel + " · " + item.name) { self.item = nil } }
            HStack(alignment: .bottom, spacing: 8) {
                Button { picking = true } label: { Image(systemName: "plus").frame(width: 36, height: 36).background(Color.canvas, in: Circle()) }
                    .accessibilityLabel(L("chat.attach"))
                TextField(L("chat.placeholder", ["name": nickname]), text: $text, axis: .vertical)
                    .lineLimit(1...5).textFieldStyle(.roundedBorder).accessibilityIdentifier("chat-text")
                Button { Task { await send() } } label: { Image(systemName: "arrow.up.circle.fill").font(.system(size: 34)) }
                    .disabled(sending || (text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && item == nil))
                    .accessibilityLabel(L("chat.send")).accessibilityIdentifier("chat-send")
            }
        }.padding(.horizontal, 12).padding(.vertical, 8).background(.bar)
    }

    private func start() async {
        do {
            nickname = try await ChatAPI.join(room: room.id)
            EventLogger.shared.log(.chatJoin, props: ["room": room.id])
            messages = try await ChatAPI.messages(room: room.id)
        } catch { notice = L("chat.loadFailed") }
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(4))
            guard let fresh = try? await ChatAPI.messages(room: room.id, after: messages.last?.id ?? 0) else { continue }
            let known = Set(messages.map(\.id))
            messages += fresh.filter { !known.contains($0.id) }
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
        Task { if let n = try? await ChatAPI.like(m.id), let i = messages.firstIndex(where: { $0.id == m.id }) { messages[i].likes = n } }
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
    let open: (ProductFamily) -> Void
    let like: () -> Void
    let reply: () -> Void
    let report: () -> Void
    let block: () -> Void
    var body: some View {
        VStack(alignment: mine ? .trailing : .leading, spacing: 4) {
            if !mine { Text(message.nickname).font(.caption).foregroundStyle(.orange) }
            HStack(alignment: .bottom, spacing: 6) {
                if mine { Spacer(minLength: 40); side }
                bubble.contextMenu { menu }
                if !mine { side; Spacer(minLength: 40) }
            }
        }.frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
    }
    private var bubble: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let parent {
                Text(parent.nickname + ": " + (parent.body.isEmpty ? parent.item?.name ?? "" : parent.body))
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            if !message.body.isEmpty { Text(message.body) }
            if let item = message.item { ItemCard(item: item, open: open) }
        }
        .padding(.horizontal, 13).padding(.vertical, 10)
        .background(mine ? Color.orange.opacity(0.15) : Color.indigo.opacity(0.08), in: RoundedRectangle(cornerRadius: 16))
        .accessibilityIdentifier("chat-message-\(message.id)")
    }
    private var side: some View {
        VStack(spacing: 2) {
            Text(ISODate.parse(message.createdAt)?.formatted(date: .omitted, time: .shortened) ?? "").font(.caption2).foregroundStyle(.secondary)
            Button(action: like) { Text("♡ " + (message.likes > 0 ? String(message.likes) : "")).font(.caption2) }
                .buttonStyle(.plain).foregroundStyle(.secondary).accessibilityLabel(L("chat.like"))
        }
    }
    @ViewBuilder private var menu: some View {
        Button(L("chat.reply"), systemImage: "arrowshape.turn.up.left", action: reply)
        Button(L("chat.like"), systemImage: "heart", action: like)
        if !mine {
            Button(L("chat.report"), systemImage: "exclamationmark.bubble", role: .destructive, action: report)
            Button(L("chat.block"), systemImage: "hand.raised", role: .destructive, action: block)
        }
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
