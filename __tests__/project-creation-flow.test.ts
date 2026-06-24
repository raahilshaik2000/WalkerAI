export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('project creation flow guards', () => {
  it('collects address before generating the province-aware brief', () => {
    const rendersSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/renders.tsx'),
      'utf8',
    );
    const addressSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/address.tsx'),
      'utf8',
    );
    const briefSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/brief.tsx'),
      'utf8',
    );

    expect(rendersSource).toContain("navigation.navigate('Address')");
    expect(addressSource).toContain("navigation.navigate('Brief')");
    expect(briefSource).toContain("navigation.navigate('Confirm')");
    expect(briefSource).toContain("throw new Error('Project province is missing.");
    expect(briefSource).not.toContain("normalizeCanadianProvince(province) || 'ON'");
  });

  it('keeps voice address input behind geocoded address selection', () => {
    const addressSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/address.tsx'),
      'utf8',
    );
    const autocompleteSource = fs.readFileSync(
      path.join(__dirname, '../src/components/ui/AddressAutocomplete.tsx'),
      'utf8',
    );

    expect(addressSource).toContain('handleVoiceAddressSearch');
    expect(addressSource).toContain('listenForProjectAnswer(9)');
    expect(addressSource).toContain('voiceQuery={voiceQuery}');
    expect(addressSource).toContain('Please select a suggested address from the list');
    expect(addressSource).not.toContain('setAddress(transcript');
    expect(addressSource).not.toContain('address: transcript');
    expect(autocompleteSource).toContain('voiceQueryKey');
    expect(autocompleteSource).toContain('nominatim.openstreetmap.org/search');
    expect(autocompleteSource).not.toContain('FlatList');
    expect(autocompleteSource).toContain('results.map((item, index)');
  });

  it('disables voice controls when the native voice module is unavailable', () => {
    const questionnaireSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/questionnaire.tsx'),
      'utf8',
    );
    const addressSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/address.tsx'),
      'utf8',
    );

    expect(questionnaireSource).toContain('const voiceAvailable = isProjectVoiceAvailable();');
    expect(questionnaireSource).toContain('disabled={voiceBusy || !voiceAvailable || !!pendingVoiceMatch || voiceWalkthroughActive}');
    expect(questionnaireSource).toContain('Voice unavailable on this device');
    expect(questionnaireSource).toContain('Tap an answer manually to continue.');

    expect(addressSource).toContain('const voiceAvailable = isProjectVoiceAvailable();');
    expect(addressSource).toContain('disabled={voiceBusy || loading || !voiceAvailable}');
    expect(addressSource).toContain('Voice unavailable on this device');
    expect(addressSource).toContain('Type your address and select a suggested match.');
  });

  it('uses conversational voice matching to select confident questionnaire answers', () => {
    const questionnaireSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/questionnaire.tsx'),
      'utf8',
    );
    const nativeVoiceSource = fs.readFileSync(
      path.join(__dirname, '../ios/WalkerAI/Voice/WalkerVoiceAssistant.swift'),
      'utf8',
    );
    const nativeVoiceBridge = fs.readFileSync(
      path.join(__dirname, '../ios/WalkerAI/Voice/WalkerVoiceAssistant.m'),
      'utf8',
    );

    expect(questionnaireSource).toContain('analyzeTranscriptForQuestionOption');
    expect(questionnaireSource).toContain('buildVoiceContextTerms(activeQuestion)');
    expect(questionnaireSource).toContain('const transcript = await listenForProjectAnswer(9, voiceContextTerms);');
    expect(questionnaireSource).toContain('if (match.confidence >= 0.78) {');
    expect(questionnaireSource).toContain('setAnswer(activeQuestion.id, match.optionId);');
    expect(questionnaireSource).toContain('Say yes, no, or tell me the answer you want instead.');
    expect(questionnaireSource).toContain('const confirmationTranscript = await listenForProjectAnswer(6, [');
    expect(questionnaireSource).toContain('...voiceContextTerms,');
    expect(questionnaireSource).toContain('const alternateMatch = analyzeTranscriptForQuestionOption(confirmationTranscript, activeQuestion);');
    expect(questionnaireSource).toContain("type VoicePhase = 'idle' | 'speaking' | 'listening' | 'thinking' | 'helping' | 'confirming' | 'selected' | 'paused' | 'error';");
    expect(questionnaireSource).toContain("setVoicePhase('listening');");
    expect(questionnaireSource).toContain("setVoicePhase('selected');");
    expect(questionnaireSource).toContain("voicePhase === 'helping'");
    expect(questionnaireSource).toContain('Listening for your answer');
    expect(questionnaireSource).toContain('Checking your answer');
    expect(questionnaireSource).toContain('transcriptConfirmsSelection(confirmationTranscript)');
    expect(questionnaireSource).toContain('transcriptRejectsSelection(confirmationTranscript)');
    expect(questionnaireSource).toContain('transcriptRequestsVoiceStop(transcript)');
    expect(questionnaireSource).toContain('const startVoiceWalkthrough = async () => {');
    expect(questionnaireSource).toContain('voiceWalkthroughRef.current = true;');
    expect(questionnaireSource).toContain('while (voiceWalkthroughRef.current && safetyCount < questions.length + 2) {');
    expect(questionnaireSource).toContain('const shouldContinue = advanceAfterVoiceAnswer(activeQuestion, result.optionId);');
    expect(questionnaireSource).toContain('const stopVoiceWalkthrough = async () => {');
    expect(questionnaireSource).toContain('voiceWalkthroughRef.current = false;');
    expect(questionnaireSource).toContain('Start voice walkthrough');
    expect(questionnaireSource).toContain('Stop voice walkthrough');
    expect(questionnaireSource).not.toContain('const matchedOptionId = matchTranscriptToQuestionOption(transcript, question);');

    expect(nativeVoiceSource).toContain('request.contextualStrings = contextualStrings');
    expect(nativeVoiceSource).toContain('@objc func cancelListening(');
    expect(nativeVoiceSource).toContain('resolveActiveListening(cancelled: true)');
    expect(nativeVoiceSource).toContain('private func preferredVoice() -> AVSpeechSynthesisVoice?');
    expect(nativeVoiceBridge).toContain('contextualStrings:(NSArray *)contextualStrings');
    expect(nativeVoiceBridge).toContain('RCT_EXTERN_METHOD(cancelListening:');
  });

  it('uses app-safe copy for voice address, address save, and dispatch failures', () => {
    const addressSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/address.tsx'),
      'utf8',
    );
    const confirmSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/confirm.tsx'),
      'utf8',
    );

    expect(addressSource).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(addressSource).toContain("Alert.alert('Voice address failed', formatAppSafeErrorMessage(err, 'Please try again or type your address manually.'))");
    expect(addressSource).toContain("Alert.alert('Error', formatAppSafeErrorMessage(err, 'Could not save the project address. Please try again.'))");
    expect(addressSource).not.toContain("Alert.alert('Voice address failed', err instanceof Error ? err.message : 'Please try again or type your address manually.')");
    expect(addressSource).not.toContain("Alert.alert('Error', msg)");
    expect(addressSource).not.toContain('err?.details || err?.hint');

    expect(confirmSource).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(confirmSource).toContain("Alert.alert('Dispatch failed', formatAppSafeErrorMessage(err, 'Could not send this project to contractors. Please try again.'))");
    expect(confirmSource).not.toContain("Alert.alert('Dispatch failed', err instanceof Error ? err.message : 'Please try again.')");
  });

  it('uses app-safe copy for project creation analysis, voice, render, and brief failures', () => {
    const analyzingSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/analyzing.tsx'),
      'utf8',
    );
    const questionnaireSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/questionnaire.tsx'),
      'utf8',
    );
    const rendersSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/renders.tsx'),
      'utf8',
    );
    const briefSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/brief.tsx'),
      'utf8',
    );

    expect(analyzingSource).toContain("import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';");
    expect(analyzingSource).toContain("import { useNavigation, useRoute } from '@react-navigation/native';");
    expect(analyzingSource).toContain('const measurementsSkipped = route.params?.measurementsSkipped === true;');
    expect(analyzingSource).toContain("await supabase.auth.refreshSession();");
    expect(analyzingSource).toContain("throw new Error(formatAppSafeErrorMessage(recoveryError ?? lastError, 'Project creation failed. Please try again.'))");
    expect(analyzingSource).toContain("'Project setup timed out after skipping measurements. Your photos are still selected; retry analysis.'");
    expect(analyzingSource).toContain("'Analysis failed. Please try again.'");
    expect(analyzingSource).toContain('retryButtonText: { color: Colors.accentFg');
    expect(analyzingSource).not.toContain('Project creation failed: ${errorMessage');
    expect(analyzingSource).not.toContain('const msg = err?.message || err?.details || JSON.stringify(err);');
    expect(analyzingSource).not.toContain('setError(msg)');

    expect(questionnaireSource).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(questionnaireSource).toContain("setVoiceError(formatAppSafeErrorMessage(err, 'Voice answer failed. Try again or answer manually.'))");
    expect(questionnaireSource).not.toContain("setVoiceError(err instanceof Error ? err.message : 'Voice answer failed. Try again or answer manually.')");

    expect(rendersSource).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(rendersSource).toContain("setRenderError(visualPreviewUnavailableMessage(formatAppSafeErrorMessage(err, 'Render generation failed.')))");
    expect(rendersSource).toContain("setRenderError(formatAppSafeErrorMessage(clearError, 'Could not update render selection.'))");
    expect(rendersSource).toContain("setRenderError(formatAppSafeErrorMessage(selectError, 'Could not save selected render.'))");
    expect(rendersSource).toContain("setRenderError(formatAppSafeErrorMessage(projectUpdateError, 'Could not save project render selection.'))");
    expect(rendersSource).toContain("setRenderError(formatAppSafeErrorMessage(err, 'Could not save render selection.'))");
    expect(rendersSource).toContain('const [savingSelection, setSavingSelection] = useState(false);');
    expect(rendersSource).toContain('loading={savingSelection}');
    expect(rendersSource).not.toContain("visualPreviewUnavailableMessage(err instanceof Error ? err.message : 'Render generation failed.')");
    expect(rendersSource).not.toContain('setRenderError(`Could not update render selection: ${clearError.message}`)');
    expect(rendersSource).not.toContain('setRenderError(`Could not save selected render: ${selectError.message}`)');
    expect(rendersSource).not.toContain('setRenderError(`Could not save project render selection: ${projectUpdateError.message}`)');

    expect(briefSource).toContain("import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';");
    expect(briefSource).toContain("throw new Error(formatAppSafeErrorMessage(renderError, 'Selected render could not be loaded.'))");
    expect(briefSource).toContain("throw new Error(formatAppSafeErrorMessage(confidenceError, 'Brief saved but confidence score update failed.'))");
    expect(briefSource).toContain("formatAppSafeErrorMessage(\n            updateError,\n            `Could not save ${brief?.materials[sortOrder]?.item ?? 'material'} details.`,\n          )");
    expect(briefSource).toContain("setError(formatAppSafeErrorMessage(err, 'Failed to generate brief.'))");
    expect(briefSource).toContain("setError(formatAppSafeErrorMessage(err, 'Failed to save material details.'))");
    expect(briefSource).not.toContain('Selected render could not be loaded: ${renderError.message}');
    expect(briefSource).not.toContain('Brief saved but confidence score update failed: ${confidenceError.message}');
    expect(briefSource).not.toContain("details: ${updateError.message}");
    expect(briefSource).not.toContain("setError(err instanceof Error ? err.message : 'Failed to generate brief.')");
    expect(briefSource).not.toContain("setError(err instanceof Error ? err.message : 'Failed to save material details.')");
  });

  it('falls back to the active Supabase session before creating homeowner projects', () => {
    const analyzingSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/analyzing.tsx'),
      'utf8',
    );
    const diyGeneratingSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/diy-generating.tsx'),
      'utf8',
    );

    [analyzingSource, diyGeneratingSource].forEach((source) => {
      expect(source).toContain("import { getSession } from '@/lib/supabase/auth';");
      expect(source).toContain('user?.id ?? (await getSession())?.user?.id ?? null');
      expect(source).not.toContain('if (!user?.id)');
    });
    expect(analyzingSource).toContain('userId: currentUserId');
    expect(analyzingSource).toContain('}, [analysisRunId, measurementsSkipped, navigation, photos, projectId, roomType, setAnalysisResult, setQuestions, user?.id]);');
    expect(diyGeneratingSource).toContain('homeowner_id: currentUserId');
    expect(diyGeneratingSource).toContain('}, [navigation, store, user?.id]);');
  });

  it('serializes project photo saves before invoking photo analysis', () => {
    const analyzingSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/analyzing.tsx'),
      'utf8',
    );

    expect(analyzingSource).toContain('const PHOTO_SAVE_ATTEMPTS = 3;');
    expect(analyzingSource).toContain('function isTransientPhotoSaveError(error: unknown)');
    expect(analyzingSource).toContain('async function saveProjectPhoto(params: {');
    expect(analyzingSource).toContain("uploadBase64(\n        'project-photos',");
    expect(analyzingSource).toContain('{ retries: 2 },');
    expect(analyzingSource).toContain('for (const [i, photo] of localPhotos.entries()) {');
    expect(analyzingSource).toContain('uploadedPhotoResults.push(await saveProjectPhoto({');
    expect(analyzingSource).toContain('const canContinueWithLocalPhotos =');
    expect(analyzingSource).toContain('[analyzing] continuing with local photo payload after transient photo persistence failures:');
    expect(analyzingSource).toContain("supabase.functions.invoke('analyze-photos'");
    expect(analyzingSource.indexOf('uploadedPhotoResults.push(await saveProjectPhoto({')).toBeLessThan(
      analyzingSource.indexOf("supabase.functions.invoke('analyze-photos'"),
    );
    expect(analyzingSource).not.toContain('const uploadPromise = Promise.all(');
  });
});
