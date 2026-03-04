import { Loader2 } from 'lucide-react';

export default function CourseLoading() {
    return (
        <div className="min-h-screen bg-background flex flex-col">
            <div className="h-14 border-b bg-background/80 backdrop-blur" />
            <main className="flex-1 bg-background">
                <div className="flex flex-1 items-center justify-center">
                    <div className="flex flex-col items-center gap-3 animate-fade-in mt-32">
                        <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
                        <span className="text-sm text-muted-foreground">Loading class information...</span>
                    </div>
                </div>
            </main>
        </div>
    );
}
