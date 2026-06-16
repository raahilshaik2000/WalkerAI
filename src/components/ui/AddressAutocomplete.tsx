import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Colors, Radius } from '@/constants/theme';
import { normalizeCanadianProvince } from '@/lib/canada';

export interface AddressResult {
  fullAddress: string;
  street: string;
  city: string;
  province: string;
  postalCode: string;
  lat?: number;
  lng?: number;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    'ISO3166-2-lvl4'?: string;
    postcode?: string;
    county?: string;
  };
}

interface AddressAutocompleteProps {
  placeholder?: string;
  initialValue?: string;
  voiceQuery?: string;
  voiceQueryKey?: number;
  onSelect: (result: AddressResult) => void;
  onClearSelection?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
}

export function AddressAutocomplete({
  placeholder = 'Search address...',
  initialValue = '',
  voiceQuery = '',
  voiceQueryKey = 0,
  onSelect,
  onClearSelection,
  containerStyle,
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const spokenQuery = voiceQuery.trim();
    if (!spokenQuery || voiceQueryKey <= 0) return;

    setSelected(false);
    setQuery(spokenQuery);
    setResults([]);
    onClearSelection?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceQueryKey]);

  useEffect(() => {
    if (selected || query.length < 4) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const url =
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=ca&q=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
          headers: { 'Accept-Language': 'en', 'User-Agent': 'WalkerAI/1.0' },
        });
        if (!res.ok) throw new Error(`Address lookup failed: ${res.status}`);
        const data: NominatimResult[] = await res.json();
        setResults(data.filter((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon))));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, selected]);

  const handleSelect = (item: NominatimResult) => {
    const a = item.address;
    const street = [a.house_number, a.road].filter(Boolean).join(' ');
    const city = a.city || a.town || a.village || a.county || '';
    const province = normalizeCanadianProvince(a['ISO3166-2-lvl4'] || a.state);
    const postalCode = a.postcode || '';

    // Build a clean display name (strip the country suffix)
    const parts = item.display_name.split(', ');
    const cleaned = parts.slice(0, -1).join(', '); // drop "Canada"

    setQuery(cleaned);
    setResults([]);
    setSelected(true);

    onSelect({
      fullAddress: cleaned,
      street,
      city,
      province,
      postalCode,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    });
  };

  const handleChangeText = (text: string) => {
    setSelected(false);
    onClearSelection?.();
    setQuery(text);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <View style={styles.inputRow}>
        <Ionicons name="location-outline" size={18} color={Colors.text.tertiary} style={styles.icon} />
        <TextInput
          style={styles.textInput}
          placeholder={placeholder}
          placeholderTextColor={Colors.text.tertiary}
          value={query}
          onChangeText={handleChangeText}
          selectionColor="#FF6B00"
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
        />
        {loading && <ActivityIndicator size="small" color={Colors.text.tertiary} style={styles.spinner} />}
        {query.length > 0 && !loading && (
          <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setSelected(false); onClearSelection?.(); }} style={styles.clearBtn}>
            <Ionicons name="close-circle" size={18} color={Colors.text.tertiary} />
          </TouchableOpacity>
        )}
      </View>

      {results.length > 0 && (
        <View style={styles.listView}>
          {results.map((item, index) => {
            const parts = item.display_name.split(', ');
            const primary = parts.slice(0, 2).join(', ');
            const secondary = parts.slice(2, -1).join(', '); // drop Canada
            return (
              <React.Fragment key={item.place_id}>
                <TouchableOpacity style={styles.row} onPress={() => handleSelect(item)} activeOpacity={0.7}>
                  <Ionicons name="location" size={14} color="#FF6B00" style={styles.rowIcon} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowPrimary} numberOfLines={1}>{primary}</Text>
                    {secondary ? <Text style={styles.rowSecondary} numberOfLines={1}>{secondary}</Text> : null}
                  </View>
                </TouchableOpacity>
                {index < results.length - 1 ? <View style={styles.separator} /> : null}
              </React.Fragment>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', zIndex: 10 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: 14,
    height: 54,
  },
  icon: { marginRight: 8 },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
    height: 54,
  },
  spinner: { marginLeft: 8 },
  clearBtn: { marginLeft: 8, padding: 2 },
  listView: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    marginTop: 6,
    maxHeight: 260,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  rowIcon: { flexShrink: 0 },
  rowText: { flex: 1 },
  rowPrimary: { fontSize: 14, color: '#FFFFFF', fontWeight: '500' },
  rowSecondary: { fontSize: 12, color: Colors.text.tertiary, marginTop: 2 },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginHorizontal: 14 },
});
