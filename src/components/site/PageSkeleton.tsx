export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="mx-auto w-full max-w-3xl flex-1 animate-pulse px-5 py-24 sm:px-8">
      <div className="h-3 w-24 bg-rule" />
      <div className="mt-6 h-12 w-3/4 bg-rule" />
      <div className="mt-10 space-y-3">
        <div className="h-3 bg-rule" />
        <div className="h-3 bg-rule" />
        <div className="h-3 w-5/6 bg-rule" />
      </div>
    </div>
  );
}
