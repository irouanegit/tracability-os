import { useEffect, useState } from "react";
import {
  ActivityIcon,
  CopyCheckIcon,
  CopyIcon,
  DownloadIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";
import {
  checkStorageHealth,
  clearAuthDiagnosticLogs,
  copyReportToClipboard,
  downloadReportFile,
  getAuthDiagnosticsLogs,
  getLastSignOutRecord,
  measureClockSkew,
  subscribeToAuthDiagnostics,
  testManualTokenRefresh,
  type AuthDiagnosticEntry,
  type LastSignOutRecord,
} from "./lib/authDiagnostics";
import { supabase } from "./lib/supabase";

export function AuthDiagnosticsPanel({
  currentUser,
  onClose,
  isModal = false,
}: {
  currentUser?: { id?: string; email?: string | null } | null;
  onClose?: () => void;
  isModal?: boolean;
}) {
  const [, setTick] = useState(0);
  const [copied, setCopied] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<"all" | "error" | "warn">("all");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Diagnostic live test state
  const [isTestingPing, setIsTestingPing] = useState(false);
  const [pingResult, setPingResult] = useState<{
    skewSeconds: number | null;
    latencyMs: number;
    isSkewCritical: boolean;
    error: string | null;
  } | null>(null);

  const [isTestingRefresh, setIsTestingRefresh] = useState(false);
  const [refreshResult, setRefreshResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Subscribe to live log updates
  useEffect(() => {
    return subscribeToAuthDiagnostics(() => {
      setTick((prev) => prev + 1);
    });
  }, []);

  const logs = getAuthDiagnosticsLogs();
  const lastSignOut: LastSignOutRecord | null = getLastSignOutRecord();
  const storageHealth = checkStorageHealth();

  const filteredLogs = logs.filter((log) => {
    if (filterSeverity === "error") return log.severity === "error";
    if (filterSeverity === "warn") return log.severity === "warn" || log.severity === "error";
    return true;
  });

  async function handleCopy() {
    const ok = await copyReportToClipboard(currentUser);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  function handleDownload() {
    downloadReportFile(currentUser);
  }

  async function handleRunPingTest() {
    setIsTestingPing(true);
    setPingResult(null);
    try {
      const res = await measureClockSkew();
      setPingResult({
        skewSeconds: res.skewSeconds,
        latencyMs: res.latencyMs,
        isSkewCritical: res.isSkewCritical,
        error: res.error,
      });
    } finally {
      setIsTestingPing(false);
    }
  }

  async function handleRunRefreshTest() {
    setIsTestingRefresh(true);
    setRefreshResult(null);
    try {
      const res = await testManualTokenRefresh(supabase);
      setRefreshResult(res);
    } finally {
      setIsTestingRefresh(false);
    }
  }

  return (
    <div className={`auth-diag-container ${isModal ? "is-modal" : "is-embedded"}`}>
      {/* Header toolbar */}
      <div className="auth-diag-toolbar">
        <div className="auth-diag-toolbar-title">
          <ShieldAlertIcon className="auth-diag-title-icon" size={20} />
          <strong>Diagnostics d'authentification & déconnexion</strong>
        </div>

        <div className="auth-diag-toolbar-actions">
          <button
            className={`auth-diag-btn ${copied ? "copied" : "primary"}`}
            onClick={() => void handleCopy()}
            title="Copier le rapport complet au presse-papier pour le partager"
            type="button"
          >
            {copied ? <CopyCheckIcon size={16} /> : <CopyIcon size={16} />}
            <span>{copied ? "Rapport copié !" : "Copier le rapport"}</span>
          </button>

          <button
            className="auth-diag-btn secondary"
            onClick={handleDownload}
            title="Télécharger le rapport texte (.txt)"
            type="button"
          >
            <DownloadIcon size={16} />
            <span>Télécharger (.txt)</span>
          </button>

          {onClose && !isModal ? (
            <button className="auth-diag-btn tertiary" onClick={onClose} type="button">
              Fermer
            </button>
          ) : null}
        </div>
      </div>

      {/* Section 1: Last Signout Analysis */}
      <div className="auth-diag-section">
        <div className="auth-diag-section-header">
          <ActivityIcon size={16} />
          <span>1. Analyse de la dernière déconnexion</span>
        </div>

        {lastSignOut ? (
          <div className={`auth-diag-signout-card ${lastSignOut.isManual ? "is-manual" : "is-unexpected"}`}>
            <div className="auth-diag-signout-badge-row">
              <span className={`auth-diag-badge ${lastSignOut.isManual ? "neutral" : "critical"}`}>
                {lastSignOut.isManual ? "Déconnexion volontaire" : "⚠️ DÉCONNEXION INATTENDUE"}
              </span>
              <span className="auth-diag-time-label">
                Horodatage : {lastSignOut.localTimeFormatted} ({lastSignOut.timestamp.slice(0, 10)})
              </span>
            </div>

            <div className="auth-diag-info-grid">
              <div>
                <span className="auth-diag-label">Résumé :</span>
                <p className="auth-diag-val">{lastSignOut.summary}</p>
              </div>

              <div>
                <span className="auth-diag-label">Cause suspectée :</span>
                <p className="auth-diag-val highlight">{lastSignOut.suspectedCause}</p>
              </div>

              <div>
                <span className="auth-diag-label">Recommandation :</span>
                <p className="auth-diag-val">{lastSignOut.recommendation}</p>
              </div>

              {lastSignOut.lastRefreshHttpError ? (
                <div>
                  <span className="auth-diag-label">Dernière erreur HTTP Supabase :</span>
                  <pre className="auth-diag-code-block">
                    HTTP {lastSignOut.lastRefreshHttpError.status} sur {lastSignOut.lastRefreshHttpError.endpoint}
                    {"\n"}
                    {lastSignOut.lastRefreshHttpError.body}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="auth-diag-empty-text">Aucune déconnexion enregistrée depuis le lancement.</p>
        )}
      </div>

      {/* Section 2: System Health & Live Tests */}
      <div className="auth-diag-section">
        <div className="auth-diag-section-header">
          <ActivityIcon size={16} />
          <span>2. État du système & Tests en direct</span>
        </div>

        <div className="auth-diag-status-grid">
          {/* Storage health */}
          <div className="auth-diag-status-card">
            <span className="auth-diag-status-label">Stockage Local (WebView2)</span>
            <div className="auth-diag-status-body">
              <span className={`auth-diag-pill ${storageHealth.isAvailable ? "ok" : "err"}`}>
                {storageHealth.isAvailable ? "Accessible (OK)" : "Inaccessible"}
              </span>
              <span className="auth-diag-sublabel">
                Jeton Supabase : {storageHealth.supabaseTokenFound ? `Présent (${storageHealth.supabaseTokenBytes} o)` : "Absent"}
              </span>
            </div>
          </div>

          {/* Network state */}
          <div className="auth-diag-status-card">
            <span className="auth-diag-status-label">Réseau du poste</span>
            <div className="auth-diag-status-body">
              <span className={`auth-diag-pill ${storageHealth.isOnline ? "ok" : "err"}`}>
                {storageHealth.isOnline ? "En ligne (Connecté)" : "Hors ligne (Déconnecté)"}
              </span>
              <span className="auth-diag-sublabel">
                Navigateur : {typeof navigator !== "undefined" ? navigator.onLine ? "Online" : "Offline" : "N/A"}
              </span>
            </div>
          </div>

          {/* Clock & Ping */}
          <div className="auth-diag-status-card">
            <span className="auth-diag-status-label">Horloge & Latence Supabase</span>
            <div className="auth-diag-status-body">
              <button
                className="auth-diag-test-btn"
                disabled={isTestingPing}
                onClick={() => void handleRunPingTest()}
                type="button"
              >
                <RefreshCwIcon className={isTestingPing ? "spin" : ""} size={14} />
                <span>{isTestingPing ? "Mesure..." : "Tester Horloge & Ping"}</span>
              </button>
              {pingResult ? (
                <span className={`auth-diag-sublabel ${pingResult.isSkewCritical ? "alert-text" : ""}`}>
                  {pingResult.error
                    ? `Erreur: ${pingResult.error}`
                    : `Décalage: ${pingResult.skewSeconds ?? 0}s | Latence: ${pingResult.latencyMs}ms`}
                </span>
              ) : null}
            </div>
          </div>

          {/* Token Refresh Test */}
          <div className="auth-diag-status-card">
            <span className="auth-diag-status-label">Test de renouvellement jeton</span>
            <div className="auth-diag-status-body">
              <button
                className="auth-diag-test-btn"
                disabled={isTestingRefresh}
                onClick={() => void handleRunRefreshTest()}
                type="button"
              >
                <RefreshCwIcon className={isTestingRefresh ? "spin" : ""} size={14} />
                <span>{isTestingRefresh ? "Test en cours..." : "Tester Refresh Session"}</span>
              </button>
              {refreshResult ? (
                <span className={`auth-diag-sublabel ${refreshResult.success ? "ok-text" : "alert-text"}`}>
                  {refreshResult.message}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Event Log Timeline */}
      <div className="auth-diag-section">
        <div className="auth-diag-section-header">
          <div className="auth-diag-log-header-row">
            <span>3. Journal des événements récents ({logs.length})</span>
            <div className="auth-diag-filter-group">
              <button
                className={`auth-diag-filter-btn ${filterSeverity === "all" ? "active" : ""}`}
                onClick={() => setFilterSeverity("all")}
                type="button"
              >
                Tous ({logs.length})
              </button>
              <button
                className={`auth-diag-filter-btn ${filterSeverity === "warn" ? "active" : ""}`}
                onClick={() => setFilterSeverity("warn")}
                type="button"
              >
                Avertissements ({logs.filter((l) => l.severity === "warn" || l.severity === "error").length})
              </button>
              <button
                className={`auth-diag-filter-btn ${filterSeverity === "error" ? "active" : ""}`}
                onClick={() => setFilterSeverity("error")}
                type="button"
              >
                Erreurs ({logs.filter((l) => l.severity === "error").length})
              </button>
              <button
                className="auth-diag-filter-btn clear"
                onClick={() => clearAuthDiagnosticLogs()}
                title="Effacer l'historique des logs"
                type="button"
              >
                <Trash2Icon size={12} />
                <span>Effacer</span>
              </button>
            </div>
          </div>
        </div>

        <div className="auth-diag-log-list">
          {filteredLogs.length === 0 ? (
            <p className="auth-diag-empty-text">Aucun événement ne correspond au filtre sélectionné.</p>
          ) : (
            filteredLogs.map((log: AuthDiagnosticEntry) => {
              const isExpanded = expandedLogId === log.id;
              return (
                <div
                  className={`auth-diag-log-item severity-${log.severity} ${isExpanded ? "expanded" : ""}`}
                  key={log.id}
                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                >
                  <div className="auth-diag-log-main">
                    <span className={`auth-diag-sev-badge ${log.severity}`}>
                      {log.severity === "error" ? "ERREUR" : log.severity === "warn" ? "AVERT." : "INFO"}
                    </span>
                    <span className="auth-diag-log-time">{log.localTimeFormatted}</span>
                    <span className="auth-diag-log-event">[{log.event}]</span>
                    <span className="auth-diag-log-msg">{log.message}</span>
                  </div>

                  {log.details ? (
                    <div className="auth-diag-log-expand-toggle">
                      {isExpanded ? "▲ Masquer détails" : "▼ Voir détails"}
                    </div>
                  ) : null}

                  {isExpanded && log.details ? (
                    <pre className="auth-diag-log-details" onClick={(e) => e.stopPropagation()}>
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
