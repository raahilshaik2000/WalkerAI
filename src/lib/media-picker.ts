import { Alert, Platform } from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  type Asset,
  type CameraOptions,
  type ImageLibraryOptions,
} from 'react-native-image-picker';

export type PickedMediaAsset = Asset;

type MediaPickOptions = {
  selectionLimit?: number;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  includeBase64?: boolean;
  /** When true, only library is offered (multi-select camera is awkward). */
  libraryOnly?: boolean;
};

/**
 * Prompt for Camera vs Photo Library, then return selected assets.
 * Returns null if the user cancels the chooser or the picker.
 */
export async function pickPhotosWithSource(
  options: MediaPickOptions = {},
): Promise<PickedMediaAsset[] | null> {
  const {
    selectionLimit = 1,
    quality = 0.8,
    maxWidth = 1200,
    maxHeight = 1200,
    includeBase64 = true,
    libraryOnly = false,
  } = options;

  const libraryOptions: ImageLibraryOptions = {
    mediaType: 'photo',
    selectionLimit,
    quality: quality as 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 1,
    maxWidth,
    maxHeight,
    includeBase64,
    assetRepresentationMode: 'compatible',
  };

  const cameraOptions: CameraOptions = {
    mediaType: 'photo',
    quality: quality as 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 1,
    maxWidth,
    maxHeight,
    includeBase64,
    saveToPhotos: false,
    cameraType: 'back',
    presentationStyle: 'fullScreen',
  };

  const openLibrary = async () => {
    const result = await launchImageLibrary(libraryOptions);
    if (result.errorCode) {
      Alert.alert('Photo picker failed', result.errorMessage ?? 'Please try again.');
      return null;
    }
    if (result.didCancel || !result.assets?.length) return null;
    return result.assets;
  };

  const openCamera = async () => {
    try {
      const result = await launchCamera(cameraOptions);
      if (result.errorCode) {
        if (result.errorCode === 'camera_unavailable') {
          // Camera not available (e.g. iOS Simulator) - seamlessly open Gallery
          return openLibrary();
        }
        const permissionHint = Platform.OS === 'ios'
          ? 'Check Camera access in Settings → WalkerAI.'
          : 'Check that camera permission is allowed for WalkerAI.';
        Alert.alert(
          'Camera unavailable',
          result.errorMessage ?? permissionHint,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Choose from Gallery', onPress: () => openLibrary() },
          ],
        );
        return null;
      }
      if (result.didCancel || !result.assets?.length) return null;
      return result.assets;
    } catch {
      return openLibrary();
    }
  };

  if (libraryOnly || selectionLimit > 1) {
    // Multi-select: offer choice, but camera adds one shot at a time.
    return new Promise((resolve) => {
      Alert.alert(
        'Add photos',
        'Take a new photo or choose from Gallery.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
          {
            text: 'Camera',
            onPress: () => {
              openCamera().then(resolve);
            },
          },
          {
            text: 'Gallery',
            onPress: () => {
              openLibrary().then(resolve);
            },
          },
        ],
      );
    });
  }

  return new Promise((resolve) => {
    Alert.alert(
      'Add photo',
      'Take a new photo or choose from Gallery.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        {
          text: 'Camera',
          onPress: () => {
            openCamera().then(resolve);
          },
        },
        {
          text: 'Gallery',
          onPress: () => {
            openLibrary().then(resolve);
          },
        },
      ],
    );
  });
}
