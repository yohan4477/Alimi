import SwiftUI

/// Reuse the launch logo and portrait while a real request is pending.
/// Kept under the shared loader name so every existing loading state uses the same artwork.
struct LoadingCompanion: View {
    var compact = false
    var message: String? = nil
    @State private var showArtwork = false
    private var width: CGFloat { compact ? 96 : 128 }
    private var label: String { message ?? L("loading") }

    var body: some View {
        VStack(spacing: 10) {
            if showArtwork {
                VStack(spacing: 0) {
                    Image("SeoulBeautyLogo").resizable().scaledToFit()
                        .padding(.horizontal, 8).padding(.top, 10)
                    Image("SplashPhoto").resizable().scaledToFit()
                }
                .frame(width: width)
                .background(Color(rgb: 0xE5F0FE), in: RoundedRectangle(cornerRadius: 12))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .accessibilityHidden(true)
            }
            HStack(spacing: 8) {
                ProgressView().accessibilityHidden(true)
                Text(label).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, compact ? 8 : 12)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .task {
            do {
                try await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled else { return }
                showArtwork = true
            } catch { }
        }
    }
}
