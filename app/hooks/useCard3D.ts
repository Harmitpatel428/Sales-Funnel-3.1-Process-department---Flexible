'use client';

import { useEffect, useRef } from 'react';

// Throttle function to limit update frequency
const throttle = <T extends (...args: unknown[]) => void>(fn: T, limit: number): T => {
  let inThrottle = false;
  return ((...args: unknown[]) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  }) as T;
};

// Check if device has reduced performance capability
const isLowEndDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const cores = navigator.hardwareConcurrency || 4;
  return cores < 4;
};

// Check if user prefers reduced motion
const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// Define GSAP Types locally to avoid importing the whole library just for types if we can avoid it.
// However, since we are using 'import type' or just treating it as 'any' or 'unknown' until loaded.
// For simplicity in this lazy loading implementation, we'll use dynamic import.

export const useCard3D = () => {
  const cursorBlobRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Early return for reduced motion preference or low-end devices
    if (prefersReducedMotion() || isLowEndDevice()) {
      return;
    }

    const cursorBlob = cursorBlobRef.current;
    if (!cursorBlob) return;

    // Get all cards with card-3d class
    const cards = document.querySelectorAll('.card-3d') as NodeListOf<HTMLButtonElement>;
    if (cards.length === 0) return;

    // ------------------------------------------------------------
    // LAZY LOAD GSAP
    // ------------------------------------------------------------
    let gsapInstance: any = null;

    import('gsap').then((gsapModule) => {
      gsapInstance = gsapModule.gsap;
      initAnimations();
    });

    let mouseX = 0;
    let mouseY = 0;
    let blobX = 0;
    let blobY = 0;

    // We wrapper the animation logic to only run if GSAP is loaded
    const updateCursorBlob = throttle((x: number, y: number) => {
      if (!gsapInstance) return;
      gsapInstance.to(cursorBlob, {
        x: x,
        y: y,
        duration: 0.4,
        ease: "power2.out",
        force3D: true
      });
    }, 32);


    const handleMouseMove = (e: MouseEvent) => {
      if (!gsapInstance) return;

      const card = e.currentTarget as HTMLButtonElement;
      const rect = card.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      mouseX = e.clientX - centerX;
      mouseY = e.clientY - centerY;

      const distance = Math.sqrt(mouseX * mouseX + mouseY * mouseY);
      const maxDistance = Math.sqrt(rect.width * rect.width + rect.height * rect.height) / 2;

      if (distance < maxDistance) {
        blobX = e.clientX;
        blobY = e.clientY;
        updateCursorBlob(blobX, blobY);

        const tiltX = (mouseY / rect.height) * 8;
        const tiltY = (mouseX / rect.width) * -8;
        const scale = 1 + (0.07 * (1 - distance / maxDistance));

        const shineX = ((e.clientX - rect.left) / rect.width) * 100;
        const shineY = ((e.clientY - rect.top) / rect.height) * 100;

        card.style.setProperty('--mouse-x', `${shineX}%`);
        card.style.setProperty('--mouse-y', `${shineY}%`);

        gsapInstance.to(card, {
          rotationX: tiltX,
          rotationY: tiltY,
          scale: scale,
          duration: 0.4,
          ease: "power2.out",
          force3D: true
        });

        cursorBlob.classList.remove('hidden');
      }
    };

    const throttledMouseMove = throttle(handleMouseMove, 16);

    const handleMouseLeave = (e: MouseEvent) => {
      if (!gsapInstance) return;
      const card = e.currentTarget as HTMLButtonElement;
      gsapInstance.to(card, {
        rotationX: 0,
        rotationY: 0,
        scale: 1,
        duration: 0.6,
        ease: "elastic.out(1, 0.3)",
        force3D: true
      });
      cursorBlob.classList.add('hidden');
    };

    const handleMouseEnter = () => {
      cursorBlob.classList.remove('hidden');
    };

    const initAnimations = () => {
      cards.forEach(card => {
        card.addEventListener('mousemove', throttledMouseMove);
        card.addEventListener('mouseleave', handleMouseLeave);
        card.addEventListener('mouseenter', handleMouseEnter);
      });
    };

    // Cleanup
    return () => {
      cards.forEach(card => {
        card.removeEventListener('mousemove', throttledMouseMove);
        card.removeEventListener('mouseleave', handleMouseLeave);
        card.removeEventListener('mouseenter', handleMouseEnter);
      });
    };
  }, []);

  return { cursorBlobRef };
};
