import React from 'react';

/** Label outline with a chamfered upper-right corner and three barcode bars. */
export function LabelStudioLogo(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M4 3H15L20 8V21H4V3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="miter" />
    <path d="M7 8H9V17H7ZM11 8H12V17H11ZM14 8H17V17H14Z" fill="currentColor" />
  </svg>;
}
