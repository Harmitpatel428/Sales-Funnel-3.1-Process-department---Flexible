import { useState, useEffect, useCallback } from 'react';

interface Size {
    width: number;
    height: number;
}

export function useResizeObserver<T extends HTMLElement>() {
    const [size, setSize] = useState<Size>({ width: 0, height: 0 });
    const [element, setElement] = useState<T | null>(null);

    const ref = useCallback((node: T | null) => {
        if (node !== null) {
            setElement(node);
        }
    }, []);

    useEffect(() => {
        if (!element) return;

        if (!window.ResizeObserver) {
            setSize({ width: element.offsetWidth, height: element.offsetHeight });
            return;
        }

        const observer = new ResizeObserver((entries) => {
            if (!Array.isArray(entries) || !entries.length) return;
            const entry = entries[0];
            const { width, height } = entry.contentRect;
            setSize({ width, height });
        });

        observer.observe(element);
        return () => observer.disconnect();
    }, [element]);

    return { ref, width: size.width, height: size.height };
}
