import { useState, useEffect } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() => {
    if (typeof window === 'undefined') return 'desktop';
    const w = window.innerWidth;
    return w >= 1100 ? 'desktop' : w >= 768 ? 'tablet' : 'mobile';
  });
  useEffect(() => {
    const handle = () => {
      const w = window.innerWidth;
      setBp(w >= 1100 ? 'desktop' : w >= 768 ? 'tablet' : 'mobile');
    };
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);
  return bp;
}
