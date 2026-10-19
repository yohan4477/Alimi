import SwiftUI

// Journey 1 (신규 유입 · 고민 기반 온보딩), laid out like the reference screens:
// splash → interests and concern keywords (2/3) → rooms that match (3/3) → the room itself.
// Every number shown is real (room list); nothing is asked about skin type, nothing leaves the device.

extension Color {
    static let sbNavy = Color(rgb: 0x0F1B3D)
    static let sbGray = Color(rgb: 0x6B7385)
    static let sbChipBg = Color(rgb: 0xF4F6FA)
    static let sbTagBg = Color(rgb: 0xEAF2FF)
    static let sbBlue = Color(rgb: 0x1A73F5)
}

enum OnboardingStep { case splash, choose, rooms }

struct OnboardingFlow: View {
    @EnvironmentObject var store: AlimiStore
    @StateObject private var model = CommunityHomeModel()
    @State var step: OnboardingStep
    @State private var draft = Interests.load() ?? Interests()
    let finish: (ChatRoom?) -> Void
    var body: some View {
        ZStack {
            switch step {
            case .splash: SplashScreen { step = .choose }
            case .choose:
                InterestScreen(draft: $draft, back: { close(nil) }, next: {
                    if draft.chosenGroup { step = .rooms } else { close(nil) }
                }).transition(.identity)
            case .rooms:
                RoomPicksScreen(model: model, interests: draft, back: { step = .choose }, open: { close($0) })
                    .transition(.identity)
            }
        }
        .task { await model.load(store: store) }
    }
    private func close(_ room: ChatRoom?) {
        var v = draft; v.done = true; v.save()
        finish(room)
    }
}

// MARK: 1. Splash

struct SplashScreen: View {
    let next: () -> Void
    var body: some View {
        ZStack(alignment: .top) {
            LinearGradient(colors: [Color(rgb: 0xE6F0FE), Color(rgb: 0xE5F0FE)], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
            VStack(spacing: 0) {
                Spacer().frame(height: 70)
                Text(L("splash.line1")).font(.system(size: 22, weight: .medium)).foregroundStyle(Color(rgb: 0x3D6FD8))
                Text(L("splash.line2")).font(.system(size: 26, weight: .bold)).foregroundStyle(Color.sbNavy).padding(.top, 4)
                Image("SeoulBeautyLogo").resizable().scaledToFit().frame(maxWidth: 300).padding(.top, 34).padding(.horizontal, 40)
                    .accessibilityLabel("Seoul Beauty")
                Spacer(minLength: 0)
            }
            VStack { Spacer(); Image("SplashPhoto").resizable().scaledToFit().frame(maxWidth: .infinity) }
                .ignoresSafeArea(edges: .bottom).accessibilityHidden(true)
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: next)
        // UI tests hold the splash (-holdSplash) to capture it, then tap through.
        .task { guard !ProcessInfo.processInfo.arguments.contains("-holdSplash") else { return }; try? await Task.sleep(for: .seconds(1.8)); next() }
        .accessibilityElement(children: .contain).accessibilityIdentifier("splash")
    }
}

// MARK: Shared top bar (back + logo)

struct LogoBar: View {
    let back: () -> Void
    var body: some View {
        ZStack {
            Image("SeoulBeautyLogo").resizable().scaledToFit().frame(height: 62).accessibilityLabel("Seoul Beauty")
            HStack {
                Button(action: back) { Image(systemName: "chevron.left").font(.system(size: 24, weight: .regular)).foregroundStyle(Color.sbNavy).frame(width: 44, height: 44) }
                    .accessibilityLabel(L("back")).accessibilityIdentifier("onb-back")
                Spacer()
            }
        }.padding(.horizontal, 8).padding(.top, 4)
    }
}

// MARK: 2. Interests and concern keywords

struct InterestScreen: View {
    @Binding var draft: Interests
    let back: () -> Void
    let next: () -> Void
    private let grid = Array(repeating: GridItem(.flexible(), spacing: 12), count: 3)
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            LogoBar(back: back)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(L("onb.q0")).font(.system(size: 27, weight: .heavy)).foregroundStyle(Color.sbNavy)
                        .minimumScaleFactor(0.8).lineLimit(2).padding(.top, 28).accessibilityIdentifier("onb-title")
                    Text(L("onb.s0")).font(.system(size: 18)).foregroundStyle(Color.sbGray).padding(.top, 10)
                    Text(L("onb.fields")).font(.system(size: 18, weight: .bold)).foregroundStyle(Color.sbNavy).padding(.top, 40)
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 14) {
                            fieldButton("skincare", icon: "drop").fixedSize(horizontal: true, vertical: false)
                            fieldButton("makeup", icon: "paintbrush.pointed").fixedSize(horizontal: true, vertical: false)
                        }
                        VStack(spacing: 10) {
                            fieldButton("skincare", icon: "drop")
                            fieldButton("makeup", icon: "paintbrush.pointed")
                        }
                    }.padding(.top, 16)
                    Text(L("onb.keywords")).font(.system(size: 18, weight: .bold)).foregroundStyle(Color.sbNavy).padding(.top, 40)
                    if draft.visibleConcerns.isEmpty {
                        Text(L("onb.pickField")).font(.subheadline).foregroundStyle(Color.sbGray).padding(.top, 14)
                    } else {
                        LazyVGrid(columns: grid, spacing: 12) {
                            ForEach(draft.visibleConcerns, id: \.self) { id in keyword(id) }
                        }.padding(.top, 16)
                    }
                }.padding(.horizontal, 24).padding(.bottom, 24)
            }
            VStack(spacing: 14) {
                Button(action: next) {
                    Text(draft.chosenGroup ? L("onb.next") : L("onb.browse")).font(.system(size: 19, weight: .bold)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 58).background(Color.sbBlue, in: RoundedRectangle(cornerRadius: 14))
                }.buttonStyle(.plain).accessibilityIdentifier("onb-next")
                StepBar(step: 2)
            }.padding(.horizontal, 24).padding(.bottom, 12)
        }.background(Color.white)
    }
    private func fieldButton(_ group: String, icon: String) -> some View {
        let on = draft.has(group)
        return Button {
            if group == "skincare" { draft.skincare.toggle() } else { draft.makeup.toggle() }
            draft = draft.normalized()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "checkmark").font(.system(size: 17, weight: .bold)).opacity(on ? 1 : 0)
                Image(systemName: icon).font(.system(size: 20))
                Text(L("onb.g." + group)).font(.system(size: 18, weight: .bold)).lineLimit(1).minimumScaleFactor(0.8)
            }
            .foregroundStyle(on ? Color.white : Color.sbNavy)
            .padding(.horizontal, 12).frame(maxWidth: .infinity, minHeight: 64)
            .background(on ? Color.sbBlue : Color.sbChipBg, in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(on ? Color.sbBlue : Color(rgb: 0xE3E7EE)))
        }.buttonStyle(.plain).accessibilityIdentifier("onb-group-" + group).accessibilityAddTraits(on ? .isSelected : [])
    }
    private func keyword(_ id: String) -> some View {
        let on = draft.concerns.contains(id)
        return Button {
            if let i = draft.concerns.firstIndex(of: id) { draft.concerns.remove(at: i) } else { draft.concerns.append(id) }
        } label: {
            HStack(spacing: 8) {
                if on { Image(systemName: "checkmark").font(.system(size: 15, weight: .bold)) }
                Text(Interests.label(id)).font(.system(size: 17, weight: on ? .bold : .medium)).lineLimit(1).minimumScaleFactor(0.75)
            }
            .foregroundStyle(on ? Color.white : Color.sbNavy)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(on ? Color.sbBlue : Color.white, in: Capsule())
            .overlay(Capsule().stroke(on ? Color.sbBlue : Color(rgb: 0xE3E7EE)))
        }.buttonStyle(.plain).accessibilityIdentifier("onb-concern-" + id).accessibilityAddTraits(on ? .isSelected : [])
    }
}

struct StepBar: View {
    let step: Int
    var total = 3
    var body: some View {
        HStack(spacing: 10) {
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color(rgb: 0xE4E8EF))
                    Capsule().fill(Color.sbBlue).frame(width: g.size.width * CGFloat(step) / CGFloat(total))
                }
            }.frame(width: 170, height: 7)
            Text("\(step)/\(total)").font(.system(size: 15)).foregroundStyle(Color.sbGray)
        }.frame(maxWidth: .infinity)
            .accessibilityElement(children: .ignore).accessibilityLabel(L("onb.step", ["n": step])).accessibilityIdentifier("onb-progress")
    }
}

// MARK: 3. Rooms that match

enum RoomFilter: String, CaseIterable { case rec, skincare, makeup, all }

struct RoomPicksScreen: View {
    @ObservedObject var model: CommunityHomeModel
    let interests: Interests
    let back: () -> Void
    let open: (ChatRoom) -> Void
    @State private var filter = RoomFilter.rec
    private var rooms: [ChatRoom] {
        switch filter {
        case .rec: return Recommend.rooms(model.rooms, interests, limit: 6).map(\.room)
        case .skincare: return model.topics.filter { $0.tag == "skin" || Recommend.concerns(of: $0).contains { c in Interests.catalog.contains { $0.id == c && $0.group == "skincare" } } }
        case .makeup: return model.topics.filter { $0.tag == "makeup" || Recommend.concerns(of: $0).contains { c in Interests.catalog.contains { $0.id == c && $0.group == "makeup" } } }
        case .all: return model.topics
        }
    }
    private var chosen: [String] { interests.visibleConcerns.filter { interests.concerns.contains($0) } }
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            LogoBar(back: back)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(L("onb.q1")).font(.system(size: 29, weight: .heavy)).foregroundStyle(Color.sbNavy)
                        .minimumScaleFactor(0.8).lineLimit(2).padding(.top, 28).accessibilityIdentifier("onb-title")
                    Text(L("onb.s1")).font(.system(size: 18)).foregroundStyle(Color.sbGray).padding(.top, 10)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) { ForEach(RoomFilter.allCases, id: \.self) { filterChip($0) } }.padding(.vertical, 2)
                    }.padding(.top, 26)
                    VStack(spacing: 14) {
                        ForEach(rooms) { room in
                            Button { open(room) } label: { PickCard(room: room, picture: model.pictures[room.id], highlight: chosen) }
                                .buttonStyle(.plain).accessibilityIdentifier("chat-room-" + room.id)
                        }
                        if model.loading { LoadingCompanion(compact: true) }
                    }.padding(.top, 20)
                }.padding(.horizontal, 20).padding(.bottom, 20)
            }
            StepBar(step: 3).padding(.bottom, 12)
        }.background(Color.white).accessibilityIdentifier("onb-rooms")
    }
    private func filterChip(_ f: RoomFilter) -> some View {
        let on = filter == f
        let icon: String? = f == .skincare ? "leaf" : f == .makeup ? "paintbrush.pointed" : f == .all ? "square.grid.2x2" : nil
        return Button { filter = f } label: {
            HStack(spacing: 8) {
                if let icon { Image(systemName: icon).font(.system(size: 17)) }
                Text(L("onb.filter." + f.rawValue)).font(.system(size: 17, weight: on ? .bold : .medium))
            }
            .foregroundStyle(on ? Color.white : Color.sbNavy)
            .padding(.horizontal, f == .rec ? 28 : 18).frame(minHeight: 46)
            .background(on ? Color.sbBlue : Color.sbChipBg, in: Capsule())
        }.buttonStyle(.plain).accessibilityIdentifier("onb-filter-" + f.rawValue).accessibilityAddTraits(on ? .isSelected : [])
    }
}

// Large room card of the reference: photo, name, real member count and activity, intro, concern tags.
struct PickCard: View {
    let room: ChatRoom
    let picture: URL?
    var highlight: [String] = []
    var showIntro = true
    var body: some View {
        HStack(alignment: showIntro ? .top : .center, spacing: 16) {
            RoomThumb(room: room, picture: picture, size: 72).frame(width: 72, height: 72)
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .top) {
                    Text(room.title).font(.system(size: 19, weight: .heavy)).foregroundStyle(Color.sbNavy).lineLimit(2)
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.right").font(.system(size: 17)).foregroundStyle(Color.sbNavy)
                }
                Text(RoomText.stats(room)).font(.system(size: 14)).foregroundStyle(Color.sbGray).lineLimit(1)
                if showIntro { Text(room.intro).font(.system(size: 14)).foregroundStyle(Color.sbGray).lineLimit(1) }
                let tags = Recommend.concerns(of: room).prefix(3)
                if !tags.isEmpty {
                    FlowLayout(spacing: 6) {
                        ForEach(Array(tags), id: \.self) { id in
                            Text("#" + Interests.label(id).replacingOccurrences(of: " ", with: ""))
                                .font(.system(size: 13, weight: highlight.contains(id) ? .bold : .semibold)).foregroundStyle(Color.sbBlue)
                                .padding(.horizontal, 10).padding(.vertical, 6).background(Color.sbTagBg, in: Capsule()).lineLimit(1)
                        }
                    }.padding(.top, 4)
                }
            }
        }
        .padding(12)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color(rgb: 0xE6EAF1)))
        .contentShape(Rectangle())
    }
}

// Real counts only: "지금 활발한 대화 중" when the last message is under an hour old, otherwise today's messages.
enum RoomText {
    static func compact(_ n: Int) -> String {
        if L10n.language == "ko" {
            return n >= 10_000 ? trimmed(Double(n) / 10_000) + "만" : n >= 1_000 ? trimmed(Double(n) / 1_000) + "천" : String(n)
        }
        return n >= 1_000 ? trimmed(Double(n) / 1_000) + "K" : String(n)
    }
    private static func trimmed(_ v: Double) -> String { let s = String(format: "%.1f", v); return s.hasSuffix(".0") ? String(s.dropLast(2)) : s }
    static func liveNow(_ room: ChatRoom, now: Date = Date()) -> Bool {
        guard let at = room.lastMessageAt.flatMap(ISODate.parse) else { return false }
        return now.timeIntervalSince(at) < 3600
    }
    static func activity(_ room: ChatRoom, now: Date = Date()) -> String? {
        if liveNow(room, now: now) { return L("room.liveNow") }
        return room.messages24h > 0 ? L("room.newToday", ["n": room.messages24h]) : nil
    }
    static func stats(_ room: ChatRoom, now: Date = Date()) -> String {
        [L("chat.members", ["n": compact(room.members)]), activity(room, now: now)].compactMap { $0 }.joined(separator: "  ·  ")
    }
    static func memberLine(_ room: ChatRoom, now: Date = Date()) -> String {
        [L("room.memberCount", ["n": compact(room.members)]), activity(room, now: now)].compactMap { $0 }.joined(separator: " · ")
    }
}
