import SwiftUI

enum MainTab: Hashable { case home, saved, search, chat }

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
    @Binding var tab: MainTab
    private var items: [Product] { store.products.filter { store.saved.favorites.contains($0.id) } }
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .top), count: 3)
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text(L("saved.title")).font(.largeTitle.bold())
                    SavedCommunityPosts()
                    headline
                    LazyVGrid(columns: columns, spacing: 16) {
                        ForEach(items) { SavedCard(product: $0) }
                        ForEach(0..<SavedLayout.emptySlots(items.count), id: \.self) { i in
                            AddSlot(highlighted: i == 0) { tab = .search }
                        }
                    }
                }.padding(20)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink { SettingsView() } label: { Image(systemName: "gearshape") }
                        .accessibilityLabel(L("settings.open")).accessibilityIdentifier("settings-button")
                }
            }
        }
    }
    private var headline: some View {
        let h = SavedLayout.headline(items.count)
        return Text(L(h.key, h.vars)).font(.headline).foregroundStyle(.secondary)
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
    let brand: CatalogBrand
    @State private var families: [ProductFamily] = []
    @State private var done = false
    @State private var loading = false
    @State private var failed = false
    @State private var openFamily: ProductFamily?
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                header
                list
                if loading { ProgressView().frame(maxWidth: .infinity) }
                else if failed {
                    VStack(spacing: 8) {
                        Text(L("loadFailed")).font(.caption).foregroundStyle(.secondary)
                        Button(L("retry")) { Task { await loadMore() } }.accessibilityIdentifier("brand-retry")
                    }.frame(maxWidth: .infinity)
                }
                else if families.isEmpty && done {
                    Text(L("brand.empty")).font(.caption).foregroundStyle(.secondary).accessibilityIdentifier("brand-empty")
                }
            }.padding(20)
        }
        .navigationTitle(brand.label).navigationBarTitleDisplayMode(.inline)
        .task { await loadMore() }
        .sheet(item: $openFamily) { FamilySheet(family: $0).environmentObject(store) }
    }
    private var header: some View {
        HStack(spacing: 16) {
            BrandBadge(brand: brand, size: 84, showLabel: false)
            VStack(alignment: .leading, spacing: 4) {
                Text(brand.label).font(.title2.bold()).lineLimit(2).accessibilityIdentifier("brand-header-title")
                if brand.families > 0 { Text(L("count", ["n": brand.families])).font(.subheadline).foregroundStyle(.secondary) }
            }
            Spacer()
        }.padding(.bottom, 8)
    }
    private var list: some View {
        ForEach(families) { family in
            FamilyRow(family: family) { openFamily = family }
                .onAppear { if family.id == families.last?.id { Task { await loadMore() } } }
        }
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
    @State private var confirmClear = false
    @State private var message: String?
    private var version: String {
        let info = Bundle.main.infoDictionary
        return (info?["CFBundleShortVersionString"] as? String ?? "1.0") + " (" + (info?["CFBundleVersion"] as? String ?? "1") + ")"
    }
    var body: some View {
        List {
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
