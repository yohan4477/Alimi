import SwiftUI

enum MainTab: Hashable { case home, saved, chat }

// Pure layout rules for the Saved tab: the grid is padded to three slots and the headline depends on the count.
enum SavedLayout {
    static let goal = 3
    static func emptySlots(_ count: Int) -> Int { max(0, goal - count) }
    static func headline(_ count: Int) -> (key: String, vars: [String: Int]) {
        if count <= 0 { return ("saved.hint", [:]) }
        if count < goal { return ("saved.hintMore", ["n": goal - count]) }
        return ("saved.count", ["n": count])
    }
}

// MARK: Saved

struct SavedView: View {
    @EnvironmentObject var store: AlimiStore
    @Binding var section: String
    var editInterests: () -> Void = {}
    var onSearch: () -> Void = {}
    var onAlerts: () -> Void = {}
    var unreadAlerts = 0
    @State private var joined: [JoinedRoom] = []
    @State private var recent: [ProductFamily] = []
    @State private var openFamily: ProductFamily?
    private var items: [Product] { store.products.filter { store.saved.favorites.contains($0.id) } }
    // 내 활동 of journey 3: saved products / joined rooms / recently viewed, each as photo rows.
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 12) {
                        Spacer()
                        Button(action: onSearch) { Image(systemName: "magnifyingglass").font(.system(size: 23, weight: .medium)).frame(width: 44, height: 44) }.accessibilityLabel(L("search.title"))
                        AlertBell(unread: unreadAlerts, action: onAlerts)
                        NavigationLink { SettingsView() } label: { Image(systemName: "gearshape").font(.system(size: 21, weight: .medium)).frame(width: 44, height: 44) }
                            .accessibilityLabel(L("settings.open")).accessibilityIdentifier("settings-button")
                    }.foregroundStyle(Color.sbNavy)
                    Text(L("nav.activity")).font(.system(size: 32, weight: .heavy)).foregroundStyle(Color.sbNavy).accessibilityIdentifier("saved-title")
                    HStack(spacing: 4) {
                        ForEach(["saved", "rooms", "recent"], id: \.self) { s in
                            Button { section = s; if s == "recent" { recent = RecentViews.all() } } label: {
                                Text(L("activity.tab." + s)).font(.system(size: 16, weight: section == s ? .bold : .medium)).lineLimit(1).minimumScaleFactor(0.8)
                                    .foregroundStyle(section == s ? Color.white : Color(rgb: 0x3B4A63))
                                    .frame(maxWidth: .infinity, minHeight: 50).background(section == s ? Color.sbBlue : Color.clear, in: RoundedRectangle(cornerRadius: 14))
                            }.buttonStyle(.plain).accessibilityIdentifier("activity-tab-" + s).accessibilityAddTraits(section == s ? .isSelected : [])
                        }
                    }.padding(4).background(Color(rgb: 0xEEF3FB), in: RoundedRectangle(cornerRadius: 18))
                    switch section {
                    case "rooms": rooms
                    case "recent": recentList
                    default: savedList
                    }
                    interestsRow.padding(.top, 8)
                    NavigationLink { ShareHubView() } label: {
                        HStack {
                            Image(systemName: "heart.text.square").font(.system(size: 22)).foregroundStyle(Color.sbBlue)
                            Text(L("share.hubTitle")).font(.subheadline.bold()).foregroundStyle(Color.sbNavy)
                            Spacer()
                            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                        }.padding(14).background(Color.sbTagBg.opacity(0.6), in: RoundedRectangle(cornerRadius: 14))
                    }.buttonStyle(.plain).accessibilityIdentifier("share-hub")
                }.padding(20)
            }
            .toolbar(.hidden, for: .navigationBar)
            .sheet(item: $openFamily) { FamilySheet(family: $0).environmentObject(store) }
        }
    }
    @ViewBuilder private var savedList: some View {
        if items.isEmpty {
            Text(L("saved.hint")).font(.subheadline).foregroundStyle(Color.sbGray)
            AddSlot(highlighted: true, action: onSearch)
        }
        ForEach(items) { SavedRow(product: $0) }
        SavedCommunityPosts()
    }
    @ViewBuilder private var recentList: some View {
        if recent.isEmpty { Text(L("activity.recentEmpty")).font(.subheadline).foregroundStyle(Color.sbGray) }
        ForEach(recent) { f in
            Button { openFamily = f } label: {
                HStack(spacing: 12) {
                    RemoteImage(url: f.imageUrl, label: f.brandLabel).frame(width: 80, height: 80).background(Color.white).clipShape(RoundedRectangle(cornerRadius: 14))
                    VStack(alignment: .leading, spacing: 6) {
                        Text(f.brandLabel + " " + f.baseName).font(.system(size: 18, weight: .heavy)).foregroundStyle(Color.sbNavy).lineLimit(2)
                        if let c = f.category { Text(L10n.category(c)).font(.system(size: 15)).foregroundStyle(Color.sbGray) }
                        Text(f.priceText).font(.system(size: 20, weight: .heavy)).foregroundStyle(Color(rgb: 0xF0335A))
                    }
                    Spacer(minLength: 0)
                }.padding(14).background(Color.white, in: RoundedRectangle(cornerRadius: 20))
            }.buttonStyle(.plain)
        }
    }
    // Interests chosen in the guide; tapping reopens it.
    private var interestsRow: some View {
        let p = Interests.load()
        let list = p.map { i in Interests.groups.filter { i.has($0) }.map { L("onb.g." + $0) } + i.concerns.map(Interests.label) } ?? []
        return Button(action: editInterests) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(L("onb.manage")).font(.subheadline.bold())
                    Text(list.isEmpty ? L("onb.none") : list.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
            }.contentShape(Rectangle())
        }.buttonStyle(.plain).foregroundStyle(Color.sbNavy).accessibilityIdentifier("interests-row")
    }
    @ViewBuilder private var rooms: some View {
        let seen = Seen.all()
        if joined.isEmpty { Text(L("chat.mineEmpty")).font(.subheadline).foregroundStyle(.secondary) }
        ForEach(joined) { j in
            NavigationLink { CommunityTopic(room: j.room, member: true) } label: {
                RoomListCard(room: j.room, note: j.last?.body ?? j.room.intro, fresh: Seen.hasNew(j.last?.createdAt, since: seen[j.room.id]))
            }.buttonStyle(.plain).accessibilityIdentifier("my-room-" + j.room.id)
        }
        Color.clear.frame(height: 1).task(id: section) {
            guard let all = try? await ChatAPI.rooms(), let mine = try? await ChatAPI.myRooms(all: all) else { return }
            joined = mine.map { JoinedRoom(room: $0.room, last: $0.last) }
        }
    }
}

// Saved product row (journey 3): photo, name, size/category, price, bookmark to unsave.
struct SavedRow: View {
    @EnvironmentObject var store: AlimiStore
    let product: Product
    @State private var photoLoaded = false
    var body: some View {
        HStack(spacing: 12) {
            NavigationLink { ProductDetail(product: product) } label: {
                HStack(spacing: 12) {
                    ProductArt(product: product) { photoLoaded = $0 }.frame(width: 80, height: 80)
                        .background(Color.white).clipShape(RoundedRectangle(cornerRadius: 14))
                    VStack(alignment: .leading, spacing: 6) {
                        Text(product.brandLabel + " " + product.name).font(.system(size: 18, weight: .heavy)).foregroundStyle(Color.sbNavy).lineLimit(2)
                        Text([product.size, L10n.category(product.category)].filter { !$0.isEmpty }.joined(separator: " · ")).font(.system(size: 15)).foregroundStyle(Color.sbGray).lineLimit(2)
                        Text(usd(product.price)).font(.system(size: 20, weight: .heavy)).foregroundStyle(Color(rgb: 0xF0335A))
                    }
                    Spacer(minLength: 0)
                }
            }
            .buttonStyle(.plain).accessibilityIdentifier("product-\(product.id)")
            .accessibilityValue(photoLoaded ? "photo-loaded" : "photo-missing")
            Button { store.toggle(product.id) } label: {
                Image(systemName: "bookmark.fill").font(.system(size: 24)).foregroundStyle(Color.sbBlue).frame(width: 44, height: 44)
            }.buttonStyle(.plain).accessibilityIdentifier("favorite-\(product.id)").accessibilityLabel(L("favorite.saved"))
        }
        .padding(14).background(Color.white, in: RoundedRectangle(cornerRadius: 20))
    }
}
struct SavedCard: View {
    @EnvironmentObject var store: AlimiStore
    let product: Product
    @State private var photoLoaded = false
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            NavigationLink { ProductDetail(product: product) } label: { info }
                .buttonStyle(.plain).accessibilityIdentifier("product-\(product.id)")
                .accessibilityValue(photoLoaded ? "photo-loaded" : "photo-missing")
            Button { store.toggle(product.id) } label: {
                Image(systemName: "heart.fill").font(.callout).frame(maxWidth: .infinity, minHeight: 36)
            }.accessibilityIdentifier("favorite-\(product.id)").accessibilityLabel(L("favorite.saved"))
        }
    }
    private var info: some View {
        VStack(alignment: .leading, spacing: 4) {
            ProductArt(product: product) { photoLoaded = $0 }.frame(height: 90)
            Text(product.brandLabel).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            Text(product.name).font(.caption).lineLimit(2).frame(minHeight: 32, alignment: .top)
            Text(usd(product.price)).font(.system(size: 15, weight: .bold, design: .rounded))
        }.foregroundStyle(.primary)
    }
}
struct AddSlot: View {
    let highlighted: Bool
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: "plus").font(.title3.weight(.semibold))
                Text(L("saved.add")).font(.caption)
            }
            .foregroundStyle(highlighted ? Color.alimi : Color.secondary)
            .frame(maxWidth: .infinity, minHeight: 130)
            .background(highlighted ? Color.alimi.opacity(0.12) : Color(.systemGray6), in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.alimi, lineWidth: highlighted ? 1.5 : 0))
        }.buttonStyle(.plain).accessibilityIdentifier("saved-add-slot")
    }
}

// MARK: Brand page

struct BrandView: View {
    @EnvironmentObject var store: AlimiStore
    @Environment(\.dismiss) private var dismiss
    let brand: CatalogBrand
    @State private var families: [ProductFamily] = []
    @State private var done = false
    @State private var loading = false
    @State private var failed = false
    @State private var openFamily: ProductFamily?
    @State private var tab = "products"
    @State private var showAll = false
    @State private var reviews: [CommunityPost] = []
    @State private var following = false
    // Brand page of journey 2: banner from the brand's own product photo, logo, product count, follow (this device),
    // categories it sells, then 대표 상품 / 리뷰 (community reviews of this brand).
    private let grid = [GridItem(.adaptive(minimum: 145), spacing: 12, alignment: .top)]
    private var categories: [String] { Array(Set(families.compactMap(\.category))).sorted().prefix(4).map { $0 } }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                banner
                header.padding(.horizontal, 20)
                if !categories.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(categories, id: \.self) { c in
                                Text("#" + L10n.category(c).replacingOccurrences(of: " ", with: "")).font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.sbBlue)
                                    .padding(.horizontal, 14).padding(.vertical, 8).background(Color.sbTagBg, in: Capsule())
                            }
                        }.padding(.horizontal, 20)
                    }.padding(.top, 16)
                }
                tabs.padding(.top, 22)
                if tab == "products" { products } else { reviewList }
            }.padding(.bottom, 24)
        }
        .toolbar(.hidden, for: .navigationBar)
        .task { await loadMore(); following = BrandFollow.isFollowing(brand.brand) }
        .sheet(item: $openFamily) { FamilySheet(family: $0).environmentObject(store) }
    }
    private var banner: some View {
        ZStack(alignment: .top) {
            Color.white
            if let url = families.first?.imageUrl { RemoteImage(url: url, label: brand.label).padding(16) }
            HStack {
                roundButton("chevron.left") { dismiss() }.accessibilityLabel(L("back"))
                Spacer()
                ShareLink(item: ShareLinks.site, subject: Text(brand.label)) {
                    Image(systemName: "square.and.arrow.up").font(.system(size: 18, weight: .medium)).foregroundStyle(Color.sbNavy)
                        .frame(width: 48, height: 48).background(Color.white.opacity(0.85), in: Circle())
                }
            }.padding(.horizontal, 16).padding(.top, 8)
        }.frame(height: 240).clipped()
    }
    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .bottom, spacing: 16) {
                BrandBadge(brand: brand, size: 108, showLabel: false)
                    .padding(4).background(Color.white, in: Circle()).offset(y: -44).padding(.bottom, -44)
                Spacer(minLength: 4)
                Button {
                    following.toggle(); BrandFollow.set(brand.brand, following)
                } label: {
                    InlineActionLabel(title: L(following ? "brand.following" : "brand.follow"), icon: following ? "checkmark" : "plus").font(.system(size: 17, weight: .bold))
                        .foregroundStyle(following ? Color.sbGray : Color.sbBlue)
                        .padding(.horizontal, 18).frame(minHeight: 48).background(Color.sbTagBg, in: Capsule())
                }.buttonStyle(.plain).accessibilityIdentifier("brand-follow")
            }.padding(.top, 12)
            VStack(alignment: .leading, spacing: 4) {
                Text(brand.label).font(.system(size: 26, weight: .heavy)).foregroundStyle(Color.sbNavy)
                    .fixedSize(horizontal: false, vertical: true).accessibilityIdentifier("brand-header-title")
                if brand.families > 0 { Text(L("count", ["n": brand.families])).font(.system(size: 15)).foregroundStyle(Color.sbGray) }
            }
            Text(L("brand.headline", ["brand": brand.label])).font(.system(size: 22, weight: .heavy)).foregroundStyle(Color.sbNavy)
            Text(L("brand.followNote")).font(.system(size: 14)).foregroundStyle(Color.sbGray)
        }
    }
    private var tabs: some View {
        HStack(spacing: 0) {
            ForEach(["products", "reviews"], id: \.self) { t in
                Button { tab = t; if t == "reviews" { Task { await loadReviews() } } } label: {
                    VStack(spacing: 10) {
                        Text(L("brand.tab." + t)).font(.system(size: 17, weight: tab == t ? .bold : .regular)).foregroundStyle(tab == t ? Color.sbBlue : Color.sbGray)
                        Rectangle().fill(tab == t ? Color.sbBlue : Color.clear).frame(height: 3)
                    }.frame(maxWidth: .infinity)
                }.buttonStyle(.plain)
            }
        }.overlay(alignment: .bottom) { Rectangle().fill(Color(rgb: 0xE6EAF1)).frame(height: 1) }
    }
    @ViewBuilder private var products: some View {
        LazyVGrid(columns: grid, spacing: 16) {
            ForEach(showAll ? families : Array(families.prefix(3))) { f in
                VStack(alignment: .leading, spacing: 6) {
                    Button { openFamily = f } label: {
                        RemoteImage(url: f.imageUrl, label: f.brandLabel).frame(height: 120).background(Color.white)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }.buttonStyle(.plain)
                    Text(f.baseName).font(.system(size: 14)).foregroundStyle(Color.sbNavy).lineLimit(2).frame(minHeight: 36, alignment: .top)
                    HStack {
                        Text(f.priceText).font(.system(size: 16, weight: .bold)).foregroundStyle(Color.sbNavy).lineLimit(1).minimumScaleFactor(0.8)
                        Spacer(minLength: 2)
                        Button { openFamily = f } label: {
                            Image(systemName: "cart").font(.system(size: 15)).foregroundStyle(Color.sbBlue).frame(width: 44, height: 44).background(Color.sbTagBg, in: Circle())
                        }.buttonStyle(.plain).accessibilityLabel(L("variant.buy"))
                    }
                }
                .onAppear { if showAll && f.id == families.last?.id { Task { await loadMore() } } }
            }
        }.padding(.horizontal, 20).padding(.top, 18)
        if !showAll && families.count > 3 {
            Button { showAll = true } label: {
                HStack {
                    Image(systemName: "square.grid.2x2").font(.system(size: 18))
                    Text(L("brand.allProducts")).font(.system(size: 16))
                    Spacer()
                    Image(systemName: "chevron.right").font(.system(size: 14)).foregroundStyle(Color.sbGray)
                }.foregroundStyle(Color.sbNavy).padding(.horizontal, 18).frame(minHeight: 54)
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(rgb: 0xE6EAF1)))
            }.buttonStyle(.plain).padding(.horizontal, 20).padding(.top, 16).accessibilityIdentifier("brand-all")
        }
        if loading { LoadingCompanion(compact: true) }
        else if failed {
            VStack(spacing: 8) {
                Text(L("loadFailed")).font(.caption).foregroundStyle(.secondary)
                Button(L("retry")) { Task { await loadMore() } }.accessibilityIdentifier("brand-retry")
            }.frame(maxWidth: .infinity).padding(.top, 12)
        } else if families.isEmpty && done {
            Text(L("brand.empty")).font(.caption).foregroundStyle(.secondary).padding(.horizontal, 20).padding(.top, 16).accessibilityIdentifier("brand-empty")
        }
    }
    @ViewBuilder private var reviewList: some View {
        if reviews.isEmpty { Text(L("brand.noReviews")).font(.subheadline).foregroundStyle(Color.sbGray).padding(20) }
        ForEach(reviews) { p in
            NavigationLink { CommunityPostView(post: p) } label: { CommunityPostRow(post: p).padding(.horizontal, 20).padding(.vertical, 8) }.buttonStyle(.plain)
            Divider().padding(.horizontal, 20)
        }
    }
    private func roundButton(_ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 18, weight: .medium)).foregroundStyle(Color.sbNavy)
                .frame(width: 48, height: 48).background(Color.white.opacity(0.85), in: Circle())
        }.buttonStyle(.plain)
    }
    private func loadReviews() async {
        let posts = (try? await CommunityAPI.posts()) ?? []
        reviews = posts.filter { $0.item?.brand == brand.brand }
    }
    private func loadMore() async {
        guard !loading, !done else { return }
        loading = true
        failed = false
        let page = await store.familiesPage(category: "전체", offset: families.count, brand: brand.brand)
        loading = false
        guard let page else { failed = true; return }
        families.append(contentsOf: page)
        if page.count < 24 { done = true }
    }
}

// Followed brands live on this device only (no account, nothing sent).
enum BrandFollow {
    static let key = "seoulbeauty.brands.followed.v1"
    static func all(_ d: UserDefaults = .standard) -> Set<String> { Set(d.stringArray(forKey: key) ?? []) }
    static func isFollowing(_ brand: String, _ d: UserDefaults = .standard) -> Bool { all(d).contains(brand) }
    static func set(_ brand: String, _ on: Bool, _ d: UserDefaults = .standard) {
        var s = all(d); if on { s.insert(brand) } else { s.remove(brand) }
        d.set(Array(s).sorted(), forKey: key)
    }
}
// MARK: Search

struct SearchView: View {
    @EnvironmentObject var store: AlimiStore
    @State private var query = ""
    @State private var catalog: [CatalogItem]? = []
    @State private var tracking: String?
    @FocusState private var focused: Bool
    private var results: [Product] { store.search(query) }
    private var searching: Bool { CatalogItem.query(query).count >= 2 }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    field
                    if query.trimmingCharacters(in: .whitespaces).isEmpty {
                        Text(L("search.recentEmpty")).font(.subheadline).foregroundStyle(.secondary)
                    } else {
                        trackedResults
                        if searching { catalogSection }
                    }
                }.padding(20)
            }
            .navigationTitle(L("search.title")).navigationBarTitleDisplayMode(.inline)
            .task(id: query) {
                guard searching else { catalog = []; return }
                try? await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled else { return }
                catalog = await store.searchCatalog(query)
            }
            .onAppear { focused = true }
        }
    }
    private var field: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField(L("search.prompt"), text: $query).focused($focused).submitLabel(.search)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .accessibilityIdentifier("search-field")
                .onSubmit {
                    let q = query.trimmingCharacters(in: .whitespaces)
                    if !q.isEmpty { EventLogger.shared.log(.search, props: ["length": String(q.count), "results": String(results.count)]) }
                }
            if !query.isEmpty {
                Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                    .accessibilityLabel(L("search.clear"))
            }
        }.padding(12).background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 12))
    }
    @ViewBuilder private var trackedResults: some View {
        if !results.isEmpty {
            Text(L("section.products")).font(.headline)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 16)], spacing: 24) {
                ForEach(results) { TrackedCard(product: $0) }
            }
        }
    }
    private var catalogSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L("section.more")).font(.headline)
            Text(L("section.moreHint")).font(.caption).foregroundStyle(.secondary)
            catalogRows
        }.padding(.top, 8)
    }
    @ViewBuilder private var catalogRows: some View {
        if let items = catalog {
            if items.isEmpty { Text(L("empty.catalogSearch")).font(.caption).foregroundStyle(.secondary) }
            ForEach(items) { item in
                CatalogRow(item: item, busy: tracking == item.id, disabled: tracking != nil) { start(item) }
            }
        } else {
            Text(L("catalogFailed")).font(.caption).foregroundStyle(.secondary)
        }
    }
    private func start(_ item: CatalogItem) {
        tracking = item.id
        Task {
            if await store.saveCatalogItem(item) { catalog?.removeAll { $0.id == item.id } }
            tracking = nil
        }
    }
}

// MARK: Settings

struct SettingsView: View {
    @EnvironmentObject var store: AlimiStore
    @AppStorage("alimi.lang") private var lang = ""
    @ObservedObject private var auth = AuthSession.shared
    @State private var confirmClear = false
    @State private var message: String?
    private var version: String {
        let info = Bundle.main.infoDictionary
        return (info?["CFBundleShortVersionString"] as? String ?? "1.0") + " (" + (info?["CFBundleVersion"] as? String ?? "1") + ")"
    }
    var body: some View {
        List {
            Section(L("account.title")) {
                NavigationLink { AccountView() } label: {
                    Label(auth.email ?? L("account.google"), systemImage: auth.email == nil ? "person.crop.circle" : "person.crop.circle.fill")
                }.accessibilityIdentifier("account-row")
            }
            serviceSection
            dataSection
            supportSection
        }
        .navigationTitle(L("settings.title")).navigationBarTitleDisplayMode(.inline)
        .alert(L("settings.clearSavedConfirm"), isPresented: $confirmClear) {
            Button(L("settings.clearSaved"), role: .destructive) {
                store.saved.favorites = []
                message = L("settings.cleared")
            }
            Button(L("cancel"), role: .cancel) {}
        }
        .alert(message ?? "", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("OK") {}
        }
    }
    private func hint(_ key: String) -> some View {
        Text(L(key)).font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
            .padding(12).background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
            .listRowSeparator(.hidden)
    }
    private func row(_ icon: String, _ key: String, chevron: Bool = true) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).frame(width: 24).foregroundStyle(.secondary)
            Text(L(key))
            Spacer()
            if chevron { Image(systemName: "chevron.right").font(.footnote).foregroundStyle(.tertiary) }
        }.contentShape(Rectangle())
    }
    private var serviceSection: some View {
        Section(L("settings.service")) {
            HStack(spacing: 12) {
                Image(systemName: "globe").frame(width: 24).foregroundStyle(.secondary)
                Text(L("settings.language"))
                Spacer()
                Picker(L("settings.language"), selection: Binding(get: { L10n.language }, set: { lang = $0 })) {
                    Text("한국어").tag("ko"); Text("English").tag("en")
                }.pickerStyle(.segmented).frame(width: 170).accessibilityIdentifier("language-picker")
            }
            hint("settings.languageHint")
        }
    }
    private var dataSection: some View {
        Section(L("settings.data")) {
            Button { confirmClear = true } label: { row("tray", "settings.clearSaved") }
                .buttonStyle(.plain).accessibilityIdentifier("settings-clear-saved")
            Button {
                ImageCache.shared.clear(); URLCache.shared.removeAllCachedResponses()
                message = L("settings.cacheCleared")
            } label: { row("trash", "settings.clearCache") }.buttonStyle(.plain)
        }
    }
    private var supportSection: some View {
        Section(L("settings.support")) {
            Button { message = L("settings.soon") } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(L("settings.feedback")).font(.headline).foregroundStyle(.primary)
                    Text(L("settings.feedbackSub")).font(.subheadline).foregroundStyle(Color.alimi)
                }.frame(maxWidth: .infinity, alignment: .leading).padding(14)
            }.buttonStyle(.plain)
                .listRowBackground(Color.alimi.opacity(0.12))
            Button { message = L("settings.soon") } label: { row("doc.text", "settings.terms") }.buttonStyle(.plain)
            Button { message = L("settings.soon") } label: { row("lock.shield", "settings.privacy") }.buttonStyle(.plain)
            HStack(spacing: 12) {
                Image(systemName: "info.circle").frame(width: 24).foregroundStyle(.secondary)
                Text(L("settings.version", ["v": version]))
            }
        }
    }
}
