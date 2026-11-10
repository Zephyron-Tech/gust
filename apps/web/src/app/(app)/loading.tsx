// Shown while a page reads from the database or the host. Only after a short
// wait: most pages answer at once, and a flash of grey bars is worse than nothing.
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="fade-in space-y-8 [animation-delay:180ms]">
      <div className="space-y-3">
        <span className="skeleton block h-8 w-56" />
        <span className="skeleton block h-3.5 w-80" />
      </div>
      <span className="skeleton block h-28 rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="skeleton block h-40 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
