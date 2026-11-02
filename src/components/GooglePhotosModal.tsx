import React from 'react';

export const GooglePhotosIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 18,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 2C9.24 2 7 4.24 7 7v5h5V2z" fill="#FBBC04" />
    <path d="M22 12c0-2.76-2.24-5-5-5h-5v5h10z" fill="#EA4335" />
    <path d="M12 22c2.76 0 5-2.24 5-5v-5h-5v10z" fill="#4285F4" />
    <path d="M2 12c0 2.76 2.24 5 5 5h5v-5H2z" fill="#34A853" />
  </svg>
);

const GooglePhotosModal: React.FC<{
  open?: boolean;
  onClose?: () => void;
  initialTab?: 'link' | 'collections';
}> = () => null;

export default GooglePhotosModal;
