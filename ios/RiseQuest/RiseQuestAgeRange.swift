import Foundation
import UIKit
import React
import DeclaredAgeRange

// Requested only when entering Community. Exact birthdates and Apple account
// identifiers are neither requested nor stored by this bridge.
@objc(RiseQuestAgeRange)
class RiseQuestAgeRange: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { true }
  @objc(request:rejecter:)
  func request(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor in
      guard #available(iOS 26.0, *) else { resolve(["status": "unsupported"]); return }
      guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
        .first(where: { $0.activationState == .foregroundActive }),
        var presenter = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else {
        reject("AGE_RANGE_UNAVAILABLE", "The age-range sheet is not available. Please retry.", nil); return
      }
      while let presented = presenter.presentedViewController { presenter = presented }
      do {
        let response = try await AgeRangeService.shared.requestAgeRange(ageGates: 13, 16, 18, in: presenter)
        switch response {
        case .sharing(let range):
          var result: [String: Any] = ["status": "shared",
            "communicationLimited": range.activeParentalControls.contains(.communicationLimits)]
          if let lower = range.lowerBound { result["lowerBound"] = lower }
          if let upper = range.upperBound { result["upperBound"] = upper }
          resolve(result)
        case .declinedSharing: resolve(["status": "declined"])
        @unknown default: reject("AGE_RANGE_UNKNOWN", "Please retry the age-range check.", nil)
        }
      } catch { reject("AGE_RANGE_UNAVAILABLE", "Could not check the age range. Please retry.", error) }
    }
  }
}
