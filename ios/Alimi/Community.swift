import SwiftUI
import PhotosUI

// Community (#68 direction): topic posts with comments next to each topic's live chat. Same anonymous identity,
// filters and report flow as chat; every product card links to the same catalog item so a product page can list
// everything said about it.

struct CommunityPost: Codable, Identifiable, Hashable {
    let id: Int
    let roomId: String
    let authorTag: String
    let nickname: String
    let kind: String
    let title: String
    let body: String
    let item: ChatItem?
    let reasons: [String]
    var comments: Int
    var likes: Int
    let createdAt: String
    // Review-only fields (all optional, chosen by the writer).
    var usedFor: String? = nil
    var skinType: String? = nil
    var skinTone: String? = nil
    var undertone: String? = nil
    var climate: String? = nil
    var goal: String? = nil
    var photos: [String]? = nil
    var boughtWhere: String? = nil
    var boughtPriceMinor: Int? = nil
    var boughtCurrency: String? = nil
    var shipCountry: String? = nil
    var shipDays: Int? = nil
    var sponsored: Bool? = nil
    enum CodingKeys: String, CodingKey {
        case id, roomId = "room_id", authorTag = "author_tag", nickname, kind, title, body, item, reasons, comments, likes, createdAt = "created_at"
        case usedFor = "used_for", skinType = "skin_type", skinTone = "skin_tone", undertone, climate, goal, photos
        case boughtWhere = "bought_where", boughtPriceMinor = "bought_price_minor", boughtCurrency = "bought_currency"
        case shipCountry = "ship_country", shipDays = "ship_days", sponsored
    }
    var isReview: Bool { kind == "review" }
}

// What the writer picked for a review; all optional.
struct ReviewDraft {
    var usedFor: String?
    var skin: String?
    var tone: String?
    var undertone: String?
    var climate: String?
    var goal = ""
    var photos: [Data] = []
    var boughtWhere = ""
    var price = ""
    var shipCountry = ""
    var shipDays = ""
    var sponsored = false

    func json(photoPaths: [String]) -> [String: Any] {
        var o: [String: Any] = [:]
        if let usedFor { o["used_for"] = usedFor }
        if let skin { o["skin_type"] = skin }
        if let tone { o["skin_tone"] = tone }
        if let undertone { o["undertone"] = undertone }
        if let climate { o["climate"] = climate }
        let g = String(goal.trimmingCharacters(in: .whitespacesAndNewlines).prefix(60))
        if !g.isEmpty { o["goal"] = g }
        if !photoPaths.isEmpty { o["photos"] = photoPaths }
        let w = String(boughtWhere.trimmingCharacters(in: .whitespacesAndNewlines).prefix(60))
        if !w.isEmpty { o["bought_where"] = w }
        if let p = Double(price.trimmingCharacters(in: .whitespaces)), p > 0 { o["bought_price_minor"] = Int((p * 100).rounded()); o["bought_currency"] = "USD" }
        let c = shipCountry.trimmingCharacters(in: .whitespaces)
        if c.count == 2 { o["ship_country"] = c.uppercased() }
        if let d = Int(shipDays.trimmingCharacters(in: .whitespaces)), (0...120).contains(d) { o["ship_days"] = d }
        if sponsored { o["sponsored"] = true }
        return o
    }
}

struct SavedPost: Codable, Identifiable, Hashable {
    let id: Int
    let title: String
    let kind: String
}
enum SavedPosts {
    private static let key = "alimi.savedPosts"
    static var all: [SavedPost] {
        guard let data = ChatAPI.defaults.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([SavedPost].self, from: data)) ?? []
    }
    static func contains(_ id: Int) -> Bool { all.contains { $0.id == id } }
    // Returns true when the post is now saved.
    @discardableResult static func toggle(_ post: CommunityPost) -> Bool {
        var list = all
        let nowSaved = !list.contains { $0.id == post.id }
        if nowSaved { list.insert(SavedPost(id: post.id, title: post.title, kind: post.kind), at: 0) } else { list.removeAll { $0.id == post.id } }
        if let data = try? JSONEncoder().encode(list) { ChatAPI.defaults.set(data, forKey: key) }
        return nowSaved
    }
}
struct CommunityComment: Codable, Identifiable, Hashable {
    let id: Int
    let postId: Int
    let authorTag: String
    let nickname: String
    let body: String
    let item: ChatItem?
    var likes: Int
    let createdAt: String
    enum CodingKeys: String, CodingKey {
        case id, postId = "post_id", authorTag = "author_tag", nickname, body, item, likes, createdAt = "created_at"
    }
}
struct ProductMention: Decodable {
    let source: String
    let sourceId: Int
    let postId: Int?
    let roomId: String?
    let familyKey: String?
    enum CodingKeys: String, CodingKey {
        case source, sourceId = "source_id", postId = "post_id", roomId = "room_id", familyKey = "family_key"
    }
}

// A product attached to a post or comment, from the catalog picker or from a chat message's card.
struct Attachment: Hashable {
    let retailer, market, sku, brand, name: String
    init(_ c: CatalogItem) { retailer = c.retailer; market = c.market; sku = c.sku; brand = c.brandLabel; name = c.name }
    init(_ c: ChatItem) { retailer = c.retailer; market = c.market; sku = c.sku; brand = c.brandLabel; name = c.name }
    var label: String { brand + " · " + name }
}

extension ChatAPI {
    private static let postFields = "id,room_id,author_tag,nickname,kind,title,body,item,reasons,comments,likes,created_at,last_activity_at"
    private static let commentFields = "id,post_id,author_tag,nickname,body,item,likes,created_at"
    static var localPosts: [CommunityPost] = []
    static var localComments: [CommunityComment] = []

    private static func restURL(_ table: String, _ query: [(String, String)]) -> URL {
        var c = URLComponents(url: URL(string: "/rest/v1/" + table, relativeTo: LiveAPI.baseURL)!, resolvingAgainstBaseURL: true)!
        c.queryItems = query.map { URLQueryItem(name: $0.0, value: $0.1) }
        return c.url!
    }
    private static var fixturePost: CommunityPost {
        CommunityPost(id: 1, roomId: "acne", authorTag: "other", nickname: "Calm Otter", kind: "question", title: "끈적이지 않는 선크림 추천해 주세요",
                      body: "여름이라 번들거림이 걱정이에요", item: nil, reasons: ["texture"], comments: 1, likes: 2, createdAt: "2026-10-18T10:00:00Z")
    }
    private static var fixtureComment: CommunityComment {
        CommunityComment(id: 1, postId: 1, authorTag: "other", nickname: "Calm Otter", body: "수분 선젤이 가볍더라고요", item: nil, likes: 0,
                         createdAt: "2026-10-18T11:00:00Z")
    }
    private static func now() -> String { ISO8601DateFormatter().string(from: Date()) }

    static func posts(room: String) async throws -> [CommunityPost] {
        if offline { return Array(localPosts.filter { $0.roomId == room }.reversed()) + (room == "acne" ? [fixturePost] : []) }
        let url = restURL("community_posts", [("select", postFields), ("room_id", "eq." + room), ("order", "last_activity_at.desc"), ("limit", "50")])
        return try JSONDecoder().decode([CommunityPost].self, from: try await send(URLRequest(url: url)))
    }
    static func recentPosts() async throws -> [CommunityPost] {
        if offline { return Array(localPosts.reversed()) + [fixturePost] }
        let url = restURL("community_posts", [("select", postFields), ("order", "created_at.desc"), ("limit", "10")])
        return try JSONDecoder().decode([CommunityPost].self, from: try await send(URLRequest(url: url)))
    }
    static func posts(ids: [Int]) async throws -> [CommunityPost] {
        if offline { return (localPosts + [fixturePost]).filter { ids.contains($0.id) } }
        if ids.isEmpty { return [] }
        let url = restURL("community_posts", [("select", postFields), ("id", "in.(" + ids.map(String.init).joined(separator: ",") + ")"),
                                               ("order", "created_at.desc")])
        return try JSONDecoder().decode([CommunityPost].self, from: try await send(URLRequest(url: url)))
    }
    static func comments(post: Int) async throws -> [CommunityComment] {
        if offline { return (post == 1 ? [fixtureComment] : []) + localComments.filter { $0.postId == post } }
        let url = restURL("community_comments", [("select", commentFields), ("post_id", "eq.\(post)"), ("order", "id.asc")])
        return try JSONDecoder().decode([CommunityComment].self, from: try await send(URLRequest(url: url)))
    }
    static func mentions(familyKey: String) async throws -> [ProductMention] {
        if offline { return [] }
        let url = restURL("product_mentions", [("select", "source,source_id,post_id,room_id,family_key,sku,created_at"), ("family_key", "eq." + familyKey)])
        return try JSONDecoder().decode([ProductMention].self, from: try await send(URLRequest(url: url)))
    }
    static func createPost(room: String, kind: String, title: String, body: String, item: Attachment?, reasons: [String], fromMessage: Int?, review: [String: Any] = [:]) async throws -> CommunityPost {
        if offline {
            let p = CommunityPost(id: Int(Date().timeIntervalSince1970), roomId: room, authorTag: myTag, nickname: "Dewy Panda", kind: kind, title: title,
                                  body: body, item: nil, reasons: reasons, comments: 0, likes: 0, createdAt: now())
            localPosts.append(p)
            return p
        }
        let data = try await rpc("create_post", ["p_secret": secret, "p_room": room, "p_kind": kind, "p_title": title, "p_body": body,
                                                  "p_retailer": item?.retailer, "p_market": item?.market, "p_sku": item?.sku,
                                                  "p_reasons": reasons, "p_from_message": fromMessage, "p_review": review])
        return try JSONDecoder().decode(CommunityPost.self, from: data)
    }
    // Review photos: public-read bucket, anonymous upload under v1/<uuid>.jpg. Returns the stored path.
    static func uploadPhoto(_ jpeg: Data) async throws -> String {
        let path = "v1/" + UUID().uuidString.lowercased() + ".jpg"
        if offline { return path }
        var request = URLRequest(url: URL(string: "/storage/v1/object/review-photos/" + path, relativeTo: LiveAPI.baseURL)!)
        request.httpMethod = "POST"
        request.setValue(LiveAPI.publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer " + LiveAPI.publishableKey, forHTTPHeaderField: "Authorization")
        request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30
        let (_, response) = try await URLSession.shared.upload(for: request, from: jpeg)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw Failure(message: "chat:photo") }
        return path
    }
    static func photoURL(_ path: String) -> URL? {
        URL(string: "/storage/v1/object/public/review-photos/" + path, relativeTo: LiveAPI.baseURL)
    }
    static func addComment(post: Int, body: String, item: Attachment?) async throws -> CommunityComment {
        if offline {
            let c = CommunityComment(id: Int(Date().timeIntervalSince1970), postId: post, authorTag: myTag, nickname: "Dewy Panda", body: body, item: nil,
                                     likes: 0, createdAt: now())
            localComments.append(c)
            return c
        }
        let data = try await rpc("add_comment", ["p_secret": secret, "p_post": post, "p_body": body,
                                                  "p_retailer": item?.retailer, "p_market": item?.market, "p_sku": item?.sku])
        return try JSONDecoder().decode(CommunityComment.self, from: data)
    }
    static func likeCommunity(_ target: String, id: Int) async throws -> Int {
        if offline { return 1 }
        return try JSONDecoder().decode(Int.self, from: try await rpc("like_community", ["p_secret": secret, "p_target": target, "p_id": id]))
    }
    static func reportCommunity(_ target: String, id: Int, reason: String) async throws {
        if offline { return }
        _ = try await rpc("report_community", ["p_secret": secret, "p_target": target, "p_id": id, "p_reason": reason])
    }
}

private enum Rel {
    static let formatter: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .short
        return f
    }()
    static func text(_ iso: String) -> String {
        guard let d = ISODate.parse(iso) else { return "" }
        formatter.locale = L10n.locale
        return formatter.localizedString(for: d, relativeTo: Date())
    }
}

struct KindBadge: View {
    let kind: String
    private var color: Color { kind == "question" ? .indigo : (kind == "recommend" ? .orange : .green) }
    var body: some View {
        Text(L("community.kind." + kind)).font(.caption2.bold()).foregroundStyle(color)
            .padding(.vertical, 3).padding(.horizontal, 8).background(color.opacity(0.12), in: Capsule())
    }
}

struct PostRow: View {
    let post: CommunityPost
    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    KindBadge(kind: post.kind)
                    Text(post.title).font(.subheadline.bold()).foregroundStyle(.primary).lineLimit(2).multilineTextAlignment(.leading)
                    HStack(spacing: 6) {
                        Text(post.nickname + " · " + Rel.text(post.createdAt))
                        Text(L("community.comments", ["n": post.comments]))
                    }.font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 4)
                if let item = post.item {
                    RemoteImage(url: item.imageUrl, label: item.brandLabel).frame(width: 52, height: 52).clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }.padding(.horizontal, 16).padding(.vertical, 10)
            Divider().padding(.leading, 16)
        }.contentShape(Rectangle())
    }
}

struct PostLink: View {
    let post: CommunityPost
    var body: some View {
        NavigationLink { PostDetail(post: post) } label: { PostRow(post: post) }
            .buttonStyle(.plain).accessibilityIdentifier("post-\(post.id)")
    }
}

// MARK: Home

struct CommunityHome: View {
    @State private var rooms: [ChatRoom]?
    @State private var recent: [CommunityPost] = []
    @State private var failed = false
    @State private var asking: ChatRoom?
    @State private var open: ChatRoom?
    @State private var blocked = ChatAPI.blocked

    private var topics: [ChatRoom] { (rooms ?? []).filter { !$0.isBrand } }
    private var brands: [ChatRoom] { (rooms ?? []).filter(\.isBrand) }
    private func choose(_ room: ChatRoom) { if ChatAPI.agreed { open = room } else { asking = room } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(L("community.title")).font(.largeTitle.bold()).padding(.horizontal, 16).padding(.top, 12)
                    Text(L("community.sub")).font(.subheadline).foregroundStyle(.secondary).padding(.horizontal, 16).padding(.bottom, 8)
                    if rooms == nil {
                        if failed { Text(L("chat.loadFailed")).foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.top, 40) }
                        else { ProgressView().frame(maxWidth: .infinity).padding(.top, 40) }
                    } else {
                        topicsSection
                        recentSection
                        brandSection
                    }
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(item: $open) { TopicView(room: $0) }
            .sheet(item: $asking) { room in JoinSheet(room: room) { ChatAPI.agreed = true; asking = nil; open = room } }
            .task { await load() }
            .refreshable { await load() }
            .onAppear { blocked = ChatAPI.blocked }
        }
    }

    private func sectionTitle(_ key: String) -> some View {
        Text(L(key)).font(.headline).padding(.horizontal, 16).padding(.top, 16).padding(.bottom, 8)
    }
    private var topicsSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            sectionTitle("community.topics")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(topics) { room in
                    Button { choose(room) } label: { RoomCard(room: room) }.buttonStyle(.plain)
                        .accessibilityIdentifier("chat-room-\(room.id)")
                }
            }.padding(.horizontal, 16)
        }
    }
    private var recentSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            sectionTitle("community.recent")
            let shown = recent.filter { !blocked.contains($0.authorTag) }
            if shown.isEmpty {
                Text(L("community.empty")).font(.subheadline).foregroundStyle(.secondary).padding(.horizontal, 16)
            }
            ForEach(shown) { PostLink(post: $0) }
        }
    }
    private var brandSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !brands.isEmpty { sectionTitle("community.brandTalk") }
            ForEach(brands) { room in
                Button { choose(room) } label: { RoomRow(room: room, subtitle: room.intro, time: nil) }
                    .buttonStyle(.plain).accessibilityIdentifier("chat-room-\(room.id)")
            }
        }
    }
    private func load() async {
        EventLogger.shared.log(.communityOpen)
        do { rooms = try await ChatAPI.rooms(); failed = false } catch { failed = rooms == nil }
        if let posts = try? await ChatAPI.recentPosts() { recent = posts }
    }
}

// MARK: Topic

struct TopicView: View {
    enum Mode: Int { case posts, live }
    let room: ChatRoom
    @EnvironmentObject var store: AlimiStore
    @State private var mode = Mode.posts
    @State private var posts: [CommunityPost]?
    @State private var writing = false
    @State private var blocked = ChatAPI.blocked
    private var shown: [CommunityPost] { (posts ?? []).filter { !blocked.contains($0.authorTag) } }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text(room.title).font(.title2.bold())
                Text(room.intro).font(.subheadline).foregroundStyle(.secondary)
            }.frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16).padding(.top, 8)
            Picker("", selection: $mode) {
                Text(L("community.posts")).tag(Mode.posts)
                Text(L("community.live")).tag(Mode.live)
            }.pickerStyle(.segmented).padding(16).accessibilityIdentifier("topic-mode")
            switch mode {
            case .posts: postsContent
            case .live: ChatRoomView(room: room, embedded: true)
            }
        }
        .navigationTitle(room.title).navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $writing) {
            WritePostSheet(room: room, prefill: nil) { post in posts = [post] + (posts ?? []) }.environmentObject(store)
        }
        .task(id: mode) { if mode == .posts { await load() } }
        .onAppear { blocked = ChatAPI.blocked; if posts != nil { Task { await load() } } }
    }

    private var postsContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Button { writing = true } label: { Label(L("community.write"), systemImage: "pencil") }
                    .buttonStyle(.borderedProminent).padding(.horizontal, 16).padding(.bottom, 8).accessibilityIdentifier("post-write")
                if posts == nil { ProgressView().frame(maxWidth: .infinity).padding(.top, 40) }
                else if shown.isEmpty {
                    Text(L("community.empty")).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: .infinity).padding(.top, 40)
                }
                ForEach(shown) { PostLink(post: $0) }
            }
        }.refreshable { await load() }
    }
    private func load() async {
        if let rows = try? await ChatAPI.posts(room: room.id) { posts = rows } else if posts == nil { posts = [] }
    }
}

// MARK: Detail

struct PostDetail: View {
    @EnvironmentObject var store: AlimiStore
    @State var post: CommunityPost
    @State private var comments: [CommunityComment]?
    @State private var blocked = ChatAPI.blocked
    @State private var text = ""
    @State private var attached: Attachment?
    @State private var picking = false
    @State private var openFamily: ProductFamily?
    @State private var reporting: (target: String, id: Int)?
    @State private var notice: String?
    @State private var sending = false
    @State private var saved = false
    private var shown: [CommunityComment] { (comments ?? []).filter { !blocked.contains($0.authorTag) } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                postBody
                Divider()
                commentList
            }.padding(16)
        }
        .safeAreaInset(edge: .bottom) { composer }
        .navigationTitle(post.nickname).navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { toggleSave() } label: {
                    Label(L(saved ? "community.saved" : "community.save"), systemImage: saved ? "bookmark.fill" : "bookmark")
                }.accessibilityIdentifier("post-save")
            }
            ToolbarItem(placement: .primaryAction) { postMenu }
        }
        .sheet(isPresented: $picking) { ItemPicker { attached = Attachment($0); picking = false }.environmentObject(store) }
        .sheet(item: $openFamily) { FamilySheet(family: $0).environmentObject(store) }
        .confirmationDialog(L("chat.reportTitle"), isPresented: Binding(get: { reporting != nil }, set: { if !$0 { reporting = nil } }), titleVisibility: .visible) {
            ForEach(["spam", "abuse", "sexual", "other"], id: \.self) { reason in
                Button(L("chat.reason." + reason)) { report(reason) }
            }
        }
        .alert(notice ?? "", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("OK") {} }
        .task {
            saved = SavedPosts.contains(post.id)
            EventLogger.shared.log(.postView, props: ["room": post.roomId])
            comments = (try? await ChatAPI.comments(post: post.id)) ?? []
        }
    }

    private var postMenu: some View {
        Menu {
            Button(L("chat.like"), systemImage: "heart") { likePost() }
            if post.authorTag != ChatAPI.myTag {
                Button(L("chat.report"), systemImage: "exclamationmark.bubble", role: .destructive) { reporting = ("post", post.id) }
                Button(L("chat.block"), systemImage: "hand.raised", role: .destructive) { blockAuthor(post.authorTag) }
            }
        } label: { Image(systemName: "ellipsis.circle") }.accessibilityIdentifier("post-menu")
    }

    private var postBody: some View {
        VStack(alignment: .leading, spacing: 10) {
            KindBadge(kind: post.kind)
            Text(post.title).font(.title3.bold())
            Text(post.nickname + " · " + Rel.text(post.createdAt) + " · ♡ \(post.likes)").font(.caption).foregroundStyle(.secondary)
            if !post.body.isEmpty { Text(post.body) }
            if !post.reasons.isEmpty {
                HStack { ForEach(post.reasons, id: \.self) { r in
                    Text(L("reason." + r)).font(.caption).padding(.vertical, 4).padding(.horizontal, 10).background(Color.canvas, in: Capsule())
                } }
            }
            if let item = post.item { ItemCard(item: item, open: openProduct) }
            if post.isReview { ReviewInfo(post: post) }
        }
    }

    @ViewBuilder private var commentList: some View {
        if comments == nil { ProgressView().frame(maxWidth: .infinity) }
        else if shown.isEmpty { Text(L("community.noComments")).font(.subheadline).foregroundStyle(.secondary) }
        ForEach(shown) { c in
            VStack(alignment: .leading, spacing: 6) {
                Text(c.nickname + " · " + Rel.text(c.createdAt)).font(.caption).foregroundStyle(.secondary)
                if !c.body.isEmpty { Text(c.body) }
                if let item = c.item { ItemCard(item: item, open: openProduct) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .contextMenu { commentMenu(c) }
        }
    }
    @ViewBuilder private func commentMenu(_ c: CommunityComment) -> some View {
        Button(L("chat.like"), systemImage: "heart") { likeComment(c) }
        if c.authorTag != ChatAPI.myTag {
            Button(L("chat.report"), systemImage: "exclamationmark.bubble", role: .destructive) { reporting = ("comment", c.id) }
            Button(L("chat.block"), systemImage: "hand.raised", role: .destructive) { blockAuthor(c.authorTag) }
        }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let attached { Chip(text: attached.label) { self.attached = nil } }
            HStack(alignment: .bottom, spacing: 8) {
                Button { picking = true } label: { Image(systemName: "plus").frame(width: 36, height: 36).background(Color.canvas, in: Circle()) }
                    .accessibilityLabel(L("chat.attach"))
                TextField(L("community.commentPh"), text: $text, axis: .vertical)
                    .lineLimit(1...4).textFieldStyle(.roundedBorder).accessibilityIdentifier("comment-text")
                Button { Task { await send() } } label: { Image(systemName: "arrow.up.circle.fill").font(.system(size: 34)) }
                    .disabled(sending || (text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && attached == nil))
                    .accessibilityLabel(L("chat.send")).accessibilityIdentifier("comment-send")
            }
        }.padding(.horizontal, 12).padding(.vertical, 8).background(.bar)
    }

    private func openProduct(_ family: ProductFamily) {
        EventLogger.shared.log(.productCardClick, props: ["from": "post"])
        openFamily = family
    }
    private func toggleSave() {
        saved = SavedPosts.toggle(post)
        if saved { EventLogger.shared.log(.postSave, props: ["room": post.roomId, "kind": post.kind]) }
    }
    private func blockAuthor(_ tag: String) {
        ChatAPI.block(tag)
        blocked = ChatAPI.blocked
        notice = L("chat.blocked")
    }
    private func send() async {
        sending = true
        defer { sending = false }
        do {
            let c = try await ChatAPI.addComment(post: post.id, body: text.trimmingCharacters(in: .whitespacesAndNewlines), item: attached)
            if !(comments ?? []).contains(where: { $0.id == c.id }) { comments = (comments ?? []) + [c]; post.comments += 1 }
            EventLogger.shared.log(.commentCreate, props: ["room": post.roomId, "item": attached == nil ? "0" : "1"])
            text = ""; attached = nil
        } catch {
            notice = L(ChatAPI.errorKey((error as? ChatAPI.Failure)?.message ?? ""))
        }
    }
    private func likePost() {
        Task { if let n = try? await ChatAPI.likeCommunity("post", id: post.id) { post.likes = n } }
    }
    private func likeComment(_ c: CommunityComment) {
        Task { if let n = try? await ChatAPI.likeCommunity("comment", id: c.id), let i = comments?.firstIndex(where: { $0.id == c.id }) { comments?[i].likes = n } }
    }
    private func report(_ reason: String) {
        guard let r = reporting else { return }
        Task {
            do { try await ChatAPI.reportCommunity(r.target, id: r.id, reason: reason); notice = L("chat.reported") }
            catch { notice = L("chat.err.other") }
        }
    }
}

// MARK: Write

struct PostPrefill: Identifiable {
    let id: Int
    let title: String
    let body: String
    let item: Attachment?
    init(message: ChatMessage) {
        id = message.id
        title = String(message.body.prefix(60))
        body = message.body
        item = message.item.map(Attachment.init)
    }
}

struct WritePostSheet: View {
    @EnvironmentObject var store: AlimiStore
    @Environment(\.dismiss) private var dismiss
    let room: ChatRoom
    let prefill: PostPrefill?
    let done: (CommunityPost) -> Void
    @State private var kind = "question"
    @State private var title = ""
    @State private var body_ = ""
    @State private var attached: Attachment?
    @State private var reasons: [String] = []
    @State private var picking = false
    @State private var sending = false
    @State private var error: String?
    private static let allReasons = ["price", "texture", "color", "ingredients", "shipping", "skin_type", "scent"]
    @State private var draft = ReviewDraft()
    private var valid: Bool { title.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 && (kind != "review" || attached != nil) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    kindChips
                    TextField(L("community.titlePh"), text: $title).textFieldStyle(.roundedBorder).accessibilityIdentifier("write-title")
                    TextField(L("community.bodyPh"), text: $body_, axis: .vertical).lineLimit(4...10).textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("write-body")
                    attachRow
                    if kind == "review" {
                        if attached == nil { Text(L("review.needItem")).font(.footnote).foregroundStyle(.orange) }
                        ReviewFields(draft: $draft)
                    }
                    Text(L("community.reasons")).font(.footnote).foregroundStyle(.secondary)
                    reasonChips
                    if let error { Text(error).font(.footnote).foregroundStyle(.red) }
                }.padding(16)
            }
            .navigationTitle(L("community.write")).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(L("cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L("community.post")) { Task { await submit() } }.disabled(!valid || sending).accessibilityIdentifier("write-submit")
                }
            }
            .sheet(isPresented: $picking) { ItemPicker { attached = Attachment($0); picking = false }.environmentObject(store) }
        }
        .onAppear {
            guard let prefill, title.isEmpty else { return }
            title = prefill.title; body_ = prefill.body; attached = prefill.item; kind = "recommend"
        }
    }

    private func chip(_ text: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text).font(.subheadline).padding(.vertical, 7).padding(.horizontal, 14)
                .background(on ? Color.indigo.opacity(0.12) : Color(.systemBackground), in: Capsule())
                .overlay(Capsule().stroke(on ? Color.indigo : Color.gray.opacity(0.3), lineWidth: 1))
                .foregroundStyle(on ? Color.indigo : Color.primary)
        }.buttonStyle(.plain)
    }
    private var kindChips: some View {
        HStack(spacing: 8) {
            ForEach(["question", "recommend", "review"], id: \.self) { k in
                chip(L("community.kind." + k), on: kind == k) { kind = k }.accessibilityIdentifier("write-kind-\(k)")
            }
        }
    }
    private var reasonChips: some View {
        let columns = [GridItem(.adaptive(minimum: 90), spacing: 8)]
        return LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
            ForEach(Self.allReasons, id: \.self) { r in
                chip(L("reason." + r), on: reasons.contains(r)) {
                    if let i = reasons.firstIndex(of: r) { reasons.remove(at: i) } else { reasons.append(r) }
                }
            }
        }
    }
    @ViewBuilder private var attachRow: some View {
        if let attached { Chip(text: attached.label) { self.attached = nil } }
        else {
            Button { picking = true } label: { Label(L("chat.attach"), systemImage: "plus") }.buttonStyle(.bordered)
        }
    }
    private func submit() async {
        sending = true
        defer { sending = false }
        do {
            var review: [String: Any] = [:]
            if kind == "review" {
                var paths: [String] = []
                for photo in draft.photos { paths.append(try await ChatAPI.uploadPhoto(photo)) }
                review = draft.json(photoPaths: paths)
            }
            let post = try await ChatAPI.createPost(room: room.id, kind: kind, title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                                                    body: body_.trimmingCharacters(in: .whitespacesAndNewlines), item: attached, reasons: reasons,
                                                    fromMessage: prefill?.id, review: review)
            EventLogger.shared.log(prefill == nil ? .postCreate : .postSave, props: ["room": room.id, "kind": kind, "item": attached == nil ? "0" : "1"])
            done(post)
            dismiss()
        } catch {
            self.error = L(ChatAPI.errorKey((error as? ChatAPI.Failure)?.message ?? ""))
        }
    }
}

// MARK: Reviews

struct ReviewFields: View {
    @Binding var draft: ReviewDraft
    @State private var picked: [PhotosPickerItem] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(L("review.showMine")).font(.footnote).foregroundStyle(.secondary)
            choice("review.usedFor", "review.used.", ["first", "weeks", "months", "long"], $draft.usedFor)
            choice("review.skin", "skin.", ["dry", "oily", "combination", "sensitive", "normal"], $draft.skin)
            choice("review.tone", "tone.", ["fair", "light", "medium", "tan", "deep"], $draft.tone)
            choice("review.undertone", "under.", ["cool", "warm", "neutral"], $draft.undertone)
            choice("review.climate", "climate.", ["humid", "dry", "mixed"], $draft.climate)
            Text(L("review.goal")).font(.subheadline.bold())
            TextField(L("review.goal"), text: $draft.goal).textFieldStyle(.roundedBorder)
            photosSection
            purchaseSection
        }
    }

    private func choice(_ title: String, _ prefix: String, _ values: [String], _ selection: Binding<String?>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(L(title)).font(.subheadline.bold())
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 80), spacing: 8)], alignment: .leading, spacing: 8) {
                ForEach(values, id: \.self) { v in
                    let on = selection.wrappedValue == v
                    Button { selection.wrappedValue = on ? nil : v } label: {
                        Text(L(prefix + v)).font(.subheadline).padding(.vertical, 6).padding(.horizontal, 12)
                            .background(on ? Color.indigo.opacity(0.12) : Color(.systemBackground), in: Capsule())
                            .overlay(Capsule().stroke(on ? Color.indigo : Color.gray.opacity(0.3), lineWidth: 1))
                            .foregroundStyle(on ? Color.indigo : Color.primary)
                    }.buttonStyle(.plain)
                }
            }
        }
    }

    private var photosSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(L("review.photos")).font(.subheadline.bold())
            Text(L("review.photoNote")).font(.caption).foregroundStyle(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(draft.photos.enumerated()), id: \.offset) { i, data in
                        ZStack(alignment: .topTrailing) {
                            if let img = UIImage(data: data) {
                                Image(uiImage: img).resizable().scaledToFill().frame(width: 72, height: 72).clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                            Button { draft.photos.remove(at: i) } label: { Image(systemName: "xmark.circle.fill") }
                                .foregroundStyle(.white, .black.opacity(0.6)).padding(2)
                        }
                    }
                }
            }
            if draft.photos.count < 4 {
                PhotosPicker(selection: $picked, maxSelectionCount: 4 - draft.photos.count, matching: .images) {
                    Label(L("review.addPhoto"), systemImage: "photo.badge.plus")
                }.buttonStyle(.bordered)
            }
        }
        .onChange(of: picked) {
            let items = picked
            picked = []
            Task {
                for item in items where draft.photos.count < 4 {
                    if let data = try? await item.loadTransferable(type: Data.self), let jpeg = Self.reencode(data) { draft.photos.append(jpeg) }
                }
            }
        }
    }

    // Redraw and re-compress: scales to at most 1600px and drops EXIF / location.
    static func reencode(_ data: Data) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let longest = max(image.size.width, image.size.height)
        let scale = longest > 1600 ? 1600 / longest : 1
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let drawn = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return drawn.jpegData(compressionQuality: 0.8)
    }

    private var purchaseSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L("review.purchase")).font(.subheadline.bold())
            TextField(L("review.where"), text: $draft.boughtWhere).textFieldStyle(.roundedBorder)
            TextField(L("review.price"), text: $draft.price).textFieldStyle(.roundedBorder).keyboardType(.decimalPad)
            TextField(L("review.shipCountry"), text: $draft.shipCountry).textFieldStyle(.roundedBorder).textInputAutocapitalization(.characters)
            TextField(L("review.shipDays"), text: $draft.shipDays).textFieldStyle(.roundedBorder).keyboardType(.numberPad)
            Toggle(L("review.sponsored"), isOn: $draft.sponsored)
        }
    }
}

// Review details on a post: writer-chosen chips, photos, and the buyer's own purchase note.
struct ReviewInfo: View {
    let post: CommunityPost
    private var chips: [String] {
        var out: [String] = []
        if post.sponsored == true { out.append(L("review.sponsoredTag")) }
        if let v = post.usedFor { out.append(L("review.used." + v)) }
        if let v = post.skinType { out.append(L("skin." + v)) }
        if let v = post.skinTone { out.append(L("tone." + v)) }
        if let v = post.undertone { out.append(L("under." + v)) }
        if let v = post.climate { out.append(L("climate." + v)) }
        if let v = post.goal, !v.isEmpty { out.append(v) }
        return out
    }
    private var purchase: String {
        var parts: [String] = []
        if let w = post.boughtWhere, !w.isEmpty { parts.append(w) }
        if let m = post.boughtPriceMinor {
            let amount = Double(m) / 100
            parts.append(post.boughtCurrency == nil || post.boughtCurrency == "USD" ? usd(amount) : "\(amount) \(post.boughtCurrency ?? "")")
        }
        if let c = post.shipCountry, let d = post.shipDays { parts.append(L("review.shipped", ["country": c, "days": d])) }
        return parts.joined(separator: " · ")
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !chips.isEmpty {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 70), spacing: 6)], alignment: .leading, spacing: 6) {
                    ForEach(chips, id: \.self) { Text($0).font(.caption).padding(.vertical, 4).padding(.horizontal, 10).background(Color.indigo.opacity(0.1), in: Capsule()) }
                }
            }
            if let photos = post.photos, !photos.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(photos, id: \.self) { path in
                            RemoteImage(url: ChatAPI.photoURL(path), label: "").frame(width: 160, height: 160).clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                    }
                }
            }
            if !purchase.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    Text(L("review.buyerInfo")).font(.caption.bold())
                    Text(purchase).font(.caption)
                }.padding(10).frame(maxWidth: .infinity, alignment: .leading).background(Color.gray.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
            }
        }
    }
}

// MARK: Saved posts

struct SavedPostsSection: View {
    @State private var posts = SavedPosts.all
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !posts.isEmpty {
                Text(L("saved.posts")).font(.title3.bold()).padding(.bottom, 8)
                ForEach(posts) { p in
                    NavigationLink { SavedPostLoader(saved: p) } label: {
                        HStack(spacing: 8) {
                            KindBadge(kind: p.kind)
                            Text(p.title).font(.subheadline).foregroundStyle(.primary).lineLimit(2).multilineTextAlignment(.leading)
                            Spacer(minLength: 0)
                        }.padding(.vertical, 8).contentShape(Rectangle())
                    }.buttonStyle(.plain)
                    Divider()
                }
            }
        }.onAppear { posts = SavedPosts.all }
    }
}
struct SavedPostLoader: View {
    let saved: SavedPost
    @State private var post: CommunityPost?
    @State private var missing = false
    var body: some View {
        Group {
            if let post { PostDetail(post: post) }
            else if missing { Text(L("chat.loadFailed")).foregroundStyle(.secondary) }
            else { ProgressView() }
        }.task {
            if let p = (try? await ChatAPI.posts(ids: [saved.id]))?.first { post = p } else { missing = true }
        }
    }
}

// MARK: Product talk

struct ProductTalk: View {
    let familyKey: String?
    @State private var posts: [CommunityPost]?
    @State private var chatCount = 0
    @State private var blocked = ChatAPI.blocked
    @State private var filter: String?

    private var visible: [CommunityPost] { (posts ?? []).filter { !blocked.contains($0.authorTag) } }
    private var reviews: [CommunityPost] { visible.filter(\.isReview) }
    private var related: [CommunityPost] { visible.filter { !$0.isReview } }
    // "skin:dry" / "tone:fair" for every value present in the reviews.
    private var filters: [String] {
        let skins = Set(reviews.compactMap(\.skinType)).sorted().map { "skin:" + $0 }
        let tones = Set(reviews.compactMap(\.skinTone)).sorted().map { "tone:" + $0 }
        return skins + tones
    }
    private func filterLabel(_ f: String) -> String {
        let parts = f.split(separator: ":").map(String.init)
        return L(parts[0] == "skin" ? "skin." + parts[1] : "tone." + parts[1])
    }
    private var shownReviews: [CommunityPost] {
        guard let f = filter else { return reviews }
        let parts = f.split(separator: ":").map(String.init)
        return reviews.filter { (parts[0] == "skin" ? $0.skinType : $0.skinTone) == parts[1] }
    }

    var body: some View {
        if let familyKey {
            VStack(alignment: .leading, spacing: 12) {
                reviewsSection
                relatedSection
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .task(id: familyKey) { await load(familyKey) }
        }
    }
    @ViewBuilder private var reviewsSection: some View {
        Text(L("product.reviews")).font(.title3.bold())
        if posts == nil { ProgressView() }
        else if reviews.isEmpty { Text(L("product.reviewsEmpty")).font(.subheadline).foregroundStyle(.secondary) }
        else {
            if !filters.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        filterChip(L("product.filterAll"), on: filter == nil) { filter = nil }
                        ForEach(filters, id: \.self) { f in filterChip(filterLabel(f), on: filter == f) { filter = filter == f ? nil : f } }
                    }
                }
                Text(L("product.similarNote")).font(.caption).foregroundStyle(.secondary)
            }
            ForEach(shownReviews) { PostLink(post: $0) }.padding(.horizontal, -16)
        }
    }
    @ViewBuilder private var relatedSection: some View {
        Text(L("product.related")).font(.title3.bold())
        if posts == nil { EmptyView() }
        else if related.isEmpty && chatCount == 0 { Text(L("product.talkEmpty")).font(.subheadline).foregroundStyle(.secondary) }
        else {
            ForEach(related) { PostLink(post: $0) }.padding(.horizontal, -16)
            if chatCount > 0 { Text(L("product.inChat") + " · \(chatCount)").font(.footnote).foregroundStyle(.secondary) }
        }
    }
    private func filterChip(_ text: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text).font(.caption).padding(.vertical, 5).padding(.horizontal, 12)
                .background(on ? Color.indigo.opacity(0.12) : Color(.systemBackground), in: Capsule())
                .overlay(Capsule().stroke(on ? Color.indigo : Color.gray.opacity(0.3), lineWidth: 1))
                .foregroundStyle(on ? Color.indigo : Color.primary)
        }.buttonStyle(.plain)
    }
    private func load(_ key: String) async {
        let mentions = (try? await ChatAPI.mentions(familyKey: key)) ?? []
        chatCount = mentions.filter { $0.source == "chat" }.count
        var ids: [Int] = []
        for m in mentions where m.source != "chat" {
            if let id = m.postId ?? (m.source == "post" || m.source == "review" ? m.sourceId : nil), !ids.contains(id) { ids.append(id) }
        }
        posts = (try? await ChatAPI.posts(ids: ids)) ?? []
    }
}

// Lets ChatRoomView drop its own title when embedded in a topic page.
struct TitleIf: ViewModifier {
    let show: Bool
    let title: String
    @ViewBuilder func body(content: Content) -> some View {
        if show { content.navigationTitle(title).navigationBarTitleDisplayMode(.inline) } else { content }
    }
}
