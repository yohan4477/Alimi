import SwiftUI

/// A purely decorative companion while real asynchronous requests are pending.
/// Shows a standard progress indicator for the first 400 ms, then cycles 10 costumes
/// from one tiny local atlas. Never delays a request or shows fake percentage progress.
struct LoadingCompanion: View {
    var compact = false
    var message: String? = nil

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var showCharacter = false
    @State private var beganAt = Date()

    private var size: CGFloat { compact ? 48 : 64 }
    private var frameHeight: CGFloat { compact ? 72 : 96 }
    private var label: String { message ?? L("loading") }

    var body: some View {
        VStack(spacing: 5) {
            if showCharacter {
                TimelineView(.periodic(from: .now, by: 2.2)) { context in
                    let seconds = max(0, context.date.timeIntervalSince(beganAt))
                    let index = reduceMotion || scenePhase != .active ? 0 : Int(seconds / 2.2) % 10
                    LoadingOutfitSprite(index: index, compact: compact)
                }
                .frame(width: size, height: frameHeight)
                .accessibilityHidden(true)
            } else {
                ProgressView()
                    .frame(width: size, height: frameHeight)
                    .accessibilityHidden(true)
            }
            Text(label)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .task {
            do {
                try await Task.sleep(for: .milliseconds(400))
                if !Task.isCancelled {
                    beganAt = Date()
                    showCharacter = true
                }
            } catch { /* Loading finished; the view disappears without a mascot. */ }
        }
    }
}

/// Atlas: 5 columns × 2 rows of 32×48 pixels.
/// Crop a single costume and scale with nearest-neighbor interpolation to preserve pixel art.
private struct LoadingOutfitSprite: View {
    let index: Int
    let compact: Bool

    private var scale: CGFloat { compact ? 1.5 : 2 }
    private var width: CGFloat { 32 * scale }
    private var height: CGFloat { 48 * scale }

    var body: some View {
        GeometryReader { _ in
            Image("LoadingCharacters")
                .resizable()
                .interpolation(.none)
                .frame(width: width * 5, height: height * 2, alignment: .topLeading)
                .offset(x: -CGFloat(index % 5) * width, y: -CGFloat(index / 5) * height)
        }
        .frame(width: width, height: height)
        .clipped()
    }
}
