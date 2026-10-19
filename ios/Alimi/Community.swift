import SwiftUI
import PhotosUI
import UIKit

// Same topic / post / product identity as the web. Profile attributes are chosen per review;
// nothing about skin or identity is inferred, and review text is never sent to event analytics.
struct CommunityPost: Decodable, Identifiable {
    let id: Int
    let room_id, author_tag, nickname, kind, title, body: String
    let item: ChatItem?
    let comments, likes: Int
    let created_at: String
    let used_for, skin_type, skin_tone, undertone, climate, goal: String?
    let photos: [String]
    let bought_where, bought_currency, ship_country: String?
    let bought_price_minor, ship_days: Int?
    let sponsored: Bool
}
struct CommunityComment: Decodable, Identifiable {
    let id: Int
    let author_tag, nickname, body: String
    let item: ChatItem?
}
enum CommunityAPI {
    static let fields = "id,room_id,author_tag,nickname,kind,title,body,item,comments,likes,created_at,used_for,skin_type,skin_tone,undertone,climate,goal,photos,bought_where,bought_currency,ship_country,bought_price_minor,ship_days,sponsored"
    static func get<T: Decodable>(_ table: String, _ query: [String: String]) async throws -> T {
        var c = URLComponents(url: LiveAPI.baseURL.appendingPathComponent("rest/v1/" + table), resolvingAgainstBaseURL: true)!
        c.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        return try JSONDecoder().decode(T.self, from: try await ChatAPI.send(c.url!))
    }
    static func posts(room: String? = nil, family: String? = nil) async throws -> [CommunityPost] {
        if ChatAPI.offline { return [] }
        var q = ["select": fields, "order": "created_at.desc", "limit": "30"]
        if let room { q["room_id"] = "eq." + room }
        if let family {
            struct Mention: Decodable { let post_id: Int? }
            let mentions: [Mention] = try await get("product_mentions", ["select":"post_id", "family_key":"eq." + family, "limit":"100", "order":"created_at.desc"])
            let ids = Array(Set(mentions.compactMap(\.post_id))).sorted()
            if ids.isEmpty { return [] }
            q["id"] = "in.(" + ids.map(String.init).joined(separator: ",") + ")"
        }
        let rows: [CommunityPost] = try await get("community_posts", q)
        return rows.filter { !ChatAPI.blocked.contains($0.author_tag) }
    }
    static func comments(_ id: Int) async throws -> [CommunityComment] {
        if ChatAPI.offline { return [] }
        let rows: [CommunityComment] = try await get("community_comments", ["select":"id,author_tag,nickname,body,item", "post_id":"eq.\(id)", "order":"id.asc", "limit":"200"])
        return rows.filter { !ChatAPI.blocked.contains($0.author_tag) }
    }
    static func itemArgs(_ item: CatalogItem?) -> [String: Any?] {
        ["p_retailer": item?.retailer, "p_market": item?.market, "p_sku": item?.sku]
    }
    static func create(room: String, kind: String, title: String, body: String, item: CatalogItem?, review: [String: Any], fromMessage: Int? = nil) async throws -> CommunityPost {
        guard !ChatAPI.offline else { throw ChatAPI.Failure(message: "offline") }
        var q = itemArgs(item)
        q.merge(["p_secret": ChatAPI.secret, "p_room": room, "p_kind": kind, "p_title": title, "p_body": body,
                 "p_reasons": [String](), "p_from_message": fromMessage, "p_review": review]) { _, v in v }
        return try JSONDecoder().decode(CommunityPost.self, from: try await ChatAPI.rpc("create_post", q))
    }
    static func comment(post: Int, body: String, item: CatalogItem?) async throws {
        guard !ChatAPI.offline else { throw ChatAPI.Failure(message: "offline") }
        var q = itemArgs(item)
        q.merge(["p_secret": ChatAPI.secret, "p_post": post, "p_body": body]) { _, v in v }
        _ = try await ChatAPI.rpc("add_comment", q)
    }
    static func report(target: String, id: Int, reason: String) async throws {
        guard !ChatAPI.offline else { throw ChatAPI.Failure(message: "offline") }
        _ = try await ChatAPI.rpc("report_community", ["p_secret": ChatAPI.secret, "p_target": target, "p_id": id, "p_reason": reason])
    }
    static func photoURL(_ path: String) -> URL? {
        guard path.range(of: #"^v1/[0-9a-f-]{36}\.jpg$"#, options: .regularExpression) != nil else { return nil }
        return LiveAPI.baseURL.appendingPathComponent("storage/v1/object/public/review-photos/" + path)
    }
    static func upload(_ selection: PhotosPickerItem) async throws -> String {
        guard !ChatAPI.offline else { throw ChatAPI.Failure(message: "offline") }
        guard let bytes = try await selection.loadTransferable(type: Data.self), bytes.count <= 20_000_000,
              let image = UIImage(data: bytes), image.size.width > 0, image.size.height > 0 else { throw ChatAPI.Failure(message: "chat:photo") }
        let scale = min(1, 1280 / max(image.size.width, image.size.height))
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let flat = UIGraphicsImageRenderer(size: size, format: format).image { c in
            UIColor.white.setFill(); c.fill(CGRect(origin: .zero, size: size)); image.draw(in: CGRect(origin: .zero, size: size))
        }
        // Re-rendering produces fresh pixels without source EXIF / GPS metadata.
        guard let jpeg = flat.jpegData(compressionQuality: 0.75), jpeg.count <= 1_048_576 else { throw ChatAPI.Failure(message: "chat:photo") }
        let path = "v1/" + UUID().uuidString.lowercased() + ".jpg"
        let request = LiveAPI.request(LiveAPI.baseURL.appendingPathComponent("storage/v1/object/review-photos/" + path),
                                      method: "POST", body: jpeg, contentType: "image/jpeg", timeout: 20)
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw ChatAPI.Failure(message: "chat:photo") }
        return path
    }
}

struct CommunityTab: View {
    @EnvironmentObject var store: AlimiStore
    @State private var rooms: [ChatRoom] = []
    @State private var posts: [CommunityPost] = []
    @State private var failed = false
    @State private var loading = true
    var body: some View {
        NavigationStack {
            List {
                Section { Text(L("community.sub")).font(.subheadline).foregroundStyle(.secondary) }
                Section(L("community.topics")) {
                    ForEach(rooms.filter { !$0.isBrand }) { room in
                        NavigationLink { CommunityTopic(room: room) } label: {
                            VStack(alignment: .leading, spacing: 4) { Text(room.title).font(.headline); Text(room.intro).font(.caption).foregroundStyle(.secondary) }
                        }.accessibilityIdentifier("chat-room-" + room.id)
                    }
                }
                Section(L("community.recent")) { ForEach(posts) { p in NavigationLink { CommunityPostView(post: p) } label: { CommunityPostRow(post: p) } } }
                Section(L("community.brandTalk")) {
                    ForEach(rooms.filter(\.isBrand)) { room in NavigationLink(room.title) { CommunityTopic(room: room) } }
                }
                if loading { LoadingCompanion(compact: true) }
                if failed { Button(L("community.retry")) { Task { await load() } }; Text(L("community.loadError")).font(.caption) }
            }.navigationTitle(L("community.title")).refreshable { await load() }.task { await load(); EventLogger.shared.log(.communityOpen) }
        }
    }
    private func load() async {
        loading = true; failed = false; defer { loading = false }
        do { rooms = try await ChatAPI.rooms(); posts = try await CommunityAPI.posts() } catch { failed = true }
    }
}
struct CommunityPostRow: View {
    let post: CommunityPost
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(L("community.kind." + post.kind)).font(.caption).foregroundStyle(Color.alimi)
            Text(post.title).font(.headline)
            Text(post.nickname + " · " + L("community.comments", ["n": post.comments])).font(.caption).foregroundStyle(.secondary)
        }.padding(.vertical, 4)
    }
}
struct CommunityTopic: View {
    @EnvironmentObject var store: AlimiStore
    let room: ChatRoom
    var member = false
    @State private var mode = "posts"
    @State private var posts: [CommunityPost] = []
    @State private var composing = false
    @State private var failed = false
    @State private var agreed = ChatAPI.agreed
    var body: some View {
        VStack(spacing: 0) {
            Picker(L("community.title"), selection: $mode) {
                Text(L("community.posts")).tag("posts"); Text(L("community.live")).tag("live")
            }.pickerStyle(.segmented).padding()
            if mode == "live" {
                if agreed { ChatRoomView(room: room) }
                else { VStack(spacing: 20) { Text(L("chat.rules")); Button(L("community.agree")) { ChatAPI.agreed = true; agreed = true }.accessibilityIdentifier("chat-join") }.padding() }
            } else {
                List {
                    Text(room.intro).font(.subheadline).foregroundStyle(.secondary)
                    Button(L("community.write"), systemImage: "square.and.pencil") { composing = true }
                    ForEach(posts) { p in NavigationLink { CommunityPostView(post: p) } label: { CommunityPostRow(post: p) } }
                    if posts.isEmpty && !failed { Text(L("community.empty")).foregroundStyle(.secondary) }
                    if failed { Button(L("community.retry")) { Task { await load() } }; Text(L("community.loadError")) }
                }.refreshable { await load() }.task { await load() }
            }
        }.navigationTitle(room.title).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 0) {
                        Text(room.title).font(.headline).lineLimit(1)
                        Text(L("chat.members", ["n": room.members])).font(.caption2).foregroundStyle(.secondary)
                    }.accessibilityIdentifier("room-header")
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    if !member && mode == "posts" {
                        Button("+ " + L("room.join")) { mode = "live" }.fontWeight(.bold).accessibilityIdentifier("room-join")
                    }
                    ShareLink(item: ShareLinks.room(room.id), subject: Text(room.title)) { Image(systemName: "square.and.arrow.up") }
                        .accessibilityLabel(L("share.room")).accessibilityIdentifier("room-share")
                }
            }
            .sheet(isPresented: $composing, onDismiss: { Task { await load() } }) { CommunityComposer(room: room).environmentObject(store) }
    }
    private func load() async { do { posts = try await CommunityAPI.posts(room: room.id); failed = false } catch { failed = true } }
}

struct CommunityPostView: View {
    @EnvironmentObject var store: AlimiStore
    let post: CommunityPost
    @State private var comments: [CommunityComment] = []
    @State private var text = ""
    @State private var attachment: CatalogItem?
    @State private var picking = false
    @State private var family: ProductFamily?
    @State private var purchaseRef: String?
    @State private var busy = false
    @State private var notice: String?
    @State private var reportTarget: Int?
    @State private var postBlocked = false
    @State private var agreed = ChatAPI.agreed
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if !postBlocked {
                    Text(L("community.kind." + post.kind)).font(.caption).foregroundStyle(Color.alimi)
                    Text(post.title).font(.title2.bold()); Text(post.nickname).font(.caption).foregroundStyle(.secondary)
                    Text(post.body)
                    if post.kind == "review" { reviewFacts }
                    ForEach(Array(post.photos.enumerated()), id: \.offset) { _, path in
                        if let url = CommunityAPI.photoURL(path) { RemoteImage(url: url, label: L("review.photos")).frame(height: 240) }
                    }
                    if let item = post.item { ItemCard(item: item) { f in purchaseRef = "post-\(post.id)"; family = f; EventLogger.shared.log(.productCardClick, props: ["from": purchaseRef ?? ""]) } }
                    if let whereBought = post.bought_where {
                        VStack(alignment: .leading) {
                            Text(L("review.buyerInfo")).font(.caption.bold()); Text(whereBought)
                            if let price = post.bought_price_minor { Text("\(post.bought_currency ?? "USD") \(String(format: "%.2f", Double(price) / 100))") }
                            if let country = post.ship_country { Text(country + (post.ship_days.map { " · \($0)d" } ?? "")) }
                        }.font(.caption).padding().background(Color.canvas, in: RoundedRectangle(cornerRadius: 12))
                    }
                    HStack {
                        Button(L("community.save"), systemImage: "bookmark") { save() }
                        if post.author_tag != ChatAPI.myTag { Button(L("chat.report")) { reportTarget = post.id } }
                        Button(L("chat.block")) { ChatAPI.block(post.author_tag); postBlocked = true }
                    }.font(.caption)
                }
                Text(L("community.comments", ["n": comments.count])).font(.headline)
                ForEach(comments) { c in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(c.nickname).font(.caption).foregroundStyle(.secondary); Text(c.body)
                        if let item = c.item { ItemCard(item: item) { f in purchaseRef = "comment-\(c.id)"; family = f; EventLogger.shared.log(.productCardClick, props: ["from": purchaseRef ?? ""]) } }
                        if c.author_tag != ChatAPI.myTag {
                            HStack {
                                Button(L("chat.report")) { reportTarget = -c.id }
                                Button(L("chat.block")) { ChatAPI.block(c.author_tag); comments.removeAll { $0.author_tag == c.author_tag } }
                            }.font(.caption)
                        }
                    }; Divider()
                }
            }.padding(20)
        }.safeAreaInset(edge: .bottom) { composer }
            .navigationTitle(L("community.posts")).navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $picking) { ItemPicker { attachment = $0; picking = false }.environmentObject(store) }
            .sheet(item: $family) { FamilySheet(family: $0, ref: purchaseRef).environmentObject(store) }
            .task { await load(); EventLogger.shared.log(.postView, props: ["post": String(post.id), "room": post.room_id]) }
            .alert(notice ?? "", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("OK") {} }
            .confirmationDialog(L("chat.reportTitle"), isPresented: Binding(get: { reportTarget != nil }, set: { if !$0 { reportTarget = nil } })) {
                ForEach(["spam", "abuse", "sexual", "other"], id: \.self) { reason in Button(L("chat.reason." + reason)) { report(reason) } }
            }
    }
    private var reviewFacts: some View {
        VStack(alignment: .leading, spacing: 6) {
            if post.sponsored { Text(L("review.sponsoredTag")).bold() }
            if let v = post.used_for { Text(L("review.used." + v)) }
            if let v = post.skin_type { Text(L("skin." + v)) }
            if let v = post.skin_tone { Text(L("review.tone") + ": " + L("tone." + v)) }
            if let v = post.undertone { Text(L("under." + v)) }
            if let v = post.climate { Text(L("climate." + v)) }
            if let v = post.goal { Text(v) }
            Text(L("about.unverified")).foregroundStyle(.secondary)
        }.font(.caption)
    }
    private var composer: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !agreed { Text(L("chat.rules")).font(.caption); Toggle(L("community.agree"), isOn: $agreed) }
            if let attachment { Chip(text: attachment.name) { self.attachment = nil } }
            HStack {
                Button { picking = true } label: { Image(systemName: "plus") }.accessibilityLabel(L("chat.attach"))
                TextField(L("community.commentPh"), text: $text, axis: .vertical).lineLimit(1...4)
                Button(L("chat.send")) { Task { await send() } }.disabled(busy || !agreed || (text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && attachment == nil))
            }
        }.padding().background(.bar)
    }
    private func load() async { do { comments = try await CommunityAPI.comments(post.id) } catch { notice = L("community.loadError") } }
    private func send() async {
        guard text.count <= 1000 else { notice = L("chat.err.long"); return }
        busy = true; defer { busy = false }
        do { try await CommunityAPI.comment(post: post.id, body: text, item: attachment); text = ""; attachment = nil; ChatAPI.agreed = agreed; await load(); EventLogger.shared.log(.commentCreate, props: ["post": String(post.id)]) }
        catch { notice = L(ChatAPI.errorKey((error as? ChatAPI.Failure)?.message ?? "")) }
    }
    private func save() {
        var ids = UserDefaults.standard.array(forKey: "alimi.saved.posts") as? [Int] ?? []
        if ids.contains(post.id) { ids.removeAll { $0 == post.id } } else { ids.append(post.id) }
        UserDefaults.standard.set(ids, forKey: "alimi.saved.posts"); EventLogger.shared.log(.postSave, props: ["post": String(post.id)])
    }
    private func report(_ reason: String) {
        guard let id = reportTarget else { return }
        Task { do { try await CommunityAPI.report(target: id > 0 ? "post" : "comment", id: abs(id), reason: reason); notice = L("chat.reported") } catch { notice = L("chat.err.other") } }
    }
}

struct CommunityComposer: View {
    @EnvironmentObject var store: AlimiStore
    @Environment(\.dismiss) private var dismiss
    let room: ChatRoom
    var fromMessage: ChatMessage? = nil
    @State private var kind = "question"
    @State private var title = ""
    @State private var text = ""
    @State private var item: CatalogItem?
    @State private var picking = false
    @State private var usedFor = ""
    @State private var skinType = ""
    @State private var tone = ""
    @State private var undertone = ""
    @State private var climate = ""
    @State private var goal = ""
    @State private var whereBought = ""
    @State private var price = ""
    @State private var country = ""
    @State private var shipDays = ""
    @State private var sponsored = false
    @State private var photos: [PhotosPickerItem] = []
    @State private var agreed = ChatAPI.agreed
    @State private var busy = false
    @State private var notice: String?
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker(L("community.posts"), selection: $kind) {
                        ForEach(["question", "recommend", "review"], id: \.self) { Text(L("community.kind." + $0)).tag($0) }
                    }
                    TextField(L("community.titlePh"), text: $title)
                    TextField(L("community.bodyPh"), text: $text, axis: .vertical).lineLimit(4...10)
                    if let item { Chip(text: item.name) { self.item = nil } }
                    Button(L("chat.attach"), systemImage: "plus") { picking = true }
                }
                if kind == "review" {
                    Section(L("community.kind.review")) {
                        choice("review.usedFor", $usedFor, ["first", "weeks", "months", "long"], "review.used.")
                        choice("review.skin", $skinType, ["dry", "oily", "combination", "sensitive", "normal"], "skin.")
                        choice("review.tone", $tone, ["fair", "light", "medium", "tan", "deep"], "tone.")
                        choice("review.undertone", $undertone, ["cool", "warm", "neutral"], "under.")
                        choice("review.climate", $climate, ["humid", "dry", "mixed"], "climate.")
                        TextField(L("review.goal"), text: $goal)
                        Text(L("review.showMine")).font(.caption).foregroundStyle(.secondary)
                    }
                    Section(L("review.photos")) {
                        PhotosPicker(selection: $photos, maxSelectionCount: 4, matching: .images) { Label(L("review.addPhoto") + " (\(photos.count)/4)", systemImage: "photo") }.disabled(busy)
                        if !photos.isEmpty { Button(L("close"), role: .destructive) { photos = [] } }
                        Text(L("review.photoNote")).font(.caption)
                    }
                    Section(L("review.purchase")) {
                        TextField(L("review.where"), text: $whereBought)
                        TextField(L("review.price") + " (USD)", text: $price).keyboardType(.decimalPad)
                        TextField(L("review.shipCountry") + " (US, KR…)", text: $country).textInputAutocapitalization(.characters)
                        TextField(L("review.shipDays"), text: $shipDays).keyboardType(.numberPad)
                        Toggle(L("review.sponsored"), isOn: $sponsored)
                    }
                }
                Section {
                    Text(L("chat.rules")).font(.caption)
                    Toggle(L("community.agree"), isOn: $agreed)
                    Button { Task { await publish() } } label: {
                        if busy { ProgressView() } else { Text(L("community.post")) }
                    }.disabled(busy || !agreed)
                }
            }.disabled(busy)
                .navigationTitle(L("community.write")).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button(L("cancel")) { dismiss() }.disabled(busy) } }
                .sheet(isPresented: $picking) { ItemPicker { item = $0; picking = false }.environmentObject(store) }
                .onAppear {
                    if let message = fromMessage, title.isEmpty && text.isEmpty {
                        text = message.body; title = String(message.body.prefix(100))
                        if let c = message.item { item = CatalogItem(retailer: c.retailer, market: c.market, sku: c.sku, brand: c.brand, brandKo: c.brandKo, name: c.name, category: nil, priceMinor: c.priceMinor, currency: "USD", availability: "unknown", imageUrl: c.imageUrl) }
                    }
                }
                .alert(notice ?? "", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("OK") {} }
        }
    }
    private func choice(_ key: String, _ value: Binding<String>, _ options: [String], _ prefix: String) -> some View {
        Picker(L(key), selection: value) {
            Text("—").tag("")
            ForEach(options, id: \.self) { Text(L(prefix + $0)).tag($0) }
        }
    }
    private func publish() async {
        let heading = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard heading.count >= 2 && heading.count <= 120 else { notice = L("community.titleNeeded"); return }
        guard text.count <= 2000, goal.count <= 60, whereBought.count <= 60 else { notice = L("chat.err.long"); return }
        guard kind != "review" || item != nil else { notice = L("review.needItem"); return }
        var review: [String: Any] = [:]
        if kind == "review" {
            for (key, value) in [("used_for", usedFor), ("skin_type", skinType), ("skin_tone", tone), ("undertone", undertone), ("climate", climate), ("goal", goal), ("bought_where", whereBought)] where !value.isEmpty { review[key] = value }
            if !price.isEmpty {
                guard let amount = Double(price), amount.isFinite, amount > 0, amount <= 100000 else { notice = L("target.invalid"); return }
                review["bought_price_minor"] = Int((amount * 100).rounded()); review["bought_currency"] = "USD"
            }
            if !country.isEmpty {
                guard country.range(of: "^[A-Za-z]{2}$", options: .regularExpression) != nil else { notice = L("review.shipCountry"); return }
                review["ship_country"] = country.uppercased()
            }
            if !shipDays.isEmpty {
                guard let days = Int(shipDays), (0...120).contains(days) else { notice = L("review.shipDays"); return }
                review["ship_days"] = days
            }
            review["sponsored"] = sponsored
        }
        busy = true; defer { busy = false }
        do {
            if kind == "review" {
                var paths: [String] = []
                for photo in photos { paths.append(try await CommunityAPI.upload(photo)) }
                review["photos"] = paths
            }
            _ = try await CommunityAPI.create(room: room.id, kind: kind, title: heading, body: text, item: item, review: review, fromMessage: fromMessage?.id)
            ChatAPI.agreed = agreed; EventLogger.shared.log(.postCreate, props: ["room": room.id, "kind": kind]); dismiss()
        } catch { notice = L((error as? ChatAPI.Failure)?.message == "chat:photo" ? "community.photosError" : ChatAPI.errorKey((error as? ChatAPI.Failure)?.message ?? "")) }
    }
}

// One review lives in the community and is surfaced here by its canonical product family.
struct ProductDiscussion: View {
    let familyKey: String
    @State private var posts: [CommunityPost] = []
    @State private var failed = false
    @State private var skin = ""
    @State private var tone = ""
    private var reviews: [CommunityPost] {
        posts.filter { $0.kind == "review" && (skin.isEmpty || $0.skin_type == skin) && (tone.isEmpty || $0.skin_tone == tone) }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L("product.reviews")).font(.title3.bold())
            Picker(L("review.skin"), selection: $skin) {
                Text(L("all")).tag("")
                ForEach(["dry", "oily", "combination", "sensitive", "normal"], id: \.self) { Text(L("skin." + $0)).tag($0) }
            }
            Picker(L("review.tone"), selection: $tone) {
                Text(L("all")).tag("")
                ForEach(["fair", "light", "medium", "tan", "deep"], id: \.self) { Text(L("tone." + $0)).tag($0) }
            }
            Text(L("about.unverified")).font(.caption).foregroundStyle(.secondary)
            if reviews.isEmpty && !failed { Text(L("product.reviewsEmpty")).font(.subheadline).foregroundStyle(.secondary) }
            ForEach(reviews) { post in NavigationLink { CommunityPostView(post: post) } label: { CommunityPostRow(post: post) }.buttonStyle(.plain) }
            Text(L("product.related")).font(.headline)
            ForEach(posts.filter { $0.kind != "review" }) { post in NavigationLink { CommunityPostView(post: post) } label: { CommunityPostRow(post: post) }.buttonStyle(.plain) }
            if failed { Text(L("community.loadError")).font(.caption); Button(L("community.retry")) { Task { await load() } } }
        }.task(id: familyKey) { await load() }
    }
    private func load() async { do { posts = try await CommunityAPI.posts(family: familyKey); failed = false } catch { failed = true } }
}

struct SavedCommunityPosts: View {
    @State private var posts: [CommunityPost] = []
    @State private var failed = false
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !posts.isEmpty { Text(L("saved.posts")).font(.headline) }
            ForEach(posts) { post in NavigationLink { CommunityPostView(post: post) } label: { CommunityPostRow(post: post) }.buttonStyle(.plain) }
            if failed { Button(L("community.retry")) { Task { await load() } } }
        }.task { await load() }
    }
    private func load() async {
        let ids = UserDefaults.standard.array(forKey: "alimi.saved.posts") as? [Int] ?? []
        guard !ids.isEmpty, !ChatAPI.offline else { posts = []; return }
        do {
            let rows: [CommunityPost] = try await CommunityAPI.get("community_posts", ["select":CommunityAPI.fields, "id":"in.(" + ids.suffix(100).map(String.init).joined(separator: ",") + ")", "limit":"100"])
            posts = rows.filter { !ChatAPI.blocked.contains($0.author_tag) }; failed = false
        } catch { failed = true }
    }
}
