import AuthenticationServices
import Combine
import CryptoKit
import Foundation
import Security
import SwiftUI
import UIKit

private struct GoogleAuthTokens: Codable {
    struct User: Codable { let email: String? }
    var accessToken: String
    var refreshToken: String
    var expiresIn: Int
    var expiresAt: Date
    var user: User
    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token", refreshToken = "refresh_token", expiresIn = "expires_in", expiresAt = "expires_at", user
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        accessToken = try c.decode(String.self, forKey: .accessToken)
        refreshToken = try c.decode(String.self, forKey: .refreshToken)
        expiresIn = try c.decode(Int.self, forKey: .expiresIn)
        expiresAt = try c.decodeIfPresent(Date.self, forKey: .expiresAt) ?? Date().addingTimeInterval(TimeInterval(expiresIn))
        user = try c.decode(User.self, forKey: .user)
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(accessToken, forKey: .accessToken); try c.encode(refreshToken, forKey: .refreshToken)
        try c.encode(expiresIn, forKey: .expiresIn); try c.encode(expiresAt, forKey: .expiresAt); try c.encode(user, forKey: .user)
    }
}

@MainActor
final class AuthSession: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = AuthSession()
    @Published private(set) var email: String?
    @Published private(set) var busy = false
    @Published var message: String?

    private var tokens: GoogleAuthTokens?
    private var verifier = ""
    private var expectedState = ""
    private var webSession: ASWebAuthenticationSession?

    override private init() {
        tokens = Self.loadTokens()
        email = tokens?.user.email
        super.init()
    }

    func signIn() {
        guard !busy else { return }
        do {
            verifier = Self.randomURLSafeString(byteCount: 32)
            expectedState = Self.randomURLSafeString(byteCount: 24)
            let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncodedString()
            var c = URLComponents(url: LiveAPI.baseURL.appending(path: "/auth/v1/authorize"), resolvingAgainstBaseURL: false)!
            c.queryItems = [
                URLQueryItem(name: "provider", value: "google"),
                URLQueryItem(name: "redirect_to", value: "alimi://auth/callback"),
                URLQueryItem(name: "code_challenge", value: challenge),
                URLQueryItem(name: "code_challenge_method", value: "s256"),
                URLQueryItem(name: "state", value: expectedState),
                URLQueryItem(name: "scopes", value: "openid email profile"),
                URLQueryItem(name: "apikey", value: LiveAPI.publishableKey)
            ]
            guard let url = c.url else { throw AuthFailure.message("Could not start Google sign-in.") }
            busy = true; message = nil
            webSession = ASWebAuthenticationSession(url: url, callbackURLScheme: "alimi") { [weak self] callback, error in
                Task { @MainActor in
                    guard let self else { return }
                    defer { self.busy = false; self.webSession = nil }
                    if let error { self.message = error.localizedDescription; return }
                    guard let callback, let parts = URLComponents(url: callback, resolvingAgainstBaseURL: false),
                          let code = parts.queryItems?.first(where: { $0.name == "code" })?.value,
                          parts.queryItems?.first(where: { $0.name == "state" })?.value == self.expectedState else {
                        self.message = "Google sign-in could not be verified. Please try again."; return
                    }
                    do { try await self.exchange(code: code) }
                    catch { self.message = error.localizedDescription }
                }
            }
            webSession?.presentationContextProvider = self
            webSession?.prefersEphemeralWebBrowserSession = false
            if webSession?.start() != true { busy = false; webSession = nil; throw AuthFailure.message("Could not open the sign-in page.") }
        } catch { message = error.localizedDescription }
    }

    func signOut() async {
        if let tokens {
            var request = URLRequest(url: LiveAPI.baseURL.appending(path: "/auth/v1/logout"))
            request.httpMethod = "POST"; request.setValue(LiveAPI.publishableKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(tokens.accessToken)", forHTTPHeaderField: "Authorization")
            _ = try? await URLSession.shared.data(for: request)
        }
        tokens = nil; email = nil; Self.deleteTokens(); message = nil
    }

    func restore() async {
        guard let saved = tokens else { return }
        if saved.expiresAt <= Date().addingTimeInterval(30) {
            do { try await refresh(refreshToken: saved.refreshToken) }
            catch { tokens = nil; email = nil; Self.deleteTokens(); return }
        }
        guard let current = tokens else { return }
        var request = URLRequest(url: LiveAPI.baseURL.appending(path: "/auth/v1/user"))
        request.setValue(LiveAPI.publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(current.accessToken)", forHTTPHeaderField: "Authorization")
        if let (data, response) = try? await URLSession.shared.data(for: request), (response as? HTTPURLResponse)?.statusCode == 200,
           let user = try? JSONDecoder().decode(GoogleAuthTokens.User.self, from: data) { email = user.email }
        else { tokens = nil; email = nil; Self.deleteTokens() }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first(where: \.isKeyWindow) ?? UIWindow()
    }

    private func exchange(code: String) async throws {
        let result: GoogleAuthTokens = try await post("/auth/v1/token?grant_type=pkce", body: ["auth_code": code, "code_verifier": verifier])
        tokens = result; email = result.user.email; Self.saveTokens(result); verifier = ""; expectedState = ""
    }
    private func refresh(refreshToken: String) async throws {
        let result: GoogleAuthTokens = try await post("/auth/v1/token?grant_type=refresh_token", body: ["refresh_token": refreshToken])
        tokens = result; email = result.user.email; Self.saveTokens(result)
    }
    private func post<T: Decodable>(_ path: String, body: [String: String]) async throws -> T {
        var request = URLRequest(url: LiveAPI.baseURL.appending(path: path))
        request.httpMethod = "POST"; request.setValue(LiveAPI.publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let detail = (payload?["msg"] as? String) ?? ""
            if detail.localizedCaseInsensitiveContains("provider is not enabled") { throw AuthFailure.message(L("account.providerDisabled")) }
            throw AuthFailure.message(L("account.failed"))
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
    private static func randomURLSafeString(byteCount: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount); _ = SecRandomCopyBytes(kSecRandomDefault, byteCount, &bytes)
        return Data(bytes).base64URLEncodedString()
    }
    private static let keychainService = "com.yohan4477.alimi.auth"
    private static let keychainAccount = "supabase-google-session"
    private static func saveTokens(_ tokens: GoogleAuthTokens) {
        guard let data = try? JSONEncoder().encode(tokens) else { return }
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService,
                                    kSecAttrAccount as String: keychainAccount, kSecValueData as String: data,
                                    kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        SecItemDelete(query as CFDictionary); SecItemAdd(query as CFDictionary, nil)
    }
    private static func loadTokens() -> GoogleAuthTokens? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService,
                                    kSecAttrAccount as String: keychainAccount, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(GoogleAuthTokens.self, from: data)
    }
    private static func deleteTokens() {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService,
                       kSecAttrAccount as String: keychainAccount] as CFDictionary)
    }
}

private enum AuthFailure: LocalizedError {
    case message(String)
    var errorDescription: String? { if case let .message(value) = self { return value }; return nil }
}

private extension Data {
    func base64URLEncodedString() -> String { base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
}
