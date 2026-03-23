import React, { useRef } from 'react';
import { StyleSheet, View, StyleProp, ViewStyle } from 'react-native';
import { GooglePlacesAutocomplete, GooglePlacesAutocompleteRef } from 'react-native-google-places-autocomplete';
import Config from 'react-native-config';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Colors, Radius } from '@/constants/theme';

export interface AddressResult {
  fullAddress: string;
  street: string;
  city: string;
  province: string;
  postalCode: string;
  lat?: number;
  lng?: number;
}

interface AddressAutocompleteProps {
  placeholder?: string;
  initialValue?: string;
  onSelect: (result: AddressResult) => void;
  containerStyle?: StyleProp<ViewStyle>;
}

export function AddressAutocomplete({
  placeholder = 'Search address...',
  initialValue = '',
  onSelect,
  containerStyle,
}: AddressAutocompleteProps) {
  const ref = useRef<GooglePlacesAutocompleteRef>(null);

  return (
    <View style={[styles.container, containerStyle]}>
      <GooglePlacesAutocomplete
        ref={ref}
        placeholder={placeholder}
        textInputProps={{
          placeholderTextColor: Colors.text.tertiary,
          selectionColor: '#FFFFFF',
          defaultValue: initialValue,
        }}
        fetchDetails
        onPress={(data, details) => {
          if (!details) return;

          const components = details.address_components || [];
          const get = (type: string) =>
            components.find((c) => c.types.includes(type))?.long_name || '';
          const getShort = (type: string) =>
            components.find((c) => c.types.includes(type))?.short_name || '';

          const streetNumber = get('street_number');
          const route = get('route');
          const street = streetNumber ? `${streetNumber} ${route}` : route;

          onSelect({
            fullAddress: details.formatted_address || data.description,
            street,
            city: get('locality') || get('sublocality') || get('administrative_area_level_2'),
            province: getShort('administrative_area_level_1'),
            postalCode: get('postal_code'),
            lat: details.geometry?.location?.lat,
            lng: details.geometry?.location?.lng,
          });
        }}
        query={{
          key: Config.GOOGLE_MAPS_API_KEY || '',
          language: 'en',
          components: 'country:ca',
          types: 'address',
        }}
        enablePoweredByContainer={false}
        minLength={3}
        debounce={300}
        nearbyPlacesAPI="GooglePlacesSearch"
        renderLeftButton={() => (
          <View style={styles.iconWrap}>
            <Ionicons name="location-outline" size={18} color={Colors.text.tertiary} />
          </View>
        )}
        styles={{
          container: styles.autocompleteContainer,
          textInputContainer: styles.textInputContainer,
          textInput: styles.textInput,
          listView: styles.listView,
          row: styles.row,
          separator: styles.separator,
          description: styles.description,
          predefinedPlacesDescription: styles.description,
          poweredContainer: { display: 'none' },
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', zIndex: 10 },
  autocompleteContainer: { flex: 0 },
  textInputContainer: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  textInput: {
    backgroundColor: 'transparent',
    height: 54,
    fontSize: 15,
    color: '#FFFFFF',
    paddingHorizontal: 0,
    paddingRight: 16,
    marginBottom: 0,
    marginTop: 0,
  },
  iconWrap: {
    paddingLeft: 14,
    paddingRight: 8,
    justifyContent: 'center',
  },
  listView: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    marginTop: 6,
    overflow: 'hidden',
  },
  row: {
    backgroundColor: Colors.surface.default,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  description: {
    fontSize: 14,
    color: '#FFFFFF',
  },
});
