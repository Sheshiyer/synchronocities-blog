export default function BackToTop() {
  const handleBackToTop = () => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '0.6rem',
        padding: '0.9rem',
        borderRadius: '1rem',
        border: '1px solid rgba(197, 160, 23, 0.18)',
        background: 'rgba(5, 9, 24, 0.68)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 18px 40px rgba(0, 0, 0, 0.22)',
      }}
    >
      <button
        type="button"
        onClick={handleBackToTop}
        style={{
          minHeight: '2.8rem',
          padding: '0.75rem 0.9rem',
          borderRadius: '9999px',
          border: '1px solid rgba(197, 160, 23, 0.22)',
          background: 'rgba(197, 160, 23, 0.1)',
          color: 'rgba(242, 241, 236, 0.96)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.74rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        Back to top
      </button>

      <a
        href="/journeys"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '2.8rem',
          padding: '0.75rem 0.9rem',
          borderRadius: '9999px',
          border: '1px solid rgba(197, 160, 23, 0.18)',
          background: 'rgba(255, 255, 255, 0.03)',
          color: 'rgba(242, 241, 236, 0.9)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.74rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          textDecoration: 'none',
          textAlign: 'center',
        }}
      >
        Back to journey
      </a>
    </div>
  );
}
