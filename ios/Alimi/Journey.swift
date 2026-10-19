import SwiftUI

// Seoul Beauty journey (same rules as the web app: dist/onboarding.js, dist/room-card.js, dist/share.js).
// Guide: interests + concerns → matching existing rooms. Choices stay on this device and never infer skin facts.

// MARK: Interests

struct Interests: Codable, Equatable {
    var skincare = false
    var makeup = false
    var concerns: [String] = []
    var ageRange: String?
    var skinType: String?
    var done = false
    static let groups = ["skincare", "makeup"]
    // Stable ids shared with the web guide and the user_rooms migration; only labels are translated.
    static let catalog: [(id: String, group: String)] = [
        ("acne", "skincare"), ("dry", "skincare"), ("sensitive", "skincare"), ("pores", "skincare"), ("spots", "skincare"),
        ("firmness", "skincare"), ("sebum", "skincare"), ("toneup", "skincare"), ("trouble", "skincare"),
        ("lip", "makeup"), ("base", "makeup"), ("cushion", "makeup"), ("longwear", "makeup"), ("shade", "makeup"),
    ]
    static let key = "seoulbeauty.interests.v1"
    func has(_ group: String) -> Bool { group == "skincare" ? skincare : group == "makeup" ? makeup : false }
    var visibleConcerns: [String] { Self.catalog.filter { has($0.group) }.map(\.id) }
    var chosenGroup: Bool { skincare || makeup }
    func normalized() -> Interests {
        var n = self
        let allowed = Set(visibleConcerns)
        n.concerns = Self.catalog.map(\.id).filter { allowed.contains($0) && concerns.contains($0) }
        return n
    }
    static func load(_ defaults: UserDefaults = .standard) -> Interests? {
        guard let data = defaults.data(forKey: key), let value = try? JSONDecoder().decode(Interests.self, from: data) else { return nil }
        return value.normalized()
    }
    func save(_ defaults: UserDefaults = .standard) {
        if let data = try? JSONEncoder().encode(normalized()) { defaults.set(data, forKey: Self.key) }
    }
    static func label(_ concern: String) -> String { L("onb.c." + concern) }
}

// MARK: Recommendations

struct RoomPick: Identifiable, Equatable {
    let room: ChatRoom
    let matched: [String]
    let popular: Bool
    var id: String { room.id }
}
enum Recommend {
    // Seed rooms without a concerns column fall back to this mapping (same as the web).
    static let roomConcerns: [String: [String]] = ["acne": ["acne", "trouble", "sebum"], "dry-sensitive": ["sensitive", "dry"],
                                                   "routine": ["pores", "spots", "firmness", "toneup"], "makeup": ["lip", "base", "cushion", "longwear", "shade"]]
    static let tagGroup = ["skin": "skincare", "makeup": "makeup"]
    static func concerns(of room: ChatRoom) -> [String] { room.concerns ?? roomConcerns[room.id] ?? [] }
    // Matched concerns first, then the chosen field, then recent activity; nothing chosen → busiest topics.
    static func rooms(_ rooms: [ChatRoom], _ sel: Interests?, limit: Int = 3) -> [RoomPick] {
        let topics = rooms.filter { !$0.isBrand }
        let order = Dictionary(topics.enumerated().map { ($1.id, $0) }, uniquingKeysWith: { a, _ in a })
        func active(_ r: ChatRoom) -> Int { min(r.messages24h, 50) }
        func busier(_ a: ChatRoom, _ b: ChatRoom) -> Bool { active(a) != active(b) ? active(a) > active(b) : (order[a.id] ?? 0) < (order[b.id] ?? 0) }
        if let sel {
            let chosen = sel.visibleConcerns.filter { sel.concerns.contains($0) }
            var picked: [(pick: RoomPick, score: Int)] = []
            for room in topics {
                let group = room.tag.flatMap { tagGroup[$0] }
                if let group, !sel.has(group) { continue }
                let tags = concerns(of: room)
                let matched = chosen.filter { tags.contains($0) }
                if matched.isEmpty && group == nil { continue }
                picked.append((RoomPick(room: room, matched: matched, popular: false), matched.count * 4 + (group == nil ? 0 : 2) + (sel.skincare && ((sel.skinType == "dry" && tags.contains("dry")) || (sel.skinType == "oily" && tags.contains("sebum"))) ? 1 : 0)))
            }
            picked.sort { $0.score != $1.score ? $0.score > $1.score : busier($0.pick.room, $1.pick.room) }
            if !picked.isEmpty { return Array(picked.prefix(limit).map(\.pick)) }
        }
        return Array(topics.sorted(by: busier).prefix(limit).map { RoomPick(room: $0, matched: [], popular: true) })
    }
}

// MARK: Room pictures (a catalog product of the room's category; never reused between rooms)

enum RoomPictures {
    static let roomCategory = ["acne": "에센스·세럼", "dry-sensitive": "크림·로션", "routine": "토너·패드", "sunscreen": "선케어", "makeup": "립", "korea-shopping": "마스크팩"]
    static let concernCategory = ["acne": "에센스·세럼", "dry": "크림·로션", "sensitive": "토너·패드", "pores": "토너·패드", "spots": "에센스·세럼",
                                  "firmness": "크림·로션", "sebum": "토너·패드", "toneup": "에센스·세럼", "trouble": "에센스·세럼",
                                  "lip": "립", "base": "베이스메이크업", "cushion": "베이스메이크업", "longwear": "베이스메이크업", "shade": "베이스메이크업"]
    static func category(_ room: ChatRoom) -> String? {
        roomCategory[room.id] ?? (room.concerns?.first).flatMap { concernCategory[$0] }
            ?? (room.tag == "skin" ? "에센스·세럼" : room.tag == "makeup" ? "베이스메이크업" : nil)
    }
    static func assign(_ rooms: [ChatRoom], byCategory: [String: [URL]]) -> [String: URL] {
        var out: [String: URL] = [:], taken = Set<URL>()
        for room in rooms where out[room.id] == nil {
            let candidates = (byCategory[category(room) ?? "전체"] ?? []) + (byCategory["전체"] ?? [])
            if let pic = candidates.first(where: { !taken.contains($0) }) { out[room.id] = pic; taken.insert(pic) }
        }
        return out
    }
}

// MARK: Seen rooms and sharing

enum Seen {
    static let key = "seoulbeauty.seen.v1"
    static func all(_ d: UserDefaults = .standard) -> [String: String] { d.dictionary(forKey: key) as? [String: String] ?? [:] }
    static func mark(_ room: String, _ createdAt: String?, _ d: UserDefaults = .standard) {
        guard let createdAt else { return }
        var seen = all(d)
        if (seen[room] ?? "") >= createdAt { return }
        seen[room] = createdAt
        d.set(seen, forKey: key)
    }
    // Only claim "new" when this device has looked before and something arrived since.
    static func hasNew(_ lastAt: String?, since seenAt: String?) -> Bool {
        guard let lastAt, let seenAt else { return false }
        return lastAt > seenAt
    }
}
enum ShareLinks {
    static let site = URL(string: "https://alimi-omega.vercel.app/")!
    static func room(_ id: String) -> URL { link(["room": id]) }
    static func product(_ key: String) -> URL { link(["product": key]) }
    private static func link(_ params: [String: String]) -> URL {
        var c = URLComponents(url: site, resolvingAgainstBaseURL: false)!
        c.queryItems = params.map { URLQueryItem(name: $0.key, value: $0.value) }
        return c.url!
    }
}

// MARK: Home data

struct JoinedRoom: Identifiable { let room: ChatRoom; let last: ChatAPI.Last?; var id: String { room.id } }

@MainActor
final class CommunityHomeModel: ObservableObject {
    @Published var rooms: [ChatRoom] = []
    @Published var posts: [CommunityPost] = []
    @Published var joined: [JoinedRoom] = []
    @Published var pictures: [String: URL] = [:]
    @Published var popular: [ProductFamily] = []
    @Published var brands: [CatalogBrand]?
    @Published var loading = true
    @Published var failed = false
    var topics: [ChatRoom] { rooms.filter { !$0.isBrand } }
    var hot: [ChatRoom] { Array(topics.filter { $0.messages24h > 0 }.sorted { ($0.lastMessageAt ?? "") > ($1.lastMessageAt ?? "") }.prefix(6)) }
    var canCreateRooms: Bool { rooms.contains { $0.concerns != nil } }
    func load(store: AlimiStore) async {
        loading = true; failed = false
        defer { loading = false }
        do { rooms = try await ChatAPI.rooms() } catch { failed = true; return }
        posts = (try? await CommunityAPI.posts()) ?? []
        joined = ((try? await ChatAPI.myRooms(all: rooms)) ?? []).map { JoinedRoom(room: $0.room, last: $0.last) }
        if popular.isEmpty { await loadPictures(store: store) }
    }
    private func loadPictures(store: AlimiStore) async {
        let cats = Array(Set(topics.compactMap(RoomPictures.category) + ["전체"]))
        var byCategory: [String: [URL]] = [:]
        for cat in cats {
            let page = await store.familiesPage(category: cat, offset: 0) ?? []
            byCategory[cat] = page.prefix(6).compactMap(\.imageUrl)
            if cat == "전체" { popular = Array(page.filter { $0.imageUrl != nil }.prefix(6)) }
        }
        pictures = RoomPictures.assign(hot + topics, byCategory: byCategory)
    }
    func loadBrands(store: AlimiStore) async { if brands == nil { brands = await store.brands() ?? [] } }
}

// MARK: Shared pieces

extension Color {
    static let sbSurface = Color(rgb: 0xF1F6FF)
    static let sbBorder = Color(rgb: 0xDCE8F8)
    static let sbInk = Color(rgb: 0x17233D)
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0, widest: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(ProposedViewSize(width: width.isFinite ? width : nil, height: nil))
            if x > 0 && x + s.width > width { y += row + spacing; x = 0; row = 0 }
            x += s.width + spacing; row = max(row, s.height); widest = max(widest, x - spacing)
        }
        return CGSize(width: min(widest, width), height: y + row)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
            if x > bounds.minX && x + s.width > bounds.maxX { y += row + spacing; x = bounds.minX; row = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing; row = max(row, s.height)
        }
    }
}

struct ChoiceChip: View {
    let label: String
    let on: Bool
    var wide = false
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if on { Image(systemName: "checkmark").font(.caption.weight(.bold)) }
                Text(label).font(.subheadline.weight(on ? .semibold : .regular))
            }
            .padding(.horizontal, 14).frame(minWidth: wide ? 112 : 0, minHeight: 40)
            .foregroundStyle(on ? Color.white : Color.sbInk)
            .background(on ? Color.alimi : Color.white, in: RoundedRectangle(cornerRadius: wide ? 12 : 20))
            .overlay(RoundedRectangle(cornerRadius: wide ? 12 : 20).stroke(on ? Color.alimi : Color.sbBorder))
        }.buttonStyle(.plain).accessibilityAddTraits(on ? .isSelected : [])
    }
}

struct RoomThumb: View {
    let room: ChatRoom
    let picture: URL?
    // nil: fill the available width as a square (trending cards share the row in thirds).
    var size: CGFloat? = 56
    var body: some View {
        let radius = (size ?? 100) * 0.2
        let base = ZStack {
            Rectangle().fill(room.tag == "makeup" ? Color(rgb: 0xFDECEF) : Color(rgb: 0xEAF3FF))
            if let picture { RemoteThumb(url: picture) }
            else { Image(systemName: symbol).font(.system(size: (size ?? 100) * 0.4)).foregroundStyle(room.tag == "makeup" ? Color(rgb: 0xE0516B) : Color.alimi) }
        }
        if let size { base.frame(width: size, height: size).clipShape(RoundedRectangle(cornerRadius: radius)) }
        else { base.aspectRatio(1, contentMode: .fit).frame(maxWidth: .infinity).clipShape(RoundedRectangle(cornerRadius: radius)) }
    }
    private var symbol: String {
        switch room.tag { case "skin": "drop"; case "makeup": "paintbrush.pointed"; case "deals": "tag"; case "travel": "airplane"; default: "bubble.left.and.bubble.right" }
    }
}
// Square photo that fills its frame (RemoteImage fits; thumbnails crop).
struct RemoteThumb: View {
    let url: URL
    @State private var image: UIImage?
    var body: some View {
        ZStack { Color.white; if let image { Image(uiImage: image).resizable().scaledToFill() } }
            .task(id: url) { image = ImageCache.shared.image(for: url); if image == nil { image = await ImageCache.shared.load(url) } }
    }
}

struct RoomListCard: View {
    let room: ChatRoom
    var picture: URL?
    var note: String?
    var highlight: [String] = []
    var fresh = false
    var body: some View {
        HStack(spacing: 12) {
            RoomThumb(room: room, picture: picture)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(room.title).font(.headline).foregroundStyle(Color.sbInk).lineLimit(1)
                    if fresh {
                        Text(L("home.newMessages")).font(.caption2.bold()).foregroundStyle(.white)
                            .padding(.horizontal, 7).padding(.vertical, 1).background(Color.alimi, in: Capsule())
                    }
                }
                Text(stats).font(.caption).foregroundStyle(.secondary)
                if let note, !note.isEmpty { Text(note).font(.caption).foregroundStyle(Color(rgb: 0x5B6B85)).lineLimit(1) }
                let tags = Recommend.concerns(of: room).prefix(3)
                if !tags.isEmpty {
                    FlowLayout(spacing: 6) {
                        ForEach(Array(tags), id: \.self) { id in
                            Text("#" + Interests.label(id).replacingOccurrences(of: " ", with: ""))
                                .font(.caption2.weight(highlight.contains(id) ? .bold : .regular))
                                .foregroundStyle(highlight.contains(id) ? Color.alimi : Color(rgb: 0x5D7CB3))
                        }
                    }
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
        }
        .padding(10)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.sbBorder))
        .contentShape(Rectangle())
    }
    // Real numbers only: members from the room list, "active now" only with messages in the last 24h.
    private var stats: String {
        [L("chat.members", ["n": room.members]), room.messages24h > 0 ? L("room.liveNow") : ""].filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

struct SectionHead<Trailing: View>: View {
    let title: String
    var sub: String? = nil
    @ViewBuilder var trailing: Trailing
    var body: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.title3.bold()).foregroundStyle(Color.sbInk)
                if let sub { Text(sub).font(.caption).foregroundStyle(.secondary) }
            }
            Spacer()
            trailing
        }.padding(.top, 18)
    }
}
extension SectionHead where Trailing == EmptyView {
    init(title: String, sub: String? = nil) { self.init(title: title, sub: sub) { EmptyView() } }
}

// MARK: Community home (추천 / 대화방 / 발견 / 브랜드)

enum HomeTab: String, CaseIterable { case rec, rooms, discover, brands }

struct CommunityHome: View {
    @EnvironmentObject var store: AlimiStore
    @StateObject private var model = CommunityHomeModel()
    @State private var tab = HomeTab.rec
    @State private var interests = Interests.load()
    @State private var creating = false
    @State private var openFamily: ProductFamily?
    @State private var path = NavigationPath()
    // A room picked at the end of onboarding opens here; the guide itself is a full-screen flow (Onboarding.swift).
    @Binding var openRoom: ChatRoom?
    var onEditInterests: () -> Void = {}
    var onSearch: () -> Void = {}
    var onMyRooms: () -> Void = {}
    var onAlerts: () -> Void = {}
    var unreadAlerts = 0
    @StateObject private var revisit = RevisitModel()
    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    header
                    tabs
                    Button { creating = true } label: { InlineActionLabel(title: L("room.new"), icon: "plus").frame(maxWidth: .infinity, minHeight: 44) }
                        .buttonStyle(.borderedProminent).accessibilityIdentifier("create-room")
                    content
                    if model.loading { LoadingCompanion(compact: true) }
                    if model.failed {
                        Text(L("community.loadError")).font(.caption).foregroundStyle(.secondary)
                        Button(L("community.retry")) { Task { await model.load(store: store) } }
                    }
                }.padding(.horizontal, 16).padding(.bottom, 24)
            }
            .refreshable { await model.load(store: store) }
            .navigationDestination(for: ChatRoom.self) { room in CommunityTopic(room: room, member: model.joined.contains { $0.room.id == room.id }, picture: model.pictures[room.id]) }
            .navigationDestination(for: CatalogBrand.self) { BrandView(brand: $0) }
            .navigationDestination(for: CommunityPost.ID.self) { id in
                if let post = model.posts.first(where: { $0.id == id }) { CommunityPostView(post: post) }
            }
            .toolbar(.hidden, for: .navigationBar)
            .task { if model.rooms.isEmpty { await model.load(store: store) }; await revisit.load(store: store); EventLogger.shared.log(.communityOpen) }
            .sheet(item: $openFamily) { FamilySheet(family: $0).environmentObject(store) }
            .sheet(isPresented: $creating, onDismiss: { Task { await model.load(store: store) } }) {
                CreateRoomSheet(interests: Interests.load()) { room in creating = false; path.append(room) }
            }
            .onChange(of: openRoom) { _, room in if let room { tab = .rec; path.append(room); openRoom = nil } }
            .onAppear { interests = Interests.load() }
        }
    }
    private var header: some View {
        ZStack {
            Image("SeoulBeautyLogo").resizable().scaledToFit().frame(height: 58).accessibilityLabel("Seoul Beauty")
            HStack {
                AlertBell(unread: unreadAlerts, action: onAlerts)
                Spacer()
                Button(action: onSearch) { Image(systemName: "magnifyingglass").font(.system(size: 24, weight: .medium)).foregroundStyle(Color.sbNavy).frame(width: 44, height: 44) }
                    .accessibilityLabel(L("search.title")).accessibilityIdentifier("home-search")
            }
        }.padding(.top, 6)
    }
    private var tabs: some View {
        HStack(spacing: 0) {
            ForEach(HomeTab.allCases, id: \.self) { t in
                Button { tab = t; if t == .brands { Task { await model.loadBrands(store: store) } } } label: {
                    VStack(spacing: 10) {
                        Text(L("home.tab." + t.rawValue)).font(.system(size: 18, weight: tab == t ? .bold : .regular)).lineLimit(1).minimumScaleFactor(0.8)
                            .foregroundStyle(tab == t ? Color.sbBlue : Color.sbGray)
                        Rectangle().fill(tab == t ? Color.sbBlue : Color.clear).frame(height: 3)
                    }.frame(maxWidth: .infinity)
                }.buttonStyle(.plain).accessibilityIdentifier("home-tab-" + t.rawValue)
                    .accessibilityAddTraits(tab == t ? .isSelected : [])
            }
        }.overlay(alignment: .bottom) { Rectangle().fill(Color.sbBorder).frame(height: 1) }
    }
    @ViewBuilder private var content: some View {
        switch tab {
        case .rec: recommended
        case .rooms: allRooms
        case .discover: discover
        case .brands: brands
        }
    }
    @ViewBuilder private var recommended: some View {
        if !revisit.activity.isEmpty {
            WelcomeBanner().padding(.top, 14)
            BigHead(title: L("rooms.mine"), sub: "", more: onMyRooms)
            ForEach(revisit.activity.prefix(2)) { act in
                NavigationLink(value: act.room) { JoinedRoomCard(act: act, fallback: model.pictures[act.room.id]) }
                    .buttonStyle(.plain).accessibilityIdentifier("chat-room-" + act.room.id)
            }
        }
        if !model.hot.isEmpty {
            BigHead(title: L("home.trending"), sub: L("home.trendingSub")) { tab = .rooms }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 14) {
                    ForEach(model.hot) { room in
                        NavigationLink(value: room) {
                            VStack(alignment: .leading, spacing: 8) {
                                RoomThumb(room: room, picture: model.pictures[room.id], size: 150)
                                Text(room.title).font(.system(size: 17, weight: .heavy)).foregroundStyle(Color.sbNavy).lineLimit(1).frame(width: 150, alignment: .leading)
                                Text(L("room.newToday", ["n": room.messages24h])).font(.system(size: 14)).foregroundStyle(Color.sbGray)
                            }
                        }.buttonStyle(.plain).accessibilityIdentifier("chat-room-" + room.id)
                    }
                }.padding(.horizontal, 2)
            }
        }
        BigHead(title: L("home.recRooms"), sub: L("home.recRoomsSub")) { tab = .rooms }
        let picks = (interests?.done == true && interests?.chosenGroup == true) ? Recommend.rooms(model.rooms, interests, limit: 4).map(\.room) : Array((model.hot.isEmpty ? model.topics : model.hot).prefix(4))
        VStack(spacing: 14) {
            ForEach(picks) { room in
                NavigationLink(value: room) { PickCard(room: room, picture: model.pictures[room.id], highlight: interests?.concerns ?? [], showIntro: false) }
                    .buttonStyle(.plain).accessibilityIdentifier("chat-room-" + room.id)
            }
        }
        NavigationLink { ShareHubView() } label: {
            HStack(spacing: 14) {
                Image("ShareFriends").resizable().scaledToFill().frame(width: 92, height: 64).clipShape(RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 4) {
                    Text(L("share.hubTitle")).font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.sbNavy).lineLimit(2)
                    Text(L("share.hubSub")).font(.system(size: 13)).foregroundStyle(Color.sbGray).lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
            }.padding(12).background(Color.sbTagBg.opacity(0.6), in: RoundedRectangle(cornerRadius: 18))
        }.buttonStyle(.plain).padding(.top, 18).accessibilityIdentifier("share-hub")
        Button(L(interests?.chosenGroup == true ? "onb.edit" : "onb.manage"), action: onEditInterests).font(.footnote).padding(.top, 4)
            .accessibilityIdentifier("edit-interests")
    }
    @ViewBuilder private var allRooms: some View {
        SectionHead(title: L("home.topics"), sub: L("home.askHint")) {
            EmptyView()
        }
        ForEach(model.topics) { room in roomLink(room, note: room.intro) }
    }
    @ViewBuilder private var discover: some View {
        if !model.popular.isEmpty {
            SectionHead(title: L("home.popular"), sub: L("home.popularSub"))
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10, alignment: .top), count: 3), spacing: 12) {
                ForEach(model.popular) { f in
                    Button { openFamily = f } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            RemoteImage(url: f.imageUrl, label: f.brandLabel).frame(height: 100)
                                .background(Color.white).clipShape(RoundedRectangle(cornerRadius: 12))
                            Text(f.brandLabel).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                            Text(f.baseName).font(.caption).foregroundStyle(Color.sbInk).lineLimit(2)
                            Text(f.priceText).font(.caption.bold()).foregroundStyle(Color.sbInk)
                        }
                    }.buttonStyle(.plain).accessibilityIdentifier("popular-" + f.familyKey)
                }
            }
        }
        if !model.posts.isEmpty {
            SectionHead(title: L("home.questions"))
            ForEach(model.posts.prefix(6)) { p in
                NavigationLink(value: p.id) { CommunityPostRow(post: p).frame(maxWidth: .infinity, alignment: .leading) }.buttonStyle(.plain)
                Divider()
            }
        }
    }
    @ViewBuilder private var brands: some View {
        SectionHead(title: L("brands.title"))
        if let list = model.brands {
            if list.isEmpty { Text(L("home.noBrands")).font(.caption).foregroundStyle(.secondary) }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                ForEach(list) { b in
                    NavigationLink(value: b) {
                        HStack(spacing: 10) {
                            BrandBadge(brand: b, size: 40, showLabel: false)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(b.label).font(.subheadline.bold()).foregroundStyle(Color.sbInk).lineLimit(1)
                                Text(L("count", ["n": b.families])).font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                        }.padding(10).background(Color.white, in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.sbBorder))
                    }.buttonStyle(.plain).accessibilityIdentifier("home-brand-" + b.brand)
                }
            }
        } else { LoadingCompanion(compact: true) }
    }
    private func roomLink(_ room: ChatRoom, note: String?, fresh: Bool = false) -> some View {
        NavigationLink(value: room) { RoomListCard(room: room, picture: model.pictures[room.id], note: note, fresh: fresh) }
            .buttonStyle(.plain).accessibilityIdentifier("chat-room-" + room.id)
    }
}

// Section title of the community home (journey 2): large title, subtitle, 전체보기 ›.
struct BigHead: View {
    let title: String
    let sub: String
    let more: () -> Void
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(.system(size: 25, weight: .heavy)).foregroundStyle(Color.sbNavy)
                if !sub.isEmpty { Text(sub).font(.system(size: 16)).foregroundStyle(Color.sbGray) }
            }
            Spacer()
            Button(action: more) {
                InlineActionLabel(title: L("home.seeAll"), icon: "chevron.right").frame(minHeight: 44).font(.system(size: 16)).foregroundStyle(Color.sbBlue)
            }.buttonStyle(.plain)
        }.padding(.top, 26).padding(.bottom, 14)
    }
}

// MARK: Create room

struct CreateRoomSheet: View {
    @Environment(\.dismiss) private var dismiss
    let interests: Interests?
    let created: (ChatRoom) -> Void
    @State private var title = ""
    @State private var intro = ""
    @State private var tag = "talk"
    @State private var concerns: [String] = []
    @State private var error = ""
    @State private var busy = false
    private var offered: [String] {
        Interests.catalog.filter { tag == "skin" ? $0.group == "skincare" : tag == "makeup" ? $0.group == "makeup" : true }.map(\.id)
    }
    var body: some View {
        NavigationStack {
            Form {
                Section { Text(L("room.newHint")).font(.caption).foregroundStyle(.secondary) }
                Section {
                    TextField(L("room.titlePh"), text: $title).accessibilityIdentifier("room-title")
                    TextField(L("room.introPh"), text: $intro, axis: .vertical).lineLimit(2...3)
                }
                Section(L("room.field")) {
                    Picker(L("room.field"), selection: $tag) { ForEach(["talk", "skin", "makeup"], id: \.self) { Text(L("room.tag." + $0)).tag($0) } }
                        .pickerStyle(.segmented)
                        .onChange(of: tag) { _, _ in concerns = concerns.filter { offered.contains($0) } }
                }
                Section(L("room.concerns")) {
                    FlowLayout {
                        ForEach(offered, id: \.self) { id in
                            ChoiceChip(label: Interests.label(id), on: concerns.contains(id)) {
                                if let i = concerns.firstIndex(of: id) { concerns.remove(at: i) } else { concerns.append(id) }
                            }
                        }
                    }
                }
                Section {
                    Text(L("room.note")).font(.caption).foregroundStyle(.secondary)
                    if !error.isEmpty { Text(error).font(.footnote).foregroundStyle(.red).accessibilityIdentifier("room-error") }
                    Button(L("room.create")) { Task { await submit() } }.disabled(busy).accessibilityIdentifier("room-submit")
                }
            }
            .navigationTitle(L("room.new")).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(L("close")) { dismiss() } } }
            .onAppear {
                if let i = interests { tag = i.skincare && !i.makeup ? "skin" : i.makeup && !i.skincare ? "makeup" : "talk"; concerns = i.concerns.filter { offered.contains($0) } }
            }
        }
    }
    private func submit() async {
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard clean.count >= 3 else { error = L("chat.err.short"); return }
        busy = true; error = ""
        defer { busy = false }
        do {
            let id = try await ChatAPI.createRoom(title: clean, intro: intro, tag: tag, concerns: concerns)
            let room = (try? await ChatAPI.rooms())?.first { $0.id == id }
            if let room { created(room) } else { dismiss() }
        } catch { self.error = L(ChatAPI.errorKey("\(error)")) }
    }
}
