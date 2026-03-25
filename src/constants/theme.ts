// Uber-inspired design system
// Monochromatic black/white palette, clean typography, no decorative gradients

export const Colors = {
  bg: {
    primary: '#000000',
    secondary: '#141414',
    elevated: '#1C1C1C',
  },
  surface: {
    default: '#1A1A1A',
    subtle:  '#141414',
    hover:   '#222222',
    border:  '#2A2A2A',
    borderStrong: '#3A3A3A',
  },
  // Primary action: white button, black text (Uber CTA style)
  accent: '#FFFFFF',
  accentFg: '#000000',
  // Brand orange for success/active states
  success: '#FF6B00',
  successGlow: 'rgba(255, 107, 0, 0.2)',
  warning: '#F5A623',
  error: '#E00B0B',
  text: {
    primary:   '#FFFFFF',
    secondary: '#ABABAB',
    tertiary:  '#6B6B6B',
    inverse:   '#000000',
  },
  // Keep glass namespace for backward compat but map to Uber values
  glass: {
    surface:       '#1A1A1A',
    surfaceHover:  '#222222',
    border:        '#2A2A2A',
    borderFocused: '#FFFFFF',
    highlight:     '#2A2A2A',
  },
} as const;

export const Spacing = {
  xs:  8,
  sm:  16,
  md:  24,
  lg:  32,
  xl:  40,
  xxl: 48,
} as const;

export const Radius = {
  card:   12,
  item:   10,
  button: 10,
  pill:   100,
  sm:     6,
  md:     8,
} as const;

export const Typography = {
  display: {
    fontSize: 36,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
    color: Colors.text.primary,
  },
  h1: {
    fontSize: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
    color: Colors.text.primary,
  },
  h2: {
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
    color: Colors.text.primary,
  },
  h3: {
    fontSize: 17,
    fontWeight: '600' as const,
    letterSpacing: 0,
    color: Colors.text.primary,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22,
    color: Colors.text.primary,
  },
  bodySecondary: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22,
    color: Colors.text.secondary,
  },
  label: {
    fontSize: 12,
    fontWeight: '500' as const,
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
    color: Colors.text.tertiary,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400' as const,
    color: Colors.text.secondary,
  },
} as const;

export const Shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  button: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
} as const;
