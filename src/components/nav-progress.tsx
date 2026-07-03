'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const START_EVENT = 'root:nav-start';

/**
 * Trigger the top navigation progress bar for a programmatic navigation
 * (router.push / router.replace) where there's no anchor click to intercept.
 * Call this right before pushing a new route.
 */
export function startNavProgress() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(START_EVENT));
    }
}

/**
 * Cardinal-red top progress bar shown while a route transition is in flight.
 * Gives users immediate feedback that a click ("take me to that course") is
 * being processed, since App Router navigations can wait on data fetches.
 *
 * Start is detected two ways:
 *  - capture-phase clicks on internal <a> links (covers every <Link>), and
 *  - an explicit `startNavProgress()` call for programmatic router pushes.
 * Completion is detected when the pathname/query actually changes.
 */
export function NavProgress() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [visible, setVisible] = useState(false);
    const [progress, setProgress] = useState(0);

    const activeRef = useRef(false);
    const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const finishRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const clearTrickle = () => {
            if (trickleRef.current) {
                clearInterval(trickleRef.current);
                trickleRef.current = null;
            }
        };

        const start = () => {
            if (activeRef.current) return;
            activeRef.current = true;
            if (finishRef.current) clearTimeout(finishRef.current);
            setVisible(true);
            setProgress(8);
            clearTrickle();
            // Ease toward 90% and hold there until the route commits.
            trickleRef.current = setInterval(() => {
                setProgress(p => (p >= 90 ? p : p + (90 - p) * 0.1 + 0.4));
            }, 200);
        };

        const onClick = (e: MouseEvent) => {
            if (e.defaultPrevented || e.button !== 0) return;
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const anchor = (e.target as HTMLElement | null)?.closest('a');
            if (!anchor) return;
            const href = anchor.getAttribute('href');
            if (!href || anchor.hasAttribute('download')) return;
            if (anchor.target && anchor.target !== '_self') return;
            let url: URL;
            try {
                url = new URL(href, window.location.href);
            } catch {
                return;
            }
            if (url.origin !== window.location.origin) return;
            // Ignore in-page anchors / navigations to the exact same URL.
            if (url.pathname === window.location.pathname && url.search === window.location.search) return;
            start();
        };

        window.addEventListener(START_EVENT, start);
        document.addEventListener('click', onClick, true);
        return () => {
            window.removeEventListener(START_EVENT, start);
            document.removeEventListener('click', onClick, true);
            clearTrickle();
            if (finishRef.current) clearTimeout(finishRef.current);
        };
    }, []);

    // Route committed — snap to 100%, then fade out and reset.
    useEffect(() => {
        if (!activeRef.current) return;
        activeRef.current = false;
        if (trickleRef.current) {
            clearInterval(trickleRef.current);
            trickleRef.current = null;
        }
        setProgress(100);
        finishRef.current = setTimeout(() => {
            setVisible(false);
            setTimeout(() => setProgress(0), 200);
        }, 220);
    }, [pathname, searchParams]);

    // Safety net: never let the bar hang if a navigation is cancelled/aborted.
    useEffect(() => {
        if (!visible) return;
        const timeout = setTimeout(() => {
            activeRef.current = false;
            if (trickleRef.current) {
                clearInterval(trickleRef.current);
                trickleRef.current = null;
            }
            setVisible(false);
            setProgress(0);
        }, 10000);
        return () => clearTimeout(timeout);
    }, [visible]);

    if (!visible && progress === 0) return null;

    return (
        <div
            aria-hidden
            className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
        >
            <div
                className="h-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.7)] transition-[width,opacity] duration-200 ease-out"
                style={{ width: `${progress}%`, opacity: visible ? 1 : 0 }}
            />
        </div>
    );
}
