import SwiftUI

/// Minimal intermediate loading indicator; launch artwork is shown only at app startup.
struct LoadingCompanion: View {
    var compact = false
    var message: String? = nil
    private var label: String { message ?? L("loading") }

    var body: some View {
        HStack(spacing: 8) {
            ProgressView().accessibilityHidden(true)
            Text(label).font(.footnote).foregroundStyle(.secondary)
        }
        .padding(.vertical, compact ? 8 : 12)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }
}
