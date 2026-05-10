import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';
import { PASS_STATUS_COLORS, PASS_STATUS_LABELS, type PassStatus } from '../../types';

// ============================================================
// Button
// ============================================================

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const variantClasses: Record<Variant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50',
  secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50',
  ghost: 'text-gray-600 hover:bg-gray-100 disabled:opacity-50',
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
  ({ variant = 'primary', size = 'md', loading, children, className = '', disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
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
  )
);
Button.displayName = 'Button';

// ============================================================
// Input
// ============================================================

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
          <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`rounded-md border px-3 py-2 text-sm shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            error ? 'border-red-400' : 'border-gray-300'
          } ${className}`}
          {...rest}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

// ============================================================
// Select
// ============================================================

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
          <label htmlFor={selectId} className="text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            error ? 'border-red-400' : ''
          } ${className}`}
          {...rest}
        >
          {children}
        </select>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';

// ============================================================
// Textarea
// ============================================================

export const Textarea = forwardRef<HTMLTextAreaElement, { label?: string; error?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ label, error, className = '', id, ...rest }, ref) => {
    const taId = id ?? label?.toLowerCase().replace(/\s/g, '-');
    return (
      <div className="flex flex-col gap-1">
        {label && <label htmlFor={taId} className="text-sm font-medium text-gray-700">{label}</label>}
        <textarea
          ref={ref}
          id={taId}
          className={`rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${error ? 'border-red-400' : ''} ${className}`}
          {...rest}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

// ============================================================
// Modal
// ============================================================

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
      <div className="absolute inset-0 bg-black/40" onClick={onStäng} />
      <div className={`relative w-full ${bredder[bredd]} rounded-xl bg-white shadow-xl`}>
        {titel && (
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">{titel}</h2>
            <button onClick={onStäng} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
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

// ============================================================
// Badge / StatusBadge
// ============================================================

export function StatusBadge({ status }: { status: PassStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PASS_STATUS_COLORS[status]}`}>
      {PASS_STATUS_LABELS[status]}
    </span>
  );
}

export function Badge({ children, color = 'gray' }: { children: ReactNode; color?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-${color}-100 text-${color}-700`}>
      {children}
    </span>
  );
}

// ============================================================
// Card
// ============================================================

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// ============================================================
// Stat card
// ============================================================

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
      className={`flex flex-col gap-1 rounded-xl border bg-white p-5 shadow-sm text-left transition hover:shadow-md ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-3xl font-bold text-${färg}-600`}>{värde}</span>
    </button>
  );
}

// ============================================================
// Empty state
// ============================================================

export function TomtTillstånd({ text, åtgärd }: { text: string; åtgärd?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
      <p className="text-sm text-gray-500">{text}</p>
      {åtgärd}
    </div>
  );
}

// ============================================================
// Loading spinner
// ============================================================

export function Spinner({ storlek = 'md' }: { storlek?: 'sm' | 'md' | 'lg' }) {
  const s = storlek === 'sm' ? 'h-4 w-4' : storlek === 'lg' ? 'h-10 w-10' : 'h-6 w-6';
  return (
    <svg className={`${s} animate-spin text-blue-600`} viewBox="0 0 24 24" fill="none">
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

// ============================================================
// Notification / Alert
// ============================================================

type AlertTyp = 'info' | 'success' | 'warning' | 'error';

const alertStyles: Record<AlertTyp, string> = {
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  success: 'bg-green-50 text-green-800 border-green-200',
  warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  error: 'bg-red-50 text-red-800 border-red-200',
};

export function Alert({ typ = 'info', children }: { typ?: AlertTyp; children: ReactNode }) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${alertStyles[typ]}`}>
      {children}
    </div>
  );
}

// ============================================================
// Confirm dialog
// ============================================================

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
      {text && <p className="mb-6 text-sm text-gray-600">{text}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onAvbryt}>Avbryt</Button>
        <Button variant={farlig ? 'danger' : 'primary'} onClick={onBekräfta}>{bekräftaText}</Button>
      </div>
    </Modal>
  );
}
