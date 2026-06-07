import React from 'react';
import Svg, { Defs, LinearGradient, Stop, Rect, Path } from 'react-native-svg';

interface WalkerLogoProps {
  size?: number;
}

export function WalkerLogo({ size = 32 }: WalkerLogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 400 400">
      <Defs>
        <LinearGradient id="wGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#FF6B00" />
          <Stop offset="100%" stopColor="#FF4500" />
        </LinearGradient>
      </Defs>
      <Rect width="400" height="400" rx="80" ry="80" fill="#0A0A0A" />
      <Path
        d="M 80,120 L 130,280 L 200,180 L 270,280 L 320,120"
        fill="none"
        stroke="url(#wGrad)"
        strokeWidth="28"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </Svg>
  );
}
