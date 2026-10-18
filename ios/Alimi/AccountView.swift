import SwiftUI

struct AccountView: View {
    @StateObject private var auth = AuthSession.shared
    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                Spacer()
                Image(systemName: auth.email == nil ? "person.crop.circle" : "person.crop.circle.fill")
                    .font(.system(size: 62)).foregroundStyle(Color.alimi)
                Text(L("account.title")).font(.title2.bold())
                if let email = auth.email {
                    Text(email).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    Button(L("account.signout")) { Task { await auth.signOut() } }
                        .buttonStyle(.bordered).tint(.secondary)
                } else {
                    Button {
                        auth.signIn()
                    } label: {
                        HStack(spacing: 10) {
                            Text("G").font(.system(size: 19, weight: .bold, design: .rounded)).foregroundStyle(Color(rgb: 0x4285F4))
                            Text(L("account.google"))
                        }.frame(maxWidth: .infinity).padding(.vertical, 13)
                    }
                    .buttonStyle(.borderedProminent).disabled(auth.busy)
                    if auth.busy { ProgressView().padding(.top, 4) }
                }
                Text(L("account.localDataHint"))
                    .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    .padding(.horizontal, 28).padding(.top, 4)
                if let message = auth.message {
                    Text(message).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center).padding(.horizontal, 24)
                }
                Spacer()
            }
            .padding(24)
            .frame(maxWidth: .infinity)
            .background(Color.canvas)
            .navigationTitle(L("account.title"))
            .task { await auth.restore() }
        }
    }
}
