import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

/**
 * Runs a gsap animation callback inside a React-safe context.
 * Cleans up all tweens/ScrollTriggers created inside `fn` on unmount.
 */
export function useGsapContext(fn, deps = []) {
  useEffect(() => {
    let extraCleanup;
    const ctx = gsap.context(() => { extraCleanup = fn(); });
    return () => {
      if (typeof extraCleanup === 'function') extraCleanup();
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
