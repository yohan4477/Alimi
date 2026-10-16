import SwiftUI
import UserNotifications
import UIKit

enum NotificationPermissionAction: Equatable {
    case request, settings, enabled
    static func resolve(_ status: UNAuthorizationStatus) -> Self {
        switch status {
        case .notDetermined: return .request
        case .denied: return .settings
        case .authorized, .provisional, .ephemeral: return .enabled
        @unknown default: return .settings
        }
    }
}

/// Permission setup only. Remote price alert delivery still requires APNs/backend integration.
struct NotificationOnboarding: View {
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("alimi.notifications.introductionSeen.v1") private var introductionSeen = false
    @State private var showIntroduction = false
    @State private var action: NotificationPermissionAction = .request
    @State private var busy = false
    @State private var errorMessage: String?

    var body: some View {
        RootView()
            .safeAreaInset(edge: .top, spacing: 0) {
                if action != .enabled {
                    Button { showIntroduction = true } label: {
                        Label("가격 하락 알림 켜기", systemImage: "bell.badge")
                            .font(.subheadline.bold()).frame(maxWidth: .infinity).padding(12)
                    }
                    .background(Color.alimi.opacity(0.08))
                }
            }
            .task {
                await refresh()
                if !introductionSeen && action != .enabled { showIntroduction = true }
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { Task { await refresh() } }
            }
            .sheet(isPresented: $showIntroduction, onDismiss: { introductionSeen = true }) {
                VStack(spacing: 20) {
                    Image(systemName: "bell.badge.fill")
                        .font(.system(size: 44)).foregroundStyle(Color.alimi)
                        .accessibilityHidden(true)
                    Text(action == .enabled ? "알림 권한이 허용됐어요" : "가격이 내려가면 알려드릴까요?")
                        .font(.title2.bold()).multilineTextAlignment(.center)
                    Text("관심 상품의 가격 하락 소식을 받으려면 알림을 허용해 주세요.")
                        .multilineTextAlignment(.center)
                    Text("현재 알림 발송 기능은 준비 중이에요. 권한을 허용해도 아직 가격 알림이 발송되지는 않아요.")
                        .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    if let errorMessage { Text(errorMessage).font(.footnote).foregroundStyle(.red) }
                    Button(action == .settings ? "아이폰 알림 설정 열기" : action == .enabled ? "확인" : "알림 켜기") {
                        Task { await enable() }
                    }
                    .buttonStyle(.borderedProminent).controlSize(.large).disabled(busy)
                    Button("나중에") { showIntroduction = false }
                        .disabled(busy)
                }
                .padding(28)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
    }

    @MainActor private func refresh() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        action = NotificationPermissionAction.resolve(settings.authorizationStatus)
    }

    @MainActor private func enable() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        errorMessage = nil
        await refresh()
        switch action {
        case .request:
            do {
                _ = try await UNUserNotificationCenter.current()
                    .requestAuthorization(options: [.alert, .sound, .badge])
                await refresh()
                if action == .enabled { showIntroduction = false }
            } catch {
                errorMessage = "알림 권한을 확인하지 못했어요. 다시 시도해 주세요."
            }
        case .settings:
            guard let url = URL(string: UIApplication.openNotificationSettingsURLString) else { return }
            if !(await UIApplication.shared.open(url)) {
                errorMessage = "아이폰 설정에서 Alimi의 알림을 허용해 주세요."
            }
        case .enabled:
            showIntroduction = false
        }
    }
}
