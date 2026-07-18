import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
  extra?: ReactNode;
}

export function PageHeader({ title, description, extra }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {extra && <div className="page-header-extra">{extra}</div>}
    </header>
  );
}
