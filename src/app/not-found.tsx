import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { Suspense } from 'react';

export default function NotFound() {
    return (
        <div className="min-h-screen flex flex-col bg-background">
            <Suspense>
                <SiteHeader />
            </Suspense>
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <h1 className="text-6xl font-extrabold text-foreground tracking-tight mb-2 font-[family-name:var(--font-outfit)]">
                    404
                </h1>
                <p className="text-lg text-muted-foreground mb-8 max-w-md">
                    The page you&apos;re looking for doesn&apos;t exist or has been moved.
                </p>
                <Button asChild size="lg" className="font-bold font-[family-name:var(--font-outfit)]">
                    <Link href="/">Return Home</Link>
                </Button>
            </div>
        </div>
    );
}
