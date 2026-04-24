import { ReactNode } from 'react';
import clsx from 'clsx';

interface CardProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  noPadding?: boolean;
}

export default function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  noPadding,
}: CardProps) {
  return (
    <section className={clsx('card flex flex-col', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
          <div>
            {title && <h3 className="text-sm font-semibold text-fg">{title}</h3>}
            {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(noPadding ? '' : 'p-5', 'flex-1', bodyClassName)}>{children}</div>
    </section>
  );
}
