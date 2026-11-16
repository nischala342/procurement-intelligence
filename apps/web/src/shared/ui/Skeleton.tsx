/** Placeholder table rows shown while data loads. Must be used inside a <tbody>. */
export function SkeletonRows({ rows = 6, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden="true">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c}>
              <span className="skeleton" style={{ width: `${55 + ((r * 7 + c * 13) % 35)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
