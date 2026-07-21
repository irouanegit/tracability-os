import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import loadingAnimationUrl from "./assets/loading.lottie?url";

export function TraceabilityLoader({ label = "Chargement...", compact = false }: { label?: string | null; compact?: boolean }) {
  return (
    <span className={compact ? "trace-loader compact" : "trace-loader"} role="status">
      <span aria-hidden="true" className="trace-loader-mark">
        <DotLottieReact autoplay loop src={loadingAnimationUrl} />
      </span>
      {label ? <span>{label}</span> : null}
    </span>
  );
}
