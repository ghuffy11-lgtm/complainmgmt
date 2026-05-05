import type { CSSProperties } from 'react';

/**
 * Loading placeholder. Use in place of "Loading…" text when the layout
 * has known dimensions — keeps the page from jumping when data lands.
 */
export function Skeleton({
  width = '100%', height = 16, style,
}: { width?: number | string; height?: number | string; style?: CSSProperties }) {
  return <span className="skeleton" style={{ width, height, ...style }} />;
}

/**
 * A small block of text-shaped skeletons. Useful for "table loading" cells.
 */
export function SkeletonLines({ rows = 3, gap = 8 }: { rows?: number; gap?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={12} width={i === rows - 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}
