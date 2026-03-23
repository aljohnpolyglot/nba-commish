import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Returns { ref, inView }.
 * Once the element scrolls into view, inView becomes true and stays true.
 * The observer disconnects after first trigger (one-shot).
 */
export function useInView(threshold = 0.05): {
    ref: RefObject<HTMLDivElement>;
    inView: boolean;
} {
    const ref = useRef<HTMLDivElement>(null!);
    const [inView, setInView] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setInView(true);
                    observer.disconnect();
                }
            },
            { threshold }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, [threshold]);

    return { ref, inView };
}