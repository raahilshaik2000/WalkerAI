import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * When the user returns to a screen, refresh from the backend in the background.
 * Cached data stays on screen — callers must not tie that refetch to a full-screen loader.
 * The first focus is skipped because the initial query/load already runs on mount.
 */
export function useSilentFocusRefetch(refetch: (() => unknown) | undefined) {
  const isFirstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (!refetch) return;
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      void Promise.resolve(refetch());
    }, [refetch]),
  );
}
