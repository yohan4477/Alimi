import XCTest
@testable import Alimi

final class ManualPriceTests: XCTestCase {
    func testShippingIncludedTotal() {
        XCTAssertEqual(ManualTorridenPrice.total, 19400)
    }
    func testTargetBoundary() {
        XCTAssertEqual(ManualTorridenPrice.assessment(target: 19400), "확인 당시 가격은 목표가 이하")
        XCTAssertEqual(ManualTorridenPrice.assessment(target: 19399), "확인 당시 가격은 목표가 초과")
        XCTAssertEqual(ManualTorridenPrice.assessment(target: 19401), "확인 당시 가격은 목표가 이하")
    }
    func testUnsetAndInvalidTargets() {
        for value in [0, -1, 10000001] {
            XCTAssertEqual(ManualTorridenPrice.assessment(target: value), "목표가 미설정")
        }
        XCTAssertNil(PriceRule.valid("19,400"))
        XCTAssertNil(PriceRule.valid(""))
        XCTAssertEqual(PriceRule.valid("19400"), 19400)
    }
}
