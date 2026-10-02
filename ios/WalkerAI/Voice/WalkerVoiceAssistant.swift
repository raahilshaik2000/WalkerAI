@preconcurrency import AVFoundation
import Foundation
import React
import Speech

@objc(WalkerVoiceAssistant)
class WalkerVoiceAssistant: NSObject, AVSpeechSynthesizerDelegate, AVAudioPlayerDelegate {
  private let speechSynthesizer = AVSpeechSynthesizer()
  private var audioPlayer: AVAudioPlayer?
  private let audioEngine = AVAudioEngine()
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var activeResolve: RCTPromiseResolveBlock?
  private var activeReject: RCTPromiseRejectBlock?
  private var speechResolve: RCTPromiseResolveBlock?
  private var lastTranscript = ""
  private var finishTimer: Timer?
  private var silenceTimer: Timer?
  /// Pause after real speech before we treat the answer as done.
  private let silenceFinishDelay: TimeInterval = 2.6
  /// Faster wrap-up once the user barges in (e.g. "stop voice" / an option).
  private let bargeInSilenceDelay: TimeInterval = 1.8
  private let maxListenDuration: TimeInterval = 30.0
  private let minListenDuration: TimeInterval = 12.0
  private var isListeningPhase = false
  /// True while speakAndListen is in the "prompt aloud + listen for interrupt" mode.
  private var bargeInEnabled = false
  private var didBargeIn = false
  private var currentPromptText = ""
  private var activeContextStrings: [String] = []
  private var speakingFinishedAt: TimeInterval = 0
  private let audioSessionQueue = DispatchQueue(label: "com.walkerai.audiosession", qos: .userInitiated)

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
      self.bargeInEnabled = false
      self.cancelActiveSpeech()
      self.speechResolve = resolve

      let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
      if trimmedText.isEmpty {
        self.resolveSpeech(spoken: false)
        return
      }

      self.configurePlaybackSession()
      self.speakUtterance(trimmedText)
    }
  }

  @objc func stopSpeaking(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      self?.bargeInEnabled = false
      self?.cancelActiveSpeech()
      resolve(["stopped": true])
    }
  }

  @objc func cancelListening(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      self?.bargeInEnabled = false
      self?.resolveActiveListening(cancelled: true)
      resolve(["cancelled": true])
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
      self.bargeInEnabled = false
      self.cancelActiveSpeech()
      self.stopRecognition(clearCallbacks: true)

      self.activeResolve = resolve
      self.activeReject = reject
      self.startListeningPhase(
        locale: locale,
        durationSeconds: durationSeconds.doubleValue,
        contextualStrings: contextualStrings,
        clearTranscript: true
      )
    }
  }

  @objc func speakAndListen(
    _ text: String,
    locale: String,
    durationSeconds: NSNumber,
    contextualStrings: [String],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.cancelActiveSpeech()
      self.stopRecognition(clearCallbacks: true)

      let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale))
      guard let recognizer = recognizer, recognizer.isAvailable else {
        reject("SPEECH_UNAVAILABLE", "Speech recognition is unavailable on this device.", nil)
        return
      }
      _ = recognizer

      let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
      self.lastTranscript = ""
      self.didBargeIn = false
      self.currentPromptText = trimmedText
      self.activeResolve = resolve
      self.activeReject = reject
      self.bargeInEnabled = !trimmedText.isEmpty

      // Open mic first (speaker route + echo cancellation), THEN speak.
      // User can say "stop voice" / an option while the prompt is still talking.
      // Fan noise / TTS echo is ignored unless it looks like a real interrupt.
      self.startListeningPhase(
        locale: locale,
        durationSeconds: durationSeconds.doubleValue + (trimmedText.isEmpty ? 0 : 8),
        contextualStrings: contextualStrings,
        clearTranscript: true
      )

      guard self.isListeningPhase else { return }

      if !trimmedText.isEmpty {
        self.speakUtterance(trimmedText)
      }
    }
  }

  // MARK: - Speak helpers

  private var isSpeakingAloud: Bool {
    return speechSynthesizer.isSpeaking || (audioPlayer?.isPlaying == true)
  }

  private func speakUtterance(_ text: String) {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }

    let cacheKey = ttsCacheKey(for: trimmed)
    if let cachedData = loadCachedTTS(key: cacheKey) {
      playAudioData(cachedData, fallbackText: trimmed)
      return
    }

    fetchRealisticTTS(text: trimmed, cacheKey: cacheKey) { [weak self] data in
      DispatchQueue.main.async {
        guard let self = self else { return }
        guard self.speechResolve != nil || self.bargeInEnabled else { return }
        if let data = data {
          self.playAudioData(data, fallbackText: trimmed)
        } else {
          self.speakFallbackUtterance(trimmed)
        }
      }
    }
  }

  private func ensureSpeakerOutput() {
    let session = AVAudioSession.sharedInstance()
    if session.category == .playAndRecord {
      do {
        try session.overrideOutputAudioPort(.speaker)
      } catch {
        NSLog("[WalkerVoice] overrideOutputAudioPort to speaker failed: \(error.localizedDescription)")
      }
    }
  }

  private func playAudioData(_ data: Data, fallbackText: String) {
    ensureSpeakerOutput()
    do {
      let player = try AVAudioPlayer(data: data)
      player.delegate = self
      player.volume = 1.0
      self.audioPlayer = player
      player.prepareToPlay()
      player.play()
    } catch {
      NSLog("[WalkerVoice] AVAudioPlayer failed, falling back to speechSynthesizer: \(error.localizedDescription)")
      speakFallbackUtterance(fallbackText)
    }
  }

  private func speakFallbackUtterance(_ text: String) {
    ensureSpeakerOutput()
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = preferredVoice()
    utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.90
    utterance.pitchMultiplier = 1.0
    utterance.volume = 1.0
    utterance.preUtteranceDelay = 0.08
    utterance.postUtteranceDelay = 0.12
    speechSynthesizer.speak(utterance)
  }

  private func startListeningPhase(
    locale: String,
    durationSeconds: Double,
    contextualStrings: [String],
    clearTranscript: Bool
  ) {
    let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale))
    guard let recognizer = recognizer, recognizer.isAvailable else {
      let reject = activeReject
      stopRecognition(clearCallbacks: true)
      reject?("SPEECH_UNAVAILABLE", "Speech recognition is unavailable on this device.", nil)
      return
    }

    if clearTranscript {
      lastTranscript = ""
    }
    activeContextStrings = contextualStrings
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
    isListeningPhase = true

    do {
      try configureSpeakAndListenSession()
    } catch {
      let reject = activeReject
      stopRecognition(clearCallbacks: true)
      reject?("AUDIO_SESSION_FAILED", error.localizedDescription, error)
      return
    }

    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    if #available(iOS 13.0, *) {
      request.taskHint = .dictation
    }
    // Prefer on-device when available — lower latency for barge-in.
    if #available(iOS 13.0, *), recognizer.supportsOnDeviceRecognition {
      request.requiresOnDeviceRecognition = true
    }
    request.contextualStrings = activeContextStrings
    recognitionRequest = request

    let inputNode = audioEngine.inputNode
    let format = inputNode.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else {
      let reject = activeReject
      stopRecognition(clearCallbacks: true)
      reject?("AUDIO_INPUT_UNAVAILABLE", "Microphone input format is unavailable.", nil)
      return
    }
    inputNode.removeTap(onBus: 0)
    inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
      guard buffer.frameLength > 00 else { return }
      request.append(buffer)
     }

    audioEngine.prepare()
    do {
      try audioEngine.start()
      ensureSpeakerOutput()
    } catch {
      let reject = activeReject
      stopRecognition(clearCallbacks: true)
      reject?("AUDIO_ENGINE_FAILED", error.localizedDescription, error)
      return
    }

    recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
      guard let self = self else { return }
      guard self.isListeningPhase else { return }

      if let result = result {
        let formatted = result.bestTranscription.formattedString
        let text = formatted.trimmingCharacters(in: .whitespacesAndNewlines)
        self.handleRecognitionTranscript(formatted, trimmed: text)
      }

      if let error = error {
        guard self.activeResolve != nil else { return }
        let activeReject = self.activeReject
        self.stopRecognition(clearCallbacks: true)
        activeReject?("SPEECH_RECOGNITION_FAILED", error.localizedDescription, error)
      }
    }

    let duration = max(minListenDuration, min(maxListenDuration, durationSeconds))
    finishTimer?.invalidate()
    finishTimer = Timer.scheduledTimer(withTimeInterval: duration, repeats: false) { [weak self] _ in
      self?.finishListening()
    }
  }

  private func isExplicitStopIntent(_ transcript: String) -> Bool {
    let t = transcript.lowercased()
    let stopHints = [
      "stop", "stop voice", "stop talking", "cancel", "quit", "exit", "pause",
      "shut up", "be quiet", "enough", "hold on", "wait", "mute", "manual",
      "voice cancelled", "tap manually",
    ]
    return stopHints.contains(where: { t.contains($0) })
  }

  private func handleRecognitionTranscript(_ formatted: String, trimmed: String) {
    guard hasUsableTranscript(trimmed) else { return }

    // While Walker is talking: only react to real user interrupts (stop / option / spoken answer),
    // never to fan noise or continuous prompt echoing back into the mic.
    if bargeInEnabled && isSpeakingAloud && !didBargeIn {
      if looksLikePromptEcho(trimmed) { return }
      guard isBargeInIntent(trimmed) else { return }

      didBargeIn = true
      if isExplicitStopIntent(trimmed) {
        lastTranscript = "stop voice"
      } else {
        lastTranscript = formatted
      }

      if audioPlayer?.isPlaying == true {
        audioPlayer?.stop()
        audioPlayer = nil
      }
      speechSynthesizer.stopSpeaking(at: .word)
      scheduleSilenceFinishIfNeeded(delay: bargeInSilenceDelay)
      return
    }

    if looksLikePromptEcho(trimmed), !didBargeIn, isSpeakingAloud {
      return
    }

    // Ignore residual speaker tail right after speech ends
    if CACurrentMediaTime() - speakingFinishedAt < 0.45 {
      return
    }

    lastTranscript = formatted
    // Do not finish on isFinal alone — Apple often finalizes mid-answer.
    scheduleSilenceFinishIfNeeded(delay: didBargeIn ? bargeInSilenceDelay : silenceFinishDelay)
  }

  /// Ignore fan / AC noise that produces empty or 1-character junk.
  private func hasUsableTranscript(_ text: String) -> Bool {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.count >= 2 else { return false }
    let words = trimmed.split { !$0.isLetter && !$0.isNumber }
    return words.contains { $0.count >= 2 }
  }

  private func normalizeForCompare(_ text: String) -> String {
    text.lowercased()
      .components(separatedBy: CharacterSet.alphanumerics.inverted)
      .filter { !$0.isEmpty }
      .joined(separator: " ")
  }

  /// TTS often leaks into the mic — ignore transcripts that are just the continuous prompt text being read.
  /// Any phrase or word sequence verbatim present in the prompt while speaking is treated as acoustic echo.
  private func looksLikePromptEcho(_ transcript: String) -> Bool {
    let prompt = normalizeForCompare(currentPromptText)
    let heard = normalizeForCompare(transcript)
    guard !heard.isEmpty, !prompt.isEmpty else { return false }

    // Direct containment: if the heard text is inside the prompt, it's the speaker audio echoing back
    if prompt.contains(heard) {
      return true
    }

    let heardWords = heard.split(separator: " ").map(String.init)

    // Check if the heard words are verbatim matching the question sentence (the prompt before options)
    if let questionEndIdx = currentPromptText.range(of: "?")?.upperBound {
      let questionOnly = normalizeForCompare(String(currentPromptText[..<questionEndIdx]))
      if !questionOnly.isEmpty && questionOnly.contains(heard) {
        return true
      }
    }

    // Check if all heard words exist in the prompt (e.g. "option 1" or "vanity sink")
    if heardWords.count >= 2 {
      let matchingWords = heardWords.filter { prompt.contains($0) }
      if matchingWords.count == heardWords.count {
        return true
      }
    }

    // If heard contains a sequence of 3+ consecutive words matching the prompt verbatim
    if heardWords.count >= 3 {
      let heardPhrase = heardWords.joined(separator: " ")
      if prompt.contains(heardPhrase) {
        return true
      }
    }

    let promptPrefix = String(prompt.prefix(min(48, prompt.count)))
    if heard.contains(promptPrefix) {
      return true
    }

    return false
  }

  /// User wants to cut in: stop voice, pick an option, etc.
  private func isBargeInIntent(_ transcript: String) -> Bool {
    let t = transcript.lowercased()

    let stopHints = [
      "stop", "stop voice", "stop talking", "cancel", "quit", "exit", "pause",
      "shut up", "be quiet", "enough", "hold on", "wait", "mute", "manual",
      "voice cancelled", "tap manually",
    ]
    if stopHints.contains(where: { t.contains($0) }) {
      return true
    }

    if t.range(of: #"\b(option\s*)?(one|two|three|four|five|[1-5])\b"#, options: .regularExpression) != nil {
      return true
    }

    let selectHints = [
      "i want", "i'll take", "ill take", "go with", "choose", "select", "pick",
      "take the", "let's do", "lets do", "go ahead", "that one", "this one",
      "first", "second", "third", "fourth", "fifth", "last",
    ]
    if selectHints.contains(where: { t.contains($0) }) {
      return true
    }

    for term in activeContextStrings {
      let c = term.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
      guard c.count >= 3 else { continue }
      if t.contains(c) { return true }
    }

    // User spoke 2 or more distinct words into the mic
    let words = t.components(separatedBy: CharacterSet.alphanumerics.inverted).filter { $0.count >= 2 }
    if words.count >= 2 {
      return true
    }

    return false
  }

  private func scheduleSilenceFinishIfNeeded(delay: TimeInterval) {
    let transcript = lastTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
    guard hasUsableTranscript(transcript) else { return }
    // Never end the turn on silence while Walker is still speaking (unless barged in).
    if isSpeakingAloud && !didBargeIn { return }

    silenceTimer?.invalidate()
    silenceTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
      self?.finishListening()
    }
  }

  private func finishListening() {
    resolveActiveListening(cancelled: false)
  }

  private func resolveActiveListening(cancelled: Bool) {
    let transcript = lastTranscript
    let resolve = activeResolve
    bargeInEnabled = false
    stopRecognition(clearCallbacks: true)
    resolve?(["transcript": transcript, "cancelled": cancelled])
  }

  private func resolveSpeech(spoken: Bool) {
    let resolve = speechResolve
    speechResolve = nil
    resolve?(["spoken": spoken])
  }

  private func preferredVoice() -> AVSpeechSynthesisVoice? {
    let preferredLanguages = ["en-CA", "en-US", "en-GB"]
    let preferredNames = ["Samantha", "Ava", "Allison", "Joelle", "Karen", "Moira", "Daniel"]
    let voices = AVSpeechSynthesisVoice.speechVoices()

    let rankedVoices = voices
      .filter { preferredLanguages.contains($0.language) }
      .sorted { lhs, rhs in
        if lhs.quality.rawValue != rhs.quality.rawValue {
          return lhs.quality.rawValue > rhs.quality.rawValue
        }

        let lhsLanguageRank = preferredLanguages.firstIndex(of: lhs.language) ?? preferredLanguages.count
        let rhsLanguageRank = preferredLanguages.firstIndex(of: rhs.language) ?? preferredLanguages.count
        if lhsLanguageRank != rhsLanguageRank {
          return lhsLanguageRank < rhsLanguageRank
        }

        let lhsNameRank = preferredNames.firstIndex(where: { lhs.name.localizedCaseInsensitiveContains($0) }) ?? preferredNames.count
        let rhsNameRank = preferredNames.firstIndex(where: { rhs.name.localizedCaseInsensitiveContains($0) }) ?? preferredNames.count
        if lhsNameRank != rhsNameRank {
          return lhsNameRank < rhsNameRank
        }

        return lhs.name < rhs.name
      }

    if let voice = rankedVoices.first {
      return voice
    }

    return AVSpeechSynthesisVoice(language: "en-CA") ?? AVSpeechSynthesisVoice(language: "en-US")
  }

  /// Loud speaker path for speak-only prompts.
  private func configurePlaybackSession() {
    audioSessionQueue.async {
      let session = AVAudioSession.sharedInstance()
      if session.category == .playback && session.mode == .spokenAudio {
        return
      }
      do {
        try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try session.setActive(true, options: [])
      } catch {
        NSLog("[WalkerVoice] Failed to configure audio session for playback: \(error.localizedDescription)")
      }
    }
  }

  /// Mic + loud speaker together so barge-in works with clear, full-volume TTS.
  /// Enforces defaultToSpeaker and speaker override so audio plays from the loudspeaker
  /// instead of the low-volume earpiece receiver, without telephony ducking.
  private func configureSpeakAndListenSession() throws {
    try audioSessionQueue.sync {
      let session = AVAudioSession.sharedInstance()
      let options: AVAudioSession.CategoryOptions = [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP]
      if session.category != .playAndRecord || session.mode != .default {
        try session.setCategory(
          .playAndRecord,
          mode: .default,
          options: options
        )
        try session.setActive(true, options: [])
      }
      try session.overrideOutputAudioPort(.speaker)
    }
  }

  private func cancelActiveSpeech() {
    let resolve = speechResolve
    speechResolve = nil
    if audioPlayer?.isPlaying == true {
      audioPlayer?.stop()
      audioPlayer = nil
    }
    if speechSynthesizer.isSpeaking {
      speechSynthesizer.stopSpeaking(at: .immediate)
    }
    resolve?(["spoken": false])
  }

  // MARK: - AVAudioPlayerDelegate

  func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    audioPlayer = nil
    speakingFinishedAt = CACurrentMediaTime()
    lastTranscript = ""
    silenceTimer?.invalidate()
    resolveSpeech(spoken: flag)
  }

  func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
    audioPlayer = nil
    speakingFinishedAt = CACurrentMediaTime()
    resolveSpeech(spoken: false)
  }

  // MARK: - AVSpeechSynthesizerDelegate

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
    speakingFinishedAt = CACurrentMediaTime()
    lastTranscript = ""
    silenceTimer?.invalidate()
    resolveSpeech(spoken: true)
    // Prompt finished — keep listening for the answer; silence timer handles wrap-up.
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
    speakingFinishedAt = CACurrentMediaTime()
    resolveSpeech(spoken: false)
  }

  // MARK: - Realistic TTS Caching & Networking

  /// Deterministic 64-bit hash so cached TTS files persist across app restarts.
  private func stableHash(_ string: String) -> String {
    var hash: UInt64 = 5381
    for byte in string.utf8 {
      hash = ((hash << 5) &+ hash) &+ UInt64(byte)
    }
    return String(hash, radix: 16)
  }

  private func ttsCacheKey(for text: String) -> String {
    let sanitized = text.lowercased().filter { $0.isLetter || $0.isNumber }
    let prefix = String(sanitized.prefix(32))
    let hash = stableHash(text)
    return "tts_\(prefix)_\(hash).mp3"
  }

  private func cacheFileURL(for key: String) -> URL? {
    guard let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }
    return cacheDir.appendingPathComponent(key)
  }

  private func loadCachedTTS(key: String) -> Data? {
    guard let url = cacheFileURL(for: key), FileManager.default.fileExists(atPath: url.path) else { return nil }
    return try? Data(contentsOf: url)
  }

  private func saveCachedTTS(key: String, data: Data) {
    guard let url = cacheFileURL(for: key) else { return }
    try? data.write(to: url, options: .atomic)
  }

  private func fetchRealisticTTS(text: String, cacheKey: String, retryCount: Int = 1, completion: @escaping (Data?) -> Void) {
    guard let url = URL(string: "https://wgbloslndalmocckrejw.supabase.co/functions/v1/synthesize-speech") else {
      completion(nil)
      return
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnYmxvc2xuZGFsbW9jY2tyZWp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzc1MTcsImV4cCI6MjA4ODg1MzUxN30.8iOxzUmlrvedCmLTpdckgndwg75cfQ6y_rwteyM3s9c", forHTTPHeaderField: "Authorization")
    request.setValue("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnYmxvc2xuZGFsbW9jY2tyZWp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzc1MTcsImV4cCI6MjA4ODg1MzUxN30.8iOxzUmlrvedCmLTpdckgndwg75cfQ6y_rwteyM3s9c", forHTTPHeaderField: "apikey")
    request.timeoutInterval = 12.0

    let body: [String: Any] = ["text": text, "voice": "nova"]
    request.httpBody = try? JSONSerialization.data(withJSONObject: body)

    let task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
      if let error = error {
        NSLog("[WalkerVoice] Realistic TTS network error: \(error.localizedDescription)")
        if retryCount > 0 {
          NSLog("[WalkerVoice] Retrying Realistic TTS once with fresh connection...")
          self?.fetchRealisticTTS(text: text, cacheKey: cacheKey, retryCount: retryCount - 1, completion: completion)
          return
        }
        completion(nil)
        return
      }
      guard let http = response as? HTTPURLResponse, http.statusCode == 200, let data = data, !data.isEmpty else {
        let status = (response as? HTTPURLResponse)?.statusCode ?? -1
        NSLog("[WalkerVoice] Realistic TTS non-200 HTTP status: \(status)")
        if retryCount > 0 {
          NSLog("[WalkerVoice] Retrying Realistic TTS once on non-200 status...")
          self?.fetchRealisticTTS(text: text, cacheKey: cacheKey, retryCount: retryCount - 1, completion: completion)
          return
        }
        completion(nil)
        return
      }
      self?.saveCachedTTS(key: cacheKey, data: data)
      completion(data)
    }
    task.resume()
  }

  private func stopRecognition(clearCallbacks: Bool) {
    finishTimer?.invalidate()
    finishTimer = nil
    silenceTimer?.invalidate()
    silenceTimer = nil
    isListeningPhase = false
    if clearCallbacks {
      activeResolve = nil
      activeReject = nil
    }
    recognitionTask?.cancel()
    recognitionTask = nil
    recognitionRequest?.endAudio()
    recognitionRequest = nil

    if audioEngine.isRunning {
      audioEngine.stop()
      audioEngine.inputNode.removeTap(onBus: 0)
    }
  }
}
