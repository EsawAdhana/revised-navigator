'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { SiteHeader } from '@/components/site-header';
import { AlertCircle, RefreshCcw } from 'lucide-react';

export default function ErrorBoundary({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Optionally log the error to an error reporting service
        console.error('Unhandled application error:', error);
    }, [error]);

    return (
        <div className="min-h-screen flex flex-col bg-background">
            <SiteHeader />
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-destructive/10 text-destructive p-4 rounded-full mb-6 relative">
                <div className="absolute inset-0 bg-destructive/20 rounded-full animate-ping opacity-25" />
                <AlertCircle size={48} className="relative z-10" />
            </div>

            <h2 className="text-3xl font-extrabold text-foreground tracking-tight mb-3 font-[family-name:var(--font-outfit)]">
                Something went wrong!
            </h2>

            <p className="text-muted-foreground text-lg mb-8 max-w-md mx-auto">
                An unexpected error occurred while running the application. We apologize for the inconvenience.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
                <Button
                    onClick={() => reset()}
                    size="lg"
                    className="gap-2 font-bold font-[family-name:var(--font-outfit)] min-w-[160px]"
                >
                    <RefreshCcw size={18} />
                    Try Again
                </Button>
                <Button
                    variant="outline"
                    size="lg"
                    onClick={() => window.location.href = '/'}
                    className="gap-2 font-bold font-[family-name:var(--font-outfit)] min-w-[160px]"
                >
                    Return Home
                </Button>
            </div>

            {/* Dev-only error details */}
            {process.env.NODE_ENV === 'development' && (
                <div className="mt-12 text-left bg-secondary/30 p-4 rounded-lg border border-border/50 max-w-2xl w-full overflow-auto text-xs">
                    <p className="font-bold text-destructive mb-2">Developer Error Info:</p>
                    <pre className="text-muted-foreground whitespace-pre-wrap font-mono">
                        {error.message}
                        {'\n'}
                        {error.stack}
                    </pre>
                </div>
            )}
            </div>
        </div>
    );
}
