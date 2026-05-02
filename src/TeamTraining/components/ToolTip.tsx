import { useState, useRef, ReactNode, useEffect } from 'react';

interface Props {
  text?: string;
  children: ReactNode;
  className?: string;
}

export function Tooltip({ text, children, className = '' }: Props) {
  const [show, setShow] = useState(false);
  const timer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleTouchStart = () => {
    timer.current = setTimeout(() => setShow(true), 400);
  };

  const handleTouchEnd = () => {
    if (timer.current) clearTimeout(timer.current);
    setTimeout(() => setShow(false), 2000);
  };

  if (!text) {
    return <>{children}</>;
  }

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {children}
      {show && (
        <div className="absolute z-[100] bottom-full mb-2 left-1/2 -translate-x-1/2 px-3 py-1.5 text-[11px] font-medium text-white bg-slate-800 border border-slate-600 rounded shadow-xl w-max max-w-[200px] text-center pointer-events-none break-words whitespace-normal leading-tight opacity-100 transition-opacity animate-in fade-in">
          {text}
        </div>
      )}
    </div>
  );
}
