@preconcurrency import AVFoundation
import Foundation
import React
import Speech

@objc(WalkerVoiceAssistant)
class WalkerVoiceAssistant: NSObject, AVSpeechSynthesizerDelegate {
  private let speechSynthesizer = AVSpeechSynthesizer()
  private let audioEngine = AVAudioEngine()
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var activeResolve: RCTPromiseResolveBlock?
  private var activeReject: RCTPromiseRejectBlock?
  private var speechResolve: RCTPromiseResolveBlock?
  private var lastTranscript = ""
  private var finishTimer: Timer?

  override init() {
    super.init()
    speechSynthesizer.delegate = self
  }

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc func requestPermissions(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    SFSpeechRecognizer.requestAuthorization { speechStatus in
      let finish: (Bool) -> Void = { microphoneGranted in
        resolve(["speech": speechStatus == .authorized, "microphone": microphoneGranted])
      }

      if #available(iOS 17.0, *) {
        AVAudioApplication.requestRecordPermission(completionHandler: finish)
      } else {
        AVAudioSession.sharedInstance().requestRecordPermission(finish)
      }
    }
  }

  @objc func speak(
    _ text: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.cancelActiveSpeech()
      self.speechResolve = resolve

      let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
      if trimmedText.isEmpty {
        self.resolveSpeech(spoken: false)
        return
      }

      // Configure the shared AVAudioSession for TTS output. Without this, a
      // prior call to listenOnce() leaves the session in `.record` mode (no
      // playback), and the initial state on a real device may also block
      // speaker output — both cause TTS to be silent even though the
      // synthesizer "completes" the utterance.
      let session = AVAudioSession.sharedInstance()
      do {
        try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers, .mixWithOthers])
        try session.setActive(true, options: [])
      } catch {
        // Non-fatal — try to speak anyway. If audio is silent we'll see it
        // in the resolve callback (didCancel) and surface to JS.
        NSLog("[WalkerVoice] Failed to configure audio session for playback: \(error.localizedDescription)")
      }

      let utterance = AVSpeechUtterance(string: trimmedText)
      utterance.voice = self.preferredVoice()
      utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.88
      utterance.pitchMultiplier = 1.04
      utterance.volume = 1.0
      self.speechSynthesizer.speak(utterance)
    }
  }

  @objc func stopSpeaking(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      self?.cancelActiveSpeech()
      resolve(["stopped": true])
    }
  }

  @objc func listenOnce(
    _ locale: String,
    durationSeconds: NSNumber,
    contextualStrings: [String],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.stopRecognition()

      let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale))
      guard let recognizer = recognizer, recognizer.isAvailable else {
        reject("SPEECH_UNAVAILABLE", "Speech recognition is unavailable on this device.", nil)
        return
      }

      self.lastTranscript = ""
      self.activeResolve = resolve
      self.activeReject = reject

      let audioSession = AVAudioSession.sharedInstance()
      do {
        try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
      } catch {
        self.stopRecognition()
        reject("AUDIO_SESSION_FAILED", error.localizedDescription, error)
        return
      }

      let request = SFSpeechAudioBufferRecognitionRequest()
      request.shouldReportPartialResults = true
      request.contextualStrings = contextualStrings
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
      self.recognitionRequest = request

      let inputNode = self.audioEngine.inputNode
      let format = inputNode.outputFormat(forBus: 0)
      inputNode.removeTap(onBus: 0)
      inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
        request.append(buffer)
      }

      self.audioEngine.prepare()
      do {
        try self.audioEngine.start()
      } catch {
        self.stopRecognition()
        reject("AUDIO_ENGINE_FAILED", error.localizedDescription, error)
        return
      }

      self.recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
        guard let self = self else { return }
        if let result = result {
          self.lastTranscript = result.bestTranscription.formattedString
          if result.isFinal {
            self.finishListening()
          }
        }

        if let error = error {
          guard self.activeResolve != nil else { return }
          let activeReject = self.activeReject
          self.stopRecognition()
          activeReject?("SPEECH_RECOGNITION_FAILED", error.localizedDescription, error)
        }
      }

      let duration = max(3.0, min(12.0, durationSeconds.doubleValue))
      self.finishTimer = Timer.scheduledTimer(withTimeInterval: duration, repeats: false) { [weak self] _ in
        self?.finishListening()
      }
    }
  }

  private func finishListening() {
    let transcript = lastTranscript
    let resolve = activeResolve
    stopRecognition()
    resolve?(["transcript": transcript])
  }

  private func resolveSpeech(spoken: Bool) {
    let resolve = speechResolve
    speechResolve = nil
    resolve?(["spoken": spoken])
  }

  private func preferredVoice() -> AVSpeechSynthesisVoice? {
    let preferredLanguages = ["en-CA", "en-US", "en-GB"]
    let voices = AVSpeechSynthesisVoice.speechVoices()

    for language in preferredLanguages {
      let languageVoices = voices
        .filter { $0.language == language }
        .sorted { $0.quality.rawValue > $1.quality.rawValue }
      if let voice = languageVoices.first {
        return voice
      }
    }

    return AVSpeechSynthesisVoice(language: "en-CA") ?? AVSpeechSynthesisVoice(language: "en-US")
  }

  private func cancelActiveSpeech() {
    let resolve = speechResolve
    speechResolve = nil
    speechSynthesizer.stopSpeaking(at: .immediate)
    resolve?(["spoken": false])
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
    resolveSpeech(spoken: true)
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
    resolveSpeech(spoken: false)
  }

  private func stopRecognition() {
    finishTimer?.invalidate()
    finishTimer = nil
    activeResolve = nil
    activeReject = nil
    recognitionTask?.cancel()
    recognitionTask = nil
    recognitionRequest?.endAudio()
    recognitionRequest = nil

    if audioEngine.isRunning {
      audioEngine.stop()
      audioEngine.inputNode.removeTap(onBus: 0)
    }

    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}
