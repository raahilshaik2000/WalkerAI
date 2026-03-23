;
import { Colors } from '@/constants/theme';

export default function ProjectDetailLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: Colors.bg.primary },
      }}
    />
  );
}
