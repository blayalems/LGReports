import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

export function Card({ children, className = '', ...rest }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={`${styles.card} glasscard ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardButton({ children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button type="button" className={`${styles.card} ${styles.interactive} glasscard pressable ${className}`} {...rest}>
      {children}
    </button>
  );
}
