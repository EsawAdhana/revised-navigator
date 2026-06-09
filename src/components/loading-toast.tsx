"use client"

import * as React from "react"
import { useCourseStore } from "@/lib/store"
import { Logo } from "@/components/logo"
import { cn } from "@/lib/utils"

export function LoadingToast() {
    const isLoading = useCourseStore(state => state.isLoading)
    const show = isLoading

    const [isVisible, setIsVisible] = React.useState(false)
    const enterTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
    const exitTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

    React.useEffect(() => {
        if (show) {
            if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current)
            enterTimeoutRef.current = setTimeout(() => setIsVisible(true), 500)
        } else {
            if (enterTimeoutRef.current) clearTimeout(enterTimeoutRef.current)
            setIsVisible(prev => {
                if (prev) {
                    exitTimeoutRef.current = setTimeout(() => setIsVisible(false), 800)
                    return true
                }
                return false
            })
        }

        return () => {
            if (enterTimeoutRef.current) clearTimeout(enterTimeoutRef.current)
            if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current)
        }
    }, [show])

    if (!isVisible && !show) return null // Optimization: unmount if not visible and not loading

    if (!isVisible) return null

    return (
        <div
            role="status"
            aria-live="polite"
            className={cn(
                "fixed inset-0 z-[100] flex items-end justify-center pb-12 px-4 pointer-events-none",
                "transition-opacity duration-500",
                show ? "opacity-100" : "opacity-0"
            )}
        >
            <div className={cn(
                "bg-background/80 backdrop-blur-xl border border-border/40 shadow-2xl rounded-2xl p-6 max-w-[340px] text-center",
                "transform transition-all duration-500",
                show ? "translate-y-0 scale-100" : "translate-y-8 scale-95",
                "pointer-events-auto"
            )}>
                <div className="relative h-14 w-14 mx-auto mb-4">
                    <Logo className="w-full h-full object-contain animate-grow-up" />
                </div>

                <p className="text-sm font-medium text-foreground mb-1">
                    Laying down roots...
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                    The first time you open Stanford Root, it may take an additional few seconds to render data, but future uses will use cached data and should be near-instantaneous.
                </p>
            </div>
        </div>
    )
}
