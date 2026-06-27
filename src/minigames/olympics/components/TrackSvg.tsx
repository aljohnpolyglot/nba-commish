import React, { ReactNode } from 'react';

export function TrackSvg({ className, children, style, viewBox }: { className?: string, children?: ReactNode, style?: React.CSSProperties, viewBox?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox={viewBox || "-0.453 -0.682 515 201"} width="100%" height="100%" className={className} style={style}>
      <rect x=".5" y=".5" height="199" width="512.9" rx="99.5" ry="99.5" stroke="#fff" strokeWidth="1" fill="#9b373a"/>
      <rect x="64" y="20.8" width="389.2" height="158.4" rx="45" ry="45" fill="#9bc66c"/>
      <g stroke="#fff" strokeWidth=".5" fill="none">
        <rect x="3" y="3" height="194" width="507.9" rx="99" ry="97"/>
        <rect x="5.5" y="5.5" height="189" width="502.9" rx="97.5" ry="94.5"/>
        <rect x="8" y="8" height="184" width="497.9" rx="97" ry="92"/>
        <rect x="10.5" y="10.5" height="179" width="492.9" rx="96" ry="89.5"/>
        <rect x="13" y="13" height="174" width="487.9" rx="95" ry="87"/>
        <rect x="15.5" y="15.5" height="169" width="482.9" rx="94" ry="84.5"/>
        <rect x="18" y="18" height="164" width="477.9" rx="93" ry="82"/>
        <rect x="20.5" y="20.5" height="159" width="472.9" rx="92" ry="79.5"/>
      </g>
      <path d="M179.75,23.75h19.5v9.5h-19.5zM329.25,32.75h19.5v9.5h-19.5z" fill="#DEAA87" stroke="#fff" strokeWidth=".5"/>
      <path d="M199.25,27.25h139.5v2.5h-139.5zM189.75,36.25h139.5v2.5h-139.5z" fill="#9b373a" stroke="#fff" strokeWidth=".5"/>
      <path d="M30.5,179.5h89v20h-89z" fill="#9b273a"/>
      <path d="M30.25,182h88.6M30.25,184.5h88.6M30.25,187h88.6M30.25,189.5h88.6M30.25,192h88.6M30.25,194.5h88.6M30.25,197h88.6" fill="none" stroke="#fff" strokeWidth=".5"/>
      <path d="M30.5,179.5h89v20h-89z" fill="none" stroke="#fff" strokeDasharray="1,2"/>
      <path d="M119.5,179v21M392.9,179v21" fill="none" stroke="#fff" strokeWidth="1"/>
      <path d="M29.8,182h89.5M29.8,184.5h89.5M29.8,187h89.5M29.8,189.5h89.5M29.8,192h89.5M29.8,194.5h89.5M29.8,197h89.5M29.8,199.5h89.5" fill="none" stroke="#fff" strokeWidth=".5" strokeDasharray=".5,1"/>
      
      {/* 10m marker lines for reference */}
      <g stroke="#ffffff55" strokeWidth="0.2">
         {[10,20,30,40,50,60,70,80,90,100].map(m => {
            const mx = 30 + (89.5 * (m/100));
            return <line key={m} x1={mx} y1="179.5" x2={mx} y2="197" />;
         })}
      </g>
      {/* Starting line overlay */}
      <line x1="30.5" y1="179.5" x2="30.5" y2="197" stroke="#ffffff" strokeWidth="2" />
      <text x="30.5" y="202" fill="#fff" fontSize="3.5" fontFamily="monospace" textAnchor="middle" fontWeight="bold">START</text>
      
      <defs>
        <pattern id="finishPattern" x="0" y="0" width="1" height="1" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="0.5" height="0.5" fill="#fff" />
          <rect x="0.5" y="0" width="0.5" height="0.5" fill="#000" />
          <rect x="0" y="0.5" width="0.5" height="0.5" fill="#000" />
          <rect x="0.5" y="0.5" width="0.5" height="0.5" fill="#fff" />
        </pattern>
      </defs>

      {children}
    </svg>
  );
}

