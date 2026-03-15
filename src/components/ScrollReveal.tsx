import { useEffect } from 'react';

export default function ScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    const paragraphs = document.querySelectorAll('.prose-synchronocities > p, .prose-synchronocities > blockquote');
    paragraphs.forEach((p) => {
      p.classList.add('scroll-reveal');
      observer.observe(p);
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
