import type { PropsWithChildren, ReactNode } from 'react';

export function Card({ title, action, children }: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  return (
    <section className="card">
      <header className="card-header">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}
