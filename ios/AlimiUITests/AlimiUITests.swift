import XCTest

// Drives the real app the way a tester would. Runs on every iOS PR (simulator CI) so regressions such as
// "favorite added but the favorites tab shows no photo" or "products under the wrong category tab" fail
// the PR instead of reaching TestFlight. Screenshots are attached to the test result for review.
final class AlimiUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-uiTestingReset", "-uiTestingOffline", "-disableEvents",
                               "-alimi.notifications.introductionSeen.v1", "YES"]
        app.launch()
    }

    private func attach(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    // Cards expose "사진 있음" once the photo has actually loaded (see TrackedCard).
    private func waitForPhoto(_ card: XCUIElement, timeout: TimeInterval = 30) -> Bool {
        let loaded = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", "사진 있음"), object: card)
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

    // Category tabs sit in a horizontal scroll view; swipe it until the wanted tab can be tapped.
    private func tapCategory(_ name: String) {
        let tab = app.buttons["category-\(name)"].firstMatch
        XCTAssertTrue(tab.waitForExistence(timeout: 5), "missing tab \(name)")
        for direction in [true, false] {
            var n = 0
            while !tab.isHittable && n < 6 {
                let strip = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'category-'")).allElementsBoundByIndex.first { $0.isHittable }
                guard let strip else { break }
                if direction { strip.swipeLeft() } else { strip.swipeRight() }
                n += 1
            }
            if tab.isHittable { break }
        }
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
}
