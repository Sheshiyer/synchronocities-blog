import { useEffect } from 'react';

export default function ScrollReveal() {
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const paragraphs = document.querySelectorAll<HTMLElement>('.prose-synchronocities > p, .prose-synchronocities > blockquote');

    if (prefersReducedMotion) {
      paragraphs.forEach((paragraph) => {
        paragraph.classList.add('scroll-reveal', 'revealed');
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
          }
        });
      },
      { threshold: 0.25, rootMargin: '0px 0px -10% 0px' }
    );

    paragraphs.forEach((paragraph) => {
      paragraph.classList.add('scroll-reveal');
      observer.observe(paragraph);
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
