import SwiftUI

/// Compact loading companion reuses the same optimized 10-look pixel sprite as the web.
/// PixelLoadingView performs the 400ms grace period, respects Reduce Motion,
/// and stops when the real asynchronous loading state ends.
struct LoadingCompanion: View {
    var compact = false
    var message: String? = nil
    var body: some View {
        PixelLoadingView(compact: compact, message: message)
    }
}
