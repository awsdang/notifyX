import { clsx } from "clsx";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={clsx("animate-pulse rounded-lg bg-slate-200", className)}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-6">
      <Skeleton className="mb-3 h-5 w-2/3" />
      <Skeleton className="mb-2 h-4 w-full" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white">
      <div className="border-b border-slate-100 p-4">
        <Skeleton className="h-4 w-1/4" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-slate-50 p-4 last:border-0">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="h-4 w-1/6" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonStats() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-100 bg-white p-6">
          <Skeleton className="mb-2 h-3 w-1/2" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ))}
    </div>
  );
}
