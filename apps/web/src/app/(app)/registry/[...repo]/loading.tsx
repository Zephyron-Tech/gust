// Shown at once while the tags of a repository load from the registry, which asks zot for each tag.
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading tags" className="fade-in space-y-7">
      <div className="space-y-3">
        <span className="skeleton block h-8 w-64" />
        <span className="skeleton block h-3.5 w-48" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-bg-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-6 border-t border-line px-5 py-4 first:border-t-0">
            <span className="skeleton block h-4 w-32" />
            <span className="skeleton block h-4 w-24" />
            <span className="skeleton block h-4 w-16" />
            <span className="skeleton block h-4 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}
