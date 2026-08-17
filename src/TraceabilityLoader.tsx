export function TraceabilityLoader({ label = "Chargement...", compact = false }: { label?: string | null; compact?: boolean }) {
  return (
    <span className={compact ? "trace-loader compact" : "trace-loader"} role="status">
      <span aria-hidden="true" className="trace-loader-mark">
        <svg className="trace-loader-infinity" viewBox="-10 -10 120 60">
          <path
            className="trace-loader-infinity-track"
            d="M50,20 C50,4 72,4 72,20 C72,36 94,36 94,20 C94,4 72,4 72,20 C72,36 50,36 50,20 C50,4 28,4 28,20 C28,36 6,36 6,20 C6,4 28,4 28,20 C28,36 50,36 50,20"
          />
          <path
            className="trace-loader-infinity-path"
            d="M50,20 C50,4 72,4 72,20 C72,36 94,36 94,20 C94,4 72,4 72,20 C72,36 50,36 50,20 C50,4 28,4 28,20 C28,36 6,36 6,20 C6,4 28,4 28,20 C28,36 50,36 50,20"
          />
        </svg>
      </span>
      {label ? <span>{label}</span> : null}
    </span>
  );
}
