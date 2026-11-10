'use client';

// The last resort, when the root layout itself fails. No tokens or fonts are
// loaded here, so the page styles itself.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100svh',
          display: 'grid',
          placeItems: 'center',
          background: '#0d0e16',
          color: '#ecebf5',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <main style={{ maxWidth: 420, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Gust could not start this page</h1>
          <p style={{ color: '#a3a2b8', fontSize: 15, lineHeight: 1.5, margin: '0 0 20px' }}>
            Running apps are not affected. Try again; if it keeps failing, look at gust logs web on the server.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              height: 38,
              padding: '0 16px',
              borderRadius: 10,
              border: 0,
              background: '#8b80ff',
              color: '#120f2b',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
