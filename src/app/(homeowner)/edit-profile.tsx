import React, { useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { AnimatedPressable, GlassInput, GradientBackground, AddressAutocomplete } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { useProfileStore } from '@/stores/profile.store';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { getUploadMetadata, uploadFile, type StorageUploadAsset } from '@/lib/supabase/storage';

export default function EditProfileScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { displayName, phone, address, city, province, avatarUri, updateProfile, setAvatar } = useProfileStore();

  const [name, setName] = useState(displayName || user?.email?.split('@')[0] || '');
  const [phoneVal, setPhoneVal] = useState(phone);
  const [saved, setSaved] = useState<string | null>(null);
  const currentAddress = [address, city, province].filter(Boolean).join(', ');

  const showSaved = (field: string) => {
    setSaved(field);
    ReactNativeHapticFeedback.trigger('impactLight');
    setTimeout(() => setSaved(null), 1500);
  };

  const saveField = async (field: 'displayName' | 'phone', value: string) => {
    try {
      if (!user?.id) throw new Error('Please sign in again before saving profile changes.');
      const column = field === 'displayName' ? 'full_name' : 'phone';
      const { error } = await supabase
        .from('users')
        .update({ [column]: value || null })
        .eq('id', user.id);
      if (error) {
        const missingProfileColumn = /column .* does not exist/i.test(error.message ?? '');
        if (!missingProfileColumn) throw error;
        console.warn(`users.${column} missing; saving ${field} locally only.`);
      }
      updateProfile({ [field]: value });
      showSaved(field);
    } catch (err) {
      Alert.alert('Save failed', formatAppSafeErrorMessage(err, 'Could not save profile changes.'));
    }
  };

  const saveAddress = async (result: {
    street: string;
    fullAddress: string;
    city: string;
    province: string;
    postalCode: string;
  }) => {
    const nextAddress = {
      address: result.street || result.fullAddress,
      city: result.city,
      province: result.province,
    };
    try {
      if (!user?.id) throw new Error('Please sign in again before saving profile changes.');
      const { error } = await supabase
        .from('users')
        .update({
          address: nextAddress.address || null,
          city: nextAddress.city || null,
          province: nextAddress.province || null,
          postal_code: result.postalCode || null,
        })
        .eq('id', user.id);
      if (error) {
        const missingAddressColumn = /column .*(address|postal_code).* does not exist/i.test(error.message ?? '');
        if (!missingAddressColumn) throw error;
        console.warn('user profile address columns missing; saving address locally only.');
      }
      updateProfile(nextAddress);
      showSaved('address');
    } catch (err) {
      Alert.alert('Save failed', formatAppSafeErrorMessage(err, 'Could not save profile address.'));
    }
  };

  const removeAvatar = async () => {
    try {
      if (!user?.id) throw new Error('Please sign in again before removing your profile photo.');
      const { error } = await supabase
        .from('users')
        .update({ avatar_url: null })
        .eq('id', user.id);
      if (error) {
        const missingAvatarColumn = /column .*avatar_url.* does not exist/i.test(error.message ?? '');
        if (!missingAvatarColumn) throw error;
        console.warn('users.avatar_url missing; removing avatar locally only.');
      }
      setAvatar(null);
      ReactNativeHapticFeedback.trigger('impactLight');
    } catch (err) {
      Alert.alert('Remove failed', formatAppSafeErrorMessage(err, 'Could not remove profile photo.'));
    }
  };

  const handlePickPhoto = () => {
    const options = ['Take Photo', 'Choose from Library', 'Remove Photo', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 3, destructiveButtonIndex: 2 },
        (index) => {
          if (index === 0) pickFromCamera();
          else if (index === 1) pickFromLibrary();
          else if (index === 2) { removeAvatar(); }
        },
      );
    } else {
      Alert.alert('Profile Photo', '', [
        { text: 'Take Photo', onPress: pickFromCamera },
        { text: 'Choose from Library', onPress: pickFromLibrary },
        { text: 'Remove Photo', style: 'destructive', onPress: removeAvatar },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const uploadAndSetAvatar = async (asset: StorageUploadAsset) => {
    try {
      if (!user?.id) throw new Error('Please sign in again before uploading a profile photo.');
      const upload = getUploadMetadata(asset);
      const path = `${user.id}/avatar_${Date.now()}.${upload.extension}`;
      const { publicUrl } = await uploadFile('avatars', path, upload.uri, upload.contentType);
      const { error } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);
      if (error) {
        const missingAvatarColumn = /column .*avatar_url.* does not exist/i.test(error.message ?? '');
        if (!missingAvatarColumn) throw error;
        console.warn('users.avatar_url missing; saving avatar locally only.');
      }
      setAvatar(publicUrl);
      ReactNativeHapticFeedback.trigger('impactMedium');
    } catch (err) {
      Alert.alert('Upload failed', formatAppSafeErrorMessage(err, 'Could not upload photo.'));
    }
  };

  const pickFromCamera = () => {
    launchCamera({
      mediaType: 'photo',
      maxWidth: 800,
      maxHeight: 800,
      quality: 0.8,
      assetRepresentationMode: 'compatible',
    }, (res) => {
      if (res.assets?.[0]?.uri) {
        uploadAndSetAvatar(res.assets[0]);
      }
    });
  };

  const pickFromLibrary = () => {
    launchImageLibrary({
      mediaType: 'photo',
      maxWidth: 800,
      maxHeight: 800,
      quality: 0.8,
      assetRepresentationMode: 'compatible',
    }, (res) => {
      if (res.assets?.[0]?.uri) {
        uploadAndSetAvatar(res.assets[0]);
      }
    });
  };

  const initials = (name || user?.email || 'U').slice(0, 2).toUpperCase();

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} haptic>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Avatar */}
          <View style={styles.avatarSection}>
            <AnimatedPressable onPress={handlePickPhoto} haptic>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.initials}>{initials}</Text>
                </View>
              )}
              <View style={styles.cameraOverlay}>
                <Ionicons name="camera" size={16} color="#fff" />
              </View>
            </AnimatedPressable>
            <AnimatedPressable onPress={handlePickPhoto} haptic>
              <Text style={styles.changePhotoText}>Change Photo</Text>
            </AnimatedPressable>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <FieldRow saved={saved === 'displayName'}>
              <GlassInput
                label="Display Name"
                value={name}
                onChangeText={setName}
                onBlur={() => name.length >= 2 && saveField('displayName', name)}
                autoCapitalize="words"
              />
            </FieldRow>

            <FieldRow saved={saved === 'phone'}>
              <GlassInput
                label="Phone Number"
                value={phoneVal}
                onChangeText={setPhoneVal}
                onBlur={() => saveField('phone', phoneVal)}
                keyboardType="phone-pad"
              />
            </FieldRow>

            {/* Address autocomplete */}
            <View style={styles.addressSection}>
              <Text style={styles.addressLabel}>Address</Text>
              {currentAddress ? (
                <View style={styles.currentAddress}>
                  <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                  <Text style={styles.currentAddressText}>{currentAddress}</Text>
                </View>
              ) : null}
              <AddressAutocomplete
                placeholder="Search new address..."
                initialValue=""
                onSelect={saveAddress}
              />
            </View>
          </View>

          <Text style={styles.savedText}>
            {saved ? '✓ Saved' : 'Changes save automatically'}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

function FieldRow({ saved, children }: { saved: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.fieldRow}>
      {children}
      {saved && (
        <View style={styles.savedBadge}>
          <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  scroll: { paddingHorizontal: 20, paddingBottom: 100 },

  avatarSection: { alignItems: 'center', marginBottom: 28, marginTop: 8 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { backgroundColor: Colors.surface.hover, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 32, fontWeight: '700', color: Colors.text.secondary },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: Colors.bg.primary,
  },
  changePhotoText: { fontSize: 14, fontWeight: '600', color: Colors.accent, marginTop: 10 },

  form: { gap: 4 },
  fieldRow: { position: 'relative' },
  savedBadge: { position: 'absolute', right: 12, top: 18, zIndex: 1 },

  addressSection: { marginBottom: 4, zIndex: 10 },
  addressLabel: { fontSize: 13, fontWeight: '600', color: Colors.text.tertiary, marginBottom: 8 },
  currentAddress: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  currentAddressText: { fontSize: 13, color: Colors.text.secondary, flex: 1 },

  savedText: { textAlign: 'center', fontSize: 12, color: Colors.text.tertiary, marginTop: 20 },
});
