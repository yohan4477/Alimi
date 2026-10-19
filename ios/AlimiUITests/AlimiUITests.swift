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
        app.launchArguments = ["-uiTestingReset", "-uiTestingOffline", "-disableEvents", "-skipOnboarding",
                               "-alimi.notifications.introductionSeen.v1", "YES", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
    }

    // Community is the first tab; product flows start from Home.
    private func openHome(_ label: String = "홈") { app.tabBars.buttons[label].tap() }
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
        openHome()
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
        openHome()
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

    // Purchase path works without saving: the detail page leads with the retailer button, the price alert comes last.
    func testDetailOffersRetailerWithoutPriceTracking() {
        openHome()
        let card = app.buttons["product-cosrx-snail-96-100ml"].firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 15))
        reveal(card).tap()
        let buy = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Stylevana'")).firstMatch
        XCTAssertTrue(buy.waitForExistence(timeout: 10), "detail offers a view-at-retailer button")
        XCTAssertFalse(app.buttons["target-button"].exists)
        XCTAssertFalse(app.staticTexts["가격이 내려가면 알려드릴까요?"].exists)
        XCTAssertFalse(app.tabBars.buttons["알림"].exists)
        attach("detail-purchase-flow")
    }
    func testTappingBrandOpensItsPage() {
        openHome()
        let cosrx = app.buttons["brand-COSRX"]
        XCTAssertTrue(cosrx.waitForExistence(timeout: 10), "popular-brand badges on home")
        attach("brand-strip")
        reveal(cosrx).tap()
        // Offline mode returns no families, so the page shows its header (and the empty message).
        XCTAssertTrue(app.staticTexts["brand-header-title"].waitForExistence(timeout: 10), "brand page opens with its header")
        XCTAssertEqual(app.staticTexts["brand-header-title"].label, "코스알엑스")
        XCTAssertTrue(app.staticTexts["brand-empty"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["brand-retry"].exists, "successful empty results are not request failures")
        attach("brand-page")
    }
    func testSavedTabHasAddSlotsAndSettings() {
        app.tabBars.buttons["관심 상품"].tap()
        XCTAssertTrue(app.staticTexts["관심상품"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["saved-add-slot"].firstMatch.exists)
        app.buttons["saved-add-slot"].firstMatch.tap()
        XCTAssertTrue(app.textFields["search-field"].waitForExistence(timeout: 5), "slot switches to the search tab")
    }
    func testSettingsOpensFromSaved() {
        app.tabBars.buttons["관심 상품"].tap()
        let gear = app.buttons["settings-button"]
        XCTAssertTrue(gear.waitForExistence(timeout: 5))
        gear.tap()
        XCTAssertTrue(app.navigationBars["설정"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["settings-clear-saved"].exists || app.staticTexts["관심상품 정리하기"].exists)
        attach("settings")
    }
    func testChatJoinSendAndBlock() {
        app.tabBars.buttons["커뮤니티"].tap()
        app.buttons["home-tab-rooms"].tap()
        let room = app.buttons["chat-room-acne"].firstMatch
        XCTAssertTrue(room.waitForExistence(timeout: 10))
        room.tap()
        // Reading is open; the join bar shows the rules and unlocks posting.
        let join = app.buttons["chat-join"]
        XCTAssertTrue(join.waitForExistence(timeout: 5), "rules are shown before the first join")
        attach("chat-rules")
        join.tap()
        let other = app.otherElements["chat-message-1"].firstMatch
        XCTAssertTrue(app.staticTexts["추천 좀 해주세요"].waitForExistence(timeout: 10))
        let field = app.textFields["chat-text"].firstMatch.exists ? app.textFields["chat-text"].firstMatch : app.textViews["chat-text"].firstMatch
        field.tap()
        field.typeText("이거 좋아요")
        app.buttons["chat-send"].tap()
        XCTAssertTrue(app.staticTexts["이거 좋아요"].waitForExistence(timeout: 5))
        attach("chat-room")
        (other.exists ? other : app.staticTexts["추천 좀 해주세요"]).press(forDuration: 1.2)
        let block = app.buttons["차단"]
        XCTAssertTrue(block.waitForExistence(timeout: 5), "long press offers report / block")
        XCTAssertTrue(app.buttons["신고"].exists)
        block.tap()
        let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.staticTexts["추천 좀 해주세요"])
        XCTAssertEqual(XCTWaiter().wait(for: [gone], timeout: 5), .completed, "blocked author's messages are hidden")
    }
    // Journey 1: splash → interests and concerns (2/3) → matching rooms (3/3) → the room, then My activity remembers it.
    func testJourneyOneOnboardingToRoom() {
        app.terminate()
        app.launchArguments = ["-uiTestingReset", "-uiTestingOffline", "-disableEvents",
                               "-alimi.notifications.introductionSeen.v1", "YES", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.otherElements["splash"].waitForExistence(timeout: 10) || app.staticTexts["좋은 일상을 만든다"].waitForExistence(timeout: 2), "splash first")
        attach("j1-splash")
        let skincare = app.buttons["onb-group-skincare"]
        XCTAssertTrue(skincare.waitForExistence(timeout: 10), "interests after the splash")
        skincare.tap()
        for id in ["acne", "sensitive", "firmness", "sebum"] { app.buttons["onb-concern-" + id].tap() }
        XCTAssertTrue(app.buttons["onb-concern-toneup"].exists && app.buttons["onb-concern-trouble"].exists, "nine skincare keywords")
        attach("j1-interests")
        app.buttons["onb-next"].tap()
        let room = app.buttons["chat-room-acne"].firstMatch
        XCTAssertTrue(room.waitForExistence(timeout: 10), "acne room recommended")
        XCTAssertTrue(app.buttons["onb-filter-rec"].exists && app.buttons["onb-filter-all"].exists)
        attach("j1-rooms")
        room.tap()
        XCTAssertTrue(app.buttons["chat-join"].waitForExistence(timeout: 10), "room opens with the join bar")
        XCTAssertTrue(app.staticTexts["추천 좀 해주세요"].waitForExistence(timeout: 10), "messages readable before joining")
        attach("j1-room")
        app.buttons["chat-join"].tap()
        let field = app.textFields["chat-text"].firstMatch.exists ? app.textFields["chat-text"].firstMatch : app.textViews["chat-text"].firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 5), "composer after joining")
        app.tabBars.buttons["관심 상품"].tap()
        let row = app.buttons["interests-row"]
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        XCTAssertTrue(row.label.contains("스킨케어") && row.label.contains("여드름"), "choices listed in My activity: \(row.label)")
    }
    func testEnglishForUSUsers() {
        app.terminate()
        app.launchArguments = ["-uiTestingReset", "-uiTestingOffline", "-disableEvents", "-skipOnboarding",
                               "-alimi.notifications.introductionSeen.v1", "YES", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Saved"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.tabBars.buttons["Home"].exists)
        openHome("Home")
        XCTAssertTrue(app.staticTexts["Explore products"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["가격을 지켜보는 상품"].firstMatch.exists)
        attach("english-home")
    }
}
