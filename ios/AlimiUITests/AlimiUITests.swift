import XCTest

// Drives the real app the way a tester would. Runs on every iOS PR (simulator CI) so regressions such as
// "favorite added but the favorites tab shows no photo" or "products under the wrong category tab" fail
// the PR instead of reaching TestFlight. Screenshots are attached to the test result for review.
final class AlimiUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        // Flows run in Korean (the operator's language); testEnglishForUSUsers checks the English UI.
        app.launchArguments = ["-uiTestingReset", "-uiTestingOffline", "-disableEvents",
                               "-alimi.notifications.introductionSeen.v1", "YES", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
    }

    private func attach(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    // Cards expose "photo-loaded" once the photo has actually loaded (see TrackedCard).
    private func waitForPhoto(_ card: XCUIElement, timeout: TimeInterval = 30) -> Bool {
        let loaded = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", "photo-loaded"), object: card)
        return XCTWaiter().wait(for: [loaded], timeout: timeout) == .completed
    }
    // Lazy grids only create cells near the screen, so scroll until the element exists and is tappable.
    @discardableResult private func reveal(_ element: XCUIElement, swipes: Int = 6) -> XCUIElement {
        var n = 0
        while !(element.exists && element.isHittable) && n < swipes { app.swipeUp(); n += 1 }
        return element
    }

    func testFavoriteAppearsWithPhotoInFavoritesTab() {
        let product = "laneige-lip-sleeping-mask-ex-berry"
        XCTAssertTrue(app.buttons["product-cosrx-snail-96-100ml"].firstMatch.waitForExistence(timeout: 15), "home should list tracked products")
        let heart = reveal(app.buttons["favorite-\(product)"].firstMatch)
        XCTAssertTrue(heart.exists, "home should list the tracked product")
        heart.tap()
        attach("home-after-favorite")

        app.tabBars.buttons["관심 상품"].tap()
        let card = app.buttons["product-\(product)"].firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 10), "favorite should appear in the favorites tab")
        XCTAssertTrue(waitForPhoto(card), "favorite card should show the product photo, not a placeholder")
        attach("favorites-tab")

        // Re-render the list (unfavorite + favorite again) and make sure the photo survives.
        app.buttons["favorite-\(product)"].firstMatch.tap()
        app.tabBars.buttons["홈"].tap()
        reveal(app.buttons["favorite-\(product)"].firstMatch).tap()
        app.tabBars.buttons["관심 상품"].tap()
        XCTAssertTrue(waitForPhoto(app.buttons["product-\(product)"].firstMatch), "photo should survive list re-render")
    }

    // Category tabs sit in a horizontal scroll view. Off-screen tabs have no valid hit point (isHittable
    // itself throws), so compare frames with the window and drag the strip until the tab is fully visible.
    private func tapCategory(_ name: String) {
        let tab = app.buttons["category-\(name)"].firstMatch
        XCTAssertTrue(tab.waitForExistence(timeout: 5), "missing tab \(name)")
        let screen = app.windows.firstMatch.frame
        let tabs = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'category-'"))
        var n = 0
        while !screen.contains(tab.frame) && n < 12 {
            // Swipe on a tab that is fully on screen; swiping the strip itself scrolls it horizontally.
            guard let visible = tabs.allElementsBoundByIndex.first(where: { screen.contains($0.frame) }) else { break }
            // Slow, short drag: swipeLeft/Right fling past the target and can oscillate.
            let from = visible.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            from.press(forDuration: 0.2, thenDragTo: from.withOffset(CGVector(dx: tab.frame.midX > screen.midX ? -140 : 140, dy: 0)))
            n += 1
        }
        XCTAssertTrue(screen.contains(tab.frame), "tab \(name) never scrolled into view")
        tab.tap()
    }

    func testCategoryTabsFilterTrackedProducts() {
        XCTAssertTrue(app.buttons["product-cosrx-snail-96-100ml"].firstMatch.waitForExistence(timeout: 15))

        tapCategory("립")
        XCTAssertTrue(app.buttons["product-laneige-lip-sleeping-mask-ex-berry"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["product-romand-the-juicy-lasting-tint-07"].firstMatch.exists)
        XCTAssertFalse(app.buttons["product-cosrx-snail-96-100ml"].firstMatch.exists, "essence must not be listed under 립")
        attach("category-lip")

        tapCategory("베이스메이크업")
        XCTAssertTrue(app.buttons["product-tirtir-mask-fit-red-cushion-18g-21c"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["product-laneige-lip-sleeping-mask-ex-berry"].firstMatch.exists)

        tapCategory("에센스·세럼")
        XCTAssertTrue(app.buttons["product-cosrx-snail-96-100ml"].firstMatch.waitForExistence(timeout: 5))
        attach("category-essence")
    }

    func testEnglishForUSUsers() {
        app.terminate()
        app.launchArguments = ["-uiTestingReset", "-uiTestingOffline", "-disableEvents",
                               "-alimi.notifications.introductionSeen.v1", "YES", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Saved"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.tabBars.buttons["Home"].exists)
        XCTAssertTrue(app.staticTexts["Watching prices"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["가격을 지켜보는 상품"].firstMatch.exists)
        attach("english-home")
    }
}
