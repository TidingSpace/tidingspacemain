'use client';

import { createContext, useContext, useState, useCallback } from 'react';

type BottomNavVisibilityContextValue = {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
};

const BottomNavVisibilityContext = createContext<BottomNavVisibilityContextValue>({
  hidden: false,
  setHidden: () => {}
});

// Lets an individual page override bottom nav visibility beyond what the
// route alone can express — needed specifically because /profile/[userId]
// shows the nav for your OWN profile but not someone else's, and both are
// the exact same route pattern. Most pages never need this at all; the
// route-based allowlist in PersistentBottomNav handles everything else.
export function BottomNavVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHiddenState] = useState(false);
  const setHidden = useCallback((next: boolean) => setHiddenState(next), []);
  return (
    <BottomNavVisibilityContext.Provider value={{ hidden, setHidden }}>
      {children}
    </BottomNavVisibilityContext.Provider>
  );
}

export function useBottomNavVisibility() {
  return useContext(BottomNavVisibilityContext);
}
