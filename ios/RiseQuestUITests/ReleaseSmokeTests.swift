import XCTest

final class ReleaseSmokeTests: XCTestCase {
  private func capture(_ name: String, app: XCUIApplication) {
    // App-local bounds do not match screen coordinates in iPhone compatibility
    // mode on iPad. Capture the actual display rather than a misleading crop.
    let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  private func tapText(_ text: String, app: XCUIApplication) {
    // React Native groups accessible touchables into Button/Other nodes and
    // does not expose their child Text as StaticText. Follow the actual label.
    let element = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", text)).firstMatch
    XCTAssertTrue(element.waitForExistence(timeout: 15), "Missing visible control: \(text)")
    if !element.isHittable { app.swipeUp() }
    XCTAssertTrue(element.isHittable, "Control must be reachable: \(text)")
    element.tap()
  }

  private func navigate(_ screen: String, app: XCUIApplication) {
    let tab = app.descendants(matching: .any).matching(identifier: "navigation-\(screen)").firstMatch
    XCTAssertTrue(tab.waitForExistence(timeout: 15))
    tab.tap()
  }

  func testStoreFeatureScreenshots() {
    continueAfterFailure = false
    let app = XCUIApplication(bundleIdentifier: "com.goldenepics.risequest")
    app.launch()
    let guest = app.descendants(matching: .any).matching(identifier: "welcome-guest").firstMatch
    if guest.waitForExistence(timeout: 5) { guest.tap() }
    navigate("home", app: app)
    capture("store-01-today", app: app)

    // Exercise the shipped UI. Do not inject profiles, mock statistics or bypass
    // authentication/age/purchase gates to make marketing screenshots look busy.
    tapText("Set an alarm", app: app)
    XCTAssertTrue(app.staticTexts["Create New Alarm"].waitForExistence(timeout: 10))
    capture("store-02-alarm-setup", app: app)
    tapText("Cancel", app: app)

    navigate("wellness", app: app)
    capture("store-03-mood", app: app)
    tapText("🎯 Focus", app: app)
    capture("store-04-focus", app: app)
    tapText("🌟 Coping", app: app)
    XCTAssertTrue(app.staticTexts["Coping Strategies"].waitForExistence(timeout: 10))
    capture("store-05-coping", app: app)

    navigate("quests", app: app)
    // Guest quests currently report an account-required load error. Dismiss the
    // real alert before inspecting the creation form; do not inject an account.
    let questLoadAlert = app.alerts["Error"]
    if questLoadAlert.waitForExistence(timeout: 3) {
      XCTAssertTrue(questLoadAlert.staticTexts["Failed to load quests"].exists)
      questLoadAlert.buttons["OK"].tap()
    }
    tapText("+ Create", app: app)
    XCTAssertTrue(app.staticTexts["🎯 Create Quest"].waitForExistence(timeout: 10))
    capture("store-06-quest-planning", app: app)
    tapText("Cancel", app: app)

    navigate("home", app: app)
    let sleep = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Sleep & recovery")).firstMatch
    XCTAssertTrue(sleep.waitForExistence(timeout: 10))
    if !sleep.isHittable { app.swipeUp() }
    sleep.tap()
    capture("store-07-sleep", app: app)

    navigate("more", app: app)
    capture("store-08-more", app: app)
    app.buttons["Challenge mini-games"].tap()
    XCTAssertTrue(app.staticTexts["🎮 Choose Your Challenge"].waitForExistence(timeout: 10))
    capture("store-09-mini-games", app: app)
    // This selector is a native full-screen Modal, so underlying tabs are hidden.
    tapText("← Back", app: app)
    navigate("more", app: app)
    let cosmetics = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Cosmetic store")).firstMatch
    XCTAssertTrue(cosmetics.waitForExistence(timeout: 10))
    cosmetics.tap()
    capture("store-10-cosmetics", app: app)
    app.terminate()
  }

  func testGuestNavigationAndReleaseRendering() {
    continueAfterFailure = false
    let app = XCUIApplication(bundleIdentifier: "com.goldenepics.risequest")
    app.launch()
    let guest = app.descendants(matching: .any).matching(identifier: "welcome-guest").firstMatch
    XCTAssertTrue(guest.waitForExistence(timeout: 30), "Release must render the welcome screen")
    if !guest.isHittable { app.swipeUp() }
    let title = app.descendants(matching: .any).matching(identifier: "welcome-title").firstMatch
    capture("01-welcome", app: app)
    // iPhone compatibility mode on iPad gives descendants screen-relative
    // origins while the application reports a local origin. Compare extents,
    // not absolute maxX across those coordinate spaces, and verify interaction.
    XCTAssertTrue(title.isHittable, "Welcome title must be visible")
    XCTAssertTrue(guest.isHittable, "Guest button must be reachable")
    XCTAssertLessThanOrEqual(title.frame.width, app.frame.width, "Welcome title must fit on screen")
    XCTAssertLessThanOrEqual(guest.frame.width, app.frame.width, "Guest button must not be clipped")
    guest.tap()
    let today = app.descendants(matching: .any).matching(identifier: "navigation-home").firstMatch
    XCTAssertTrue(today.waitForExistence(timeout: 20), "Guest must reach Today")
    capture("02-today-guest", app: app)
    for screen in ["wellness", "more", "home"] {
      let tab = app.descendants(matching: .any).matching(identifier: "navigation-\(screen)").firstMatch
      XCTAssertTrue(tab.exists)
      tab.tap()
      capture("03-\(screen)-guest", app: app)
    }
    app.terminate()
    app.launch()
    XCTAssertTrue(today.waitForExistence(timeout: 20), "Guest state must survive restart")
  }
}
