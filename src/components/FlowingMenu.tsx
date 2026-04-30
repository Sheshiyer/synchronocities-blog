/**
 * FlowingMenu — vertical menu of items with a hover-revealed marquee overlay.
 * Each item slides a marquee strip in from the closest edge (top/bottom)
 * showing the item text + image repeated horizontally.
 *
 * Source: React Bits (TypeScript + Tailwind variant). Adapted with brand
 * colors and `client:load` mount via Astro.
 */
import React, { useRef, useEffect, useState } from 'react';
import { gsap } from 'gsap';

interface MenuItemData {
  link: string;
  text: string;
  image: string;
}

interface FlowingMenuProps {
  items?: MenuItemData[];
  speed?: number;
  textColor?: string;
  bgColor?: string;
  marqueeBgColor?: string;
  marqueeTextColor?: string;
  borderColor?: string;
  itemHeight?: string;
  fillContainer?: boolean;
}

interface MenuItemProps extends MenuItemData {
  speed: number;
  textColor: string;
  marqueeBgColor: string;
  marqueeTextColor: string;
  borderColor: string;
  isFirst: boolean;
  itemHeight?: string;
  fillContainer: boolean;
}

const FlowingMenu: React.FC<FlowingMenuProps> = ({
  items = [],
  speed = 15,
  textColor = '#F0EDE3',
  bgColor = '#070B1D',
  marqueeBgColor = '#C5A017',
  marqueeTextColor = '#070B1D',
  borderColor = 'rgba(138,155,168,0.18)',
  itemHeight,
  fillContainer = false,
}) => {
  return (
    <div className={`w-full ${fillContainer ? 'h-full' : ''} overflow-hidden`} style={{ backgroundColor: bgColor }}>
      <nav className={`flex flex-col ${fillContainer ? 'h-full' : ''} m-0 p-0`}>
        {items.map((item, idx) => (
          <MenuItem
            key={`${item.link}-${idx}`}
            {...item}
            speed={speed}
            textColor={textColor}
            marqueeBgColor={marqueeBgColor}
            marqueeTextColor={marqueeTextColor}
            borderColor={borderColor}
            isFirst={idx === 0}
            itemHeight={itemHeight}
            fillContainer={fillContainer}
          />
        ))}
      </nav>
    </div>
  );
};

const MenuItem: React.FC<MenuItemProps> = ({
  link,
  text,
  image,
  speed,
  textColor,
  marqueeBgColor,
  marqueeTextColor,
  borderColor,
  isFirst,
  itemHeight,
  fillContainer,
}) => {
  const itemRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const marqueeInnerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<gsap.core.Tween | null>(null);
  const [repetitions, setRepetitions] = useState(4);

  const animationDefaults = { duration: 0.6, ease: 'expo' };

  const findClosestEdge = (
    mouseX: number,
    mouseY: number,
    width: number,
    height: number,
  ): 'top' | 'bottom' => {
    const topEdgeDist = Math.pow(mouseX - width / 2, 2) + Math.pow(mouseY, 2);
    const bottomEdgeDist =
      Math.pow(mouseX - width / 2, 2) + Math.pow(mouseY - height, 2);
    return topEdgeDist < bottomEdgeDist ? 'top' : 'bottom';
  };

  useEffect(() => {
    const calculateRepetitions = () => {
      if (!marqueeInnerRef.current) return;
      const marqueeContent = marqueeInnerRef.current.querySelector(
        '.marquee-part',
      ) as HTMLElement;
      if (!marqueeContent) return;
      const contentWidth = marqueeContent.offsetWidth;
      const viewportWidth = window.innerWidth;
      const needed = Math.ceil(viewportWidth / contentWidth) + 2;
      setRepetitions(Math.max(4, needed));
    };

    calculateRepetitions();
    window.addEventListener('resize', calculateRepetitions);
    return () => window.removeEventListener('resize', calculateRepetitions);
  }, [text, image]);

  useEffect(() => {
    const setupMarquee = () => {
      if (!marqueeInnerRef.current) return;
      const marqueeContent = marqueeInnerRef.current.querySelector(
        '.marquee-part',
      ) as HTMLElement;
      if (!marqueeContent) return;
      const contentWidth = marqueeContent.offsetWidth;
      if (contentWidth === 0) return;

      if (animationRef.current) {
        animationRef.current.kill();
      }

      animationRef.current = gsap.to(marqueeInnerRef.current, {
        x: -contentWidth,
        duration: speed,
        ease: 'none',
        repeat: -1,
      });
    };

    const timer = setTimeout(setupMarquee, 50);
    return () => {
      clearTimeout(timer);
      if (animationRef.current) {
        animationRef.current.kill();
      }
    };
  }, [text, image, repetitions, speed]);

  const handleMouseEnter = (ev: React.MouseEvent<HTMLAnchorElement>) => {
    if (!itemRef.current || !marqueeRef.current || !marqueeInnerRef.current) return;
    const rect = itemRef.current.getBoundingClientRect();
    const edge = findClosestEdge(
      ev.clientX - rect.left,
      ev.clientY - rect.top,
      rect.width,
      rect.height,
    );

    gsap
      .timeline({ defaults: animationDefaults })
      .set(marqueeRef.current, { y: edge === 'top' ? '-101%' : '101%' }, 0)
      .set(marqueeInnerRef.current, { y: edge === 'top' ? '101%' : '-101%' }, 0)
      .to([marqueeRef.current, marqueeInnerRef.current], { y: '0%' }, 0);
  };

  const handleMouseLeave = (ev: React.MouseEvent<HTMLAnchorElement>) => {
    if (!itemRef.current || !marqueeRef.current || !marqueeInnerRef.current) return;
    const rect = itemRef.current.getBoundingClientRect();
    const edge = findClosestEdge(
      ev.clientX - rect.left,
      ev.clientY - rect.top,
      rect.width,
      rect.height,
    );

    gsap
      .timeline({ defaults: animationDefaults })
      .to(marqueeRef.current, { y: edge === 'top' ? '-101%' : '101%' }, 0)
      .to(marqueeInnerRef.current, { y: edge === 'top' ? '101%' : '-101%' }, 0);
  };

  const itemClass = fillContainer
    ? 'flex-1 relative overflow-hidden text-center'
    : 'relative overflow-hidden text-center';
  const itemStyle: React.CSSProperties = {
    borderTop: isFirst ? 'none' : `1px solid ${borderColor}`,
  };
  if (!fillContainer && itemHeight) {
    itemStyle.height = itemHeight;
  }

  const linkSizeClass = fillContainer
    ? 'text-[3vh]'
    : 'text-[clamp(1.05rem,2.2vw,1.65rem)]';

  return (
    <div className={itemClass} ref={itemRef} style={itemStyle}>
      <a
        className={`flex items-center justify-center h-full relative cursor-pointer uppercase no-underline font-semibold tracking-[0.04em] ${linkSizeClass}`}
        href={link}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ color: textColor, fontFamily: 'var(--font-display)' }}
      >
        {text}
      </a>
      <div
        className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none translate-y-[101%]"
        ref={marqueeRef}
        style={{ backgroundColor: marqueeBgColor }}
      >
        <div className="h-full w-fit flex" ref={marqueeInnerRef}>
          {[...Array(repetitions)].map((_, idx) => (
            <div
              className="marquee-part flex items-center flex-shrink-0"
              key={idx}
              style={{ color: marqueeTextColor }}
            >
              <span
                className={`whitespace-nowrap uppercase font-normal leading-[1] px-[1vw] tracking-[0.04em] ${
                  fillContainer ? 'text-[3vh]' : 'text-[clamp(1.05rem,2.2vw,1.65rem)]'
                }`}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {text}
              </span>
              <div
                className={`flex-shrink-0 ${
                  fillContainer
                    ? 'w-[180px] h-[6vh] my-[2em] mx-[2vw] py-[1em]'
                    : 'w-[120px] h-[60%] mx-[2vw]'
                } rounded-[14px] bg-cover bg-center shadow-[0_8px_24px_rgba(0,0,0,0.25)]`}
                style={{ backgroundImage: `url(${image})` }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FlowingMenu;
