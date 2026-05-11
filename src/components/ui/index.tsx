import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';
import { PASS_STATUS_COLORS, PASS_STATUS_LABELS, type PassStatus } from '../../types';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const variantStyles: Record<Variant, React.CSSProperties & { className: string }> = {
  primary: { className: 'font-medium transition-colors disabled:opacity-50' },
  secondary: { className: 'font-medium transition-colors border disabled:opacity-50' },
  danger: { className: 'font-medium transition-colors disabled:opacity-50' },
  ghost: { className: 'transition-colors disabled:opacity-50' },
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, children, className = '', disabled, style, ...rest }, ref) => {
    const variantStyle: React.CSSProperties =
      variant === 'primary' ? { background: 'var(--blue)', color: '#fff' } :
      variant === 'secondary' ? { background: 'var(--bg-card)', color: 'var(--text)', borderColor: 'var(--border)' } :
      variant === 'danger' ? { background: '#dc2626', color: '#fff' } :
      { background: 'transparent', color: 'var(--text-muted)' };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center gap-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${variantStyles[variant].className} ${sizeClasses[size]} ${className}`}
        style={{ ...variantStyle, ...style }}
        {...rest}
      >
        {loading && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, ...rest }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s/g, '-');
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`rounded-md border px-3 py-2 text-sm shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${className}`}
          style={{
            background: 'var(--input-bg)',
            color: 'var(--text)',
            borderColor: error ? '#f87171' : 'var(--border)',
          }}
          {...rest}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        {hint && !error && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, children, className = '', id, ...rest }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s/g, '-');
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${className}`}
          style={{
            background: 'var(--input-bg)',
            color: 'var(--text)',
            borderColor: error ? '#f87171' : 'var(--border)',
          }}
          {...rest}
        >
          {children}
        </select>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';

export const Textarea = forwardRef<HTMLTextAreaElement, { label?: string; error?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ label, error, className = '', id, ...rest }, ref) => {
    const taId = id ?? label?.toLowerCase().replace(/\s/g, '-');
    return (
      <div className="flex flex-col gap-1">
        {label && <label htmlFor={taId} className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</label>}
        <textarea
          ref={ref}
          id={taId}
          className={`rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${className}`}
          style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: error ? '#f87171' : 'var(--border)' }}
          {...rest}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

interface ModalProps {
  öppen: boolean;
  onStäng: () => void;
  titel?: string;
  children: ReactNode;
  bredd?: 'sm' | 'md' | 'lg' | 'xl';
}

const bredder = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' };

export function Modal({ öppen, onStäng, titel, children, bredd = 'md' }: ModalProps) {
  if (!öppen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onStäng} />
      <div className={`relative w-full ${bredder[bredd]} rounded-xl shadow-xl`} style={{ background: 'var(--bg-card)' }}>
        {titel && (
          <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{titel}</h2>
            <button onClick={onStäng} className="rounded p-1" style={{ color: 'var(--text-muted)' }}>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        )}
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: PassStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PASS_STATUS_COLORS[status]}`}>
      {PASS_STATUS_LABELS[status]}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border shadow-sm ${className}`} style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      {children}
    </div>
  );
}

interface StatCardProps {
  label: string;
  värde: number | string;
  färg?: string;
  onClick?: () => void;
}

export function StatCard({ label, värde, färg = 'blue', onClick }: StatCardProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-1 rounded-xl border p-5 shadow-sm text-left transition hover:shadow-md ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className={`text-3xl font-bold text-${färg}-600 dark:text-${färg}-400`}>{värde}</span>
    </button>
  );
}

export function TomtTillstånd({ text, åtgärd }: { text: string; åtgärd?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-16 text-center" style={{ borderColor: 'var(--border)' }}>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{text}</p>
      {åtgärd}
    </div>
  );
}

export function Spinner({ storlek = 'md' }: { storlek?: 'sm' | 'md' | 'lg' }) {
  const s = storlek === 'sm' ? 'h-4 w-4' : storlek === 'lg' ? 'h-10 w-10' : 'h-6 w-6';
  return (
    <svg className={`${s} animate-spin`} style={{ color: 'var(--blue)' }} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

export function LaddaSida() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner storlek="lg" />
    </div>
  );
}

type AlertTyp = 'info' | 'success' | 'warning' | 'error';

const alertStyles: Record<AlertTyp, string> = {
  info: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
  success: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800',
  warning: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800',
  error: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
};

export function Alert({ typ = 'info', children, className = '' }: { typ?: AlertTyp; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${alertStyles[typ]} ${className}`}>
      {children}
    </div>
  );
}

interface ConfirmProps {
  öppen: boolean;
  onBekräfta: () => void;
  onAvbryt: () => void;
  titel?: string;
  text?: string;
  bekräftaText?: string;
  farlig?: boolean;
}

export function Confirm({ öppen, onBekräfta, onAvbryt, titel = 'Bekräfta', text, bekräftaText = 'Bekräfta', farlig = false }: ConfirmProps) {
  return (
    <Modal öppen={öppen} onStäng={onAvbryt} titel={titel} bredd="sm">
      {text && <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>{text}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onAvbryt}>Avbryt</Button>
        <Button variant={farlig ? 'danger' : 'primary'} onClick={onBekräfta}>{bekräftaText}</Button>
      </div>
    </Modal>
  );
}