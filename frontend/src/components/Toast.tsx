import { useEffect } from 'react';

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

export default function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="fixed bottom-4 right-4 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg z-50"
      style={{ background: '#1a1a18', color: '#fff', border: '0.5px solid #333' }}
    >
      {message}
    </div>
  );
}
