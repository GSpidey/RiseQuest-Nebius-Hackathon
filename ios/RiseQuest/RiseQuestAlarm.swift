import Foundation
import UIKit
import React
import UserNotifications
import AlarmKit
import AppIntents
import SwiftUI
import CryptoKit
import AVFoundation

@available(iOS 26.0, *)
struct RiseQuestAlarmMetadata: AlarmMetadata { var alarmId: String }

@available(iOS 26.0, *)
struct OpenRiseQuestAlarm: LiveActivityIntent {
  static var title: LocalizedStringResource = "Open RiseQuest alarm"
  static var openAppWhenRun = true
  @Parameter(title: "Alarm") var alarmId: String
  init() {}
  init(alarmId: String) { self.alarmId = alarmId }
  func perform() async throws -> some IntentResult {
    UserDefaults.standard.set(alarmId, forKey: "risequest.openAlarm")
    return .result()
  }
}

@objc(RiseQuestAlarmAudio)
class RiseQuestAlarmAudio: RCTEventEmitter {
  private var observing = false
  private var updates: Task<Void, Never>?
  private var picker: UIDatePicker?
  override static func requiresMainQueueSetup() -> Bool { true }
  override func supportedEvents() -> [String]! { ["risequestAlarmTriggered"] }
  override func startObserving() {
    observing = true
    if #available(iOS 26.0, *) {
      updates = Task { @MainActor [weak self] in
        for await alarms in AlarmManager.shared.alarmUpdates {
          guard let self, !Task.isCancelled else { break }
          for alarm in alarms where alarm.state == .alerting {
            if let id = UserDefaults.standard.string(forKey: "risequest.alarm.\(alarm.id.uuidString)") {
              self.sendEvent(withName: "risequestAlarmTriggered", body: ["alarmId": id])
            }
          }
        }
      }
    }
  }
  override func stopObserving() { observing = false; updates?.cancel(); updates = nil }
  private func nativeId(_ id: String) -> UUID {
    let bytes = Array(SHA256.hash(data: Data(("risequest:" + id).utf8)).prefix(16))
    return UUID(uuid: (bytes[0],bytes[1],bytes[2],bytes[3],bytes[4],bytes[5],bytes[6],bytes[7],bytes[8],bytes[9],bytes[10],bytes[11],bytes[12],bytes[13],bytes[14],bytes[15]))
  }
  @objc(requestPermission:rejecter:)
  func requestPermission(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor in
      do {
        if #available(iOS 26.0, *) { resolve(try await AlarmManager.shared.requestAuthorization() == .authorized) }
        else { resolve(try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) }
      } catch { reject("ALARM_PERMISSION", "Could not request alarm permission.", error) }
    }
  }
  @objc(pickTime:minute:resolver:rejecter:)
  func pickTime(_ hour: Int, minute: Int, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard self.picker == nil,
        let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(where: { $0.activationState == .foregroundActive }),
        var presenter = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else {
        reject("TIME_PICKER", "Time picker is not available.", nil); return
      }
      while let presented = presenter.presentedViewController { presenter = presented }
      let picker = UIDatePicker()
      picker.datePickerMode = .time; picker.preferredDatePickerStyle = .wheels
      picker.date = Calendar.current.date(from: DateComponents(hour: hour, minute: minute)) ?? Date()
      let alert = UIAlertController(title: "Alarm time", message: "\n\n\n\n\n\n\n\n", preferredStyle: .alert)
      picker.translatesAutoresizingMaskIntoConstraints = false
      alert.view.addSubview(picker)
      NSLayoutConstraint.activate([picker.topAnchor.constraint(equalTo: alert.view.topAnchor, constant: 45), picker.leadingAnchor.constraint(equalTo: alert.view.leadingAnchor, constant: 8), picker.trailingAnchor.constraint(equalTo: alert.view.trailingAnchor, constant: -8), picker.heightAnchor.constraint(equalToConstant: 180)])
      alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in self.picker = nil; resolve(nil) })
      alert.addAction(UIAlertAction(title: "Set time", style: .default) { _ in
        let parts = Calendar.current.dateComponents([.hour, .minute], from: picker.date)
        self.picker = nil; resolve(String(format: "%02d:%02d", parts.hour ?? 7, parts.minute ?? 0))
      })
      self.picker = picker; presenter.present(alert, animated: true)
    }
  }
  private func customSound(_ alarm: [String: Any], id: UUID) throws -> String? {
    guard alarm["selectedTone"] as? String == "custom", let uri = alarm["customToneUri"] as? String,
      let url = URL(string: uri), url.isFileURL else { return nil }
    // iOS alert sounds must be local, supported audio under 30 seconds.
    let file = try AVAudioFile(forReading: url)
    let duration = Double(file.length) / file.processingFormat.sampleRate
    guard duration > 0 && duration < 30, ["caf", "wav", "aiff", "aif"].contains(url.pathExtension.lowercased()) else {
      throw NSError(domain: "RiseQuest", code: 1, userInfo: [NSLocalizedDescriptionKey: "For iOS alarms choose a WAV, CAF or AIFF sound shorter than 30 seconds."])
    }
    let folder = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Sounds")
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let name = "risequest-\(id.uuidString).\(url.pathExtension.lowercased())", target = folder.appendingPathComponent(name)
    if url != target {
      if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
      try FileManager.default.copyItem(at: url, to: target)
    }
    return name
  }
  @objc(schedule:resolver:rejecter:)
  func schedule(_ json: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor in
      do {
        guard let data = json.data(using: .utf8), let alarm = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let id = alarm["id"] as? String, let millis = alarm["triggerMs"] as? Double else {
          throw NSError(domain: "RiseQuest", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid alarm settings."])
        }
        let uuid = self.nativeId(id), date = Date(timeIntervalSince1970: millis / 1000)
        let label = alarm["label"] as? String ?? "RiseQuest alarm", repeatDaily = alarm["repeatDaily"] as? Bool ?? false
        let sound = try self.customSound(alarm, id: uuid)
        UserDefaults.standard.set(id, forKey: "risequest.alarm.\(uuid.uuidString)")
        if #available(iOS 26.0, *) {
          let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
          let schedule: Alarm.Schedule = repeatDaily ? .relative(.init(time: .init(hour: parts.hour ?? 7, minute: parts.minute ?? 0), repeats: .weekly([.monday, .tuesday, .wednesday, .thursday, .friday, .saturday, .sunday]))) : .fixed(date)
          let alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: label),
            stopButton: AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.fill"),
            secondaryButton: AlarmButton(text: "Open", textColor: .white, systemImageName: "sun.max.fill"), secondaryButtonBehavior: .custom)
          let attributes = AlarmAttributes(presentation: AlarmPresentation(alert: alert), metadata: RiseQuestAlarmMetadata(alarmId: id), tintColor: Color.orange)
          let config = AlarmManager.AlarmConfiguration.alarm(schedule: schedule, attributes: attributes,
            secondaryIntent: OpenRiseQuestAlarm(alarmId: id), sound: sound.map { .named($0) } ?? .default)
          _ = try await AlarmManager.shared.schedule(id: uuid, configuration: config)
        } else {
          let content = UNMutableNotificationContent()
          content.title = label; content.body = alarm["customMessage"] as? String ?? "Time to start your day."
          content.sound = sound.map { UNNotificationSound(named: UNNotificationSoundName(rawValue: $0)) } ?? .default
          content.interruptionLevel = .timeSensitive; content.userInfo = ["alarmId": id]
          let components = Calendar.current.dateComponents(repeatDaily ? [.hour, .minute] : [.year, .month, .day, .hour, .minute, .second], from: date)
          try await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: uuid.uuidString, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: repeatDaily)))
        }
        resolve(true)
      } catch { reject("ALARM_SCHEDULE", error.localizedDescription, error) }
    }
  }
  @objc(cancel:resolver:rejecter:)
  func cancel(_ id: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor in
      let uuid = self.nativeId(id)
      if #available(iOS 26.0, *) {
        do { if try AlarmManager.shared.alarms.contains(where: { $0.id == uuid }) { try AlarmManager.shared.cancel(id: uuid) } }
        catch { reject("ALARM_CANCEL", "Could not cancel this alarm.", error); return }
      }
      UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [uuid.uuidString])
      UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [uuid.uuidString])
      resolve(true)
    }
  }
  @objc(start:) func start(_ json: String) { /* AlarmKit owns system playback; foreground speech is in React. */ }
  @objc(stop:) func stop(_ id: String) {
    if #available(iOS 26.0, *) { Task { @MainActor in try? AlarmManager.shared.stop(id: self.nativeId(id)) } }
  }
  @objc(active:rejecter:)
  func active(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor in
      if let id = UserDefaults.standard.string(forKey: "risequest.openAlarm") {
        UserDefaults.standard.removeObject(forKey: "risequest.openAlarm"); resolve(id); return
      }
      if #available(iOS 26.0, *), let alarms = try? AlarmManager.shared.alarms,
        let alarm = alarms.first(where: { $0.state == .alerting }) {
        resolve(UserDefaults.standard.string(forKey: "risequest.alarm.\(alarm.id.uuidString)")); return
      }
      resolve(nil)
    }
  }
}
