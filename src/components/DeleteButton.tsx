import { Trash2 } from 'lucide-react';

interface DeleteButtonProps {
  onClick: () => void;
  className?: string;
  size?: number;
}

export function DeleteButton({ onClick, className = '', size = 18 }: DeleteButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex items-center justify-center rounded-lg p-2 text-primary-300 transition hover:bg-error-50 hover:text-error-600 ${className}`}
      title="Удалить"
      aria-label="Удалить"
    >
      <Trash2 className="h-5 w-5" style={{ width: size, height: size }} />
    </button>
  );
}
