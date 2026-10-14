import { useEffect, useRef } from 'react';

/**
 * Inclinaison 3D qui suit la souris (classe CSS `.tilt`, reflet via un enfant `.tilt-glare`).
 * Inactive sur écran tactile et quand l'utilisateur demande moins d'animations.
 */
export function useTilt<T extends HTMLElement>(max = 7) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const set = (rx: number, ry: number, gx: number, gy: number) => {
      el.style.setProperty('--rx', `${rx}deg`); el.style.setProperty('--ry', `${ry}deg`);
      el.style.setProperty('--gx', `${gx}%`); el.style.setProperty('--gy', `${gy}%`);
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => set((0.5 - y) * max, (x - 0.5) * max, x * 100, y * 100));
    };
    const enter = () => el.classList.add('tilting');
    const leave = () => { cancelAnimationFrame(raf); el.classList.remove('tilting'); set(0, 0, 50, 50); };
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [max]);
  return ref;
}
