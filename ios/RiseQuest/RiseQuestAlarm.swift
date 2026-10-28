import Foundation
import UIKit
import React
import UserNotifications
import AlarmKit
import AppIntents
import SwiftUI
import CryptoKit
import AVFoundation
import Speech

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
  private var speechEngine: AVAudioEngine?
  private var speechTask: SFSpeechRecognitionTask?
  private var speechResolve: RCTPromiseResolveBlock?
  private var speechReject: RCTPromiseRejectBlock?
  private var speechTimeout: DispatchWorkItem?
  private var speechSession = UUID()
  private var speechTapInstalled = false
  @objc func cancelListening() { DispatchQueue.main.async { self.finishSpeech(nil, nil) } }
  private func finishSpeech(_ text: String?, _ error: String?) {
    speechSession = UUID()
    speechTimeout?.cancel(); speechTimeout = nil
    let resolve = speechResolve; let reject = speechReject
    speechResolve = nil; speechReject = nil
    speechTask?.cancel(); speechTask = nil
    if let engine = speechEngine { engine.stop(); if speechTapInstalled { engine.inputNode.removeTap(onBus: 0) } }; speechEngine = nil; speechTapInstalled = false
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    if let message = error { reject?("SPEECH_INPUT", message, nil) } else { resolve?(text) }
  }
  @objc func listenOnce(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard self.speechResolve == nil else { reject("SPEECH_BUSY", "Finish the current message first.", nil); return }
      let sessionID = UUID(); self.speechSession = sessionID
      self.speechResolve = resolve; self.speechReject = reject
      SFSpeechRecognizer.requestAuthorization { status in
        AVAudioSession.sharedInstance().requestRecordPermission { allowed in
          DispatchQueue.main.async {
            guard self.speechResolve != nil && self.speechSession == sessionID else { return }
            guard status == .authorized && allowed, let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else {
              self.finishSpeech(nil, "Enable microphone and speech recognition, or type instead."); return
            }
            do {
              let session = AVAudioSession.sharedInstance()
              try session.setCategory(.record, mode: .measurement)
              try session.setActive(true)
              let engine = AVAudioEngine(); self.speechEngine = engine
              let request = SFSpeechAudioBufferRecognitionRequest()
              request.shouldReportPartialResults = false
              if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
              let input = engine.inputNode
              let format = input.outputFormat(forBus: 0)
              guard format.sampleRate > 0 && format.channelCount > 0 else { self.finishSpeech(nil, "No microphone is available."); return }
              input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }
              self.speechTapInstalled = true
              self.speechTask = recognizer.recognitionTask(with: request) { result, error in
                DispatchQueue.main.async {
                  guard self.speechSession == sessionID else { return }
                  if let result = result, result.isFinal { self.finishSpeech(result.bestTranscription.formattedString, nil) }
                  else if error != nil { self.finishSpeech(nil, "Speech could not be recognized. Try again or type your message.") }
                }
              }
              engine.prepare(); try engine.start()
              let timeout = DispatchWorkItem { if self.speechSession == sessionID { self.finishSpeech(nil, nil) } }
              self.speechTimeout = timeout; DispatchQueue.main.asyncAfter(deadline: .now() + 25, execute: timeout)
            } catch { self.finishSpeech(nil, "Voice input is unavailable. You can type instead.") }
          }
        }
      }
    }
  }
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
    if alarm["speechEnabled"] as? Bool == true, let uri = alarm["speechUri"] as? String {
      return try spokenSound(alarm, uri: uri, id: id)
    }
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
  private func speechFolder() throws -> URL {
    var folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("alarm-speech")
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    var values = URLResourceValues(); values.isExcludedFromBackup = true
    try folder.setResourceValues(values)
    return folder
  }
  @objc(cacheSpeech:encoded:resolver:rejecter:)
  func cacheSpeech(_ fingerprint: String, encoded: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    do {
      guard fingerprint.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
        encoded.count <= 19200100, let data = Data(base64Encoded: encoded), data.count >= 46, data.count <= 14400044,
        String(data: data.prefix(4), encoding: .ascii) == "RIFF" else { throw NSError(domain: "RiseQuest", code: 3) }
      let target = try speechFolder().appendingPathComponent("\(fingerprint).wav")
      try data.write(to: target, options: .atomic)
      try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: target.path)
      resolve(target.absoluteString)
    } catch { reject("SPEECH_CACHE", "Could not save this voice on your phone. Please retry.", error) }
  }
  @objc(hasSpeech:resolver:rejecter:)
  func hasSpeech(_ fingerprint: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard fingerprint.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { resolve(false); return }
    do { resolve(FileManager.default.fileExists(atPath: try speechFolder().appendingPathComponent("\(fingerprint).wav").path)) }
    catch { resolve(false) }
  }
  private func samples(_ url: URL) throws -> [Float] {
    let file = try AVAudioFile(forReading: url)
    guard file.length > 0, Double(file.length) / file.processingFormat.sampleRate < 30,
      let input = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)),
      let format = AVAudioFormat(standardFormatWithSampleRate: 24000, channels: 1),
      let converter = AVAudioConverter(from: file.processingFormat, to: format),
      let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 720000) else { throw NSError(domain: "RiseQuest", code: 4) }
    try file.read(into: input)
    var supplied = false
    var conversionError: NSError?
    let status = converter.convert(to: output, error: &conversionError) { _, state in
      if supplied { state.pointee = .endOfStream; return nil }
      supplied = true; state.pointee = .haveData; return input
    }
    if let error = conversionError { throw error }
    guard status != .error, let channel = output.floatChannelData?[0], output.frameLength > 0 else { throw NSError(domain: "RiseQuest", code: 5) }
    return Array(UnsafeBufferPointer(start: channel, count: Int(output.frameLength)))
  }
  private func spokenSound(_ alarm: [String: Any], uri: String, id: UUID) throws -> String {
    guard let url = URL(string: uri), url.isFileURL,
      url.deletingLastPathComponent().standardizedFileURL == (try speechFolder()).standardizedFileURL else { throw NSError(domain: "RiseQuest", code: 6) }
    let voice = try samples(url)
    let repeats = min(3, max(1, alarm["speechRepeats"] as? Int ?? 1))
    var combined = Array(repeating: voice, count: repeats).flatMap { $0 }
    if alarm["selectedTone"] as? String == "custom", let custom = alarm["customToneUri"] as? String,
      let customURL = URL(string: custom), customURL.isFileURL {
      combined += try samples(customURL)
    } else {
      // Locally generated gentle chime, no bundled third-party audio rights.
      combined += (0..<72000).map { index -> Float in
        let t = Double(index) / 24000
        let envelope = exp(-3 * t.truncatingRemainder(dividingBy: 1))
        return Float((sin(t * 2 * .pi * 660) + sin(t * 2 * .pi * 880) * 0.4) * envelope * 0.35)
      }
    }
    guard combined.count < 720000 else {
      throw NSError(domain: "RiseQuest", code: 7, userInfo: [NSLocalizedDescriptionKey: "On iPhone, voice repeats and the tone must fit under 30 seconds. Choose fewer repeats, a shorter message or the default tone."])
    }
    let folder = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Sounds")
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let name = "risequest-spoken-\(id.uuidString).caf", target = folder.appendingPathComponent(name)
    let format = AVAudioFormat(standardFormatWithSampleRate: 24000, channels: 1)!
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(combined.count))!
    buffer.frameLength = AVAudioFrameCount(combined.count)
    combined.withUnsafeBufferPointer { source in buffer.floatChannelData![0].update(from: source.baseAddress!, count: combined.count) }
    let output = try AVAudioFile(forWriting: target, settings: [AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: 24000, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false])
    try output.write(from: buffer)
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

