/**
 * Auth Diagnostic & Session Health Tracking Engine
 * Captures real-time authentication events, token refresh cycles, network changes,
 * OS sleep/resume cycles, localStorage integrity, and server clock drift.
 */

export type AuthDiagnosticCategory =
  | "auth_state"
  | "token_refresh"
  | "network"
  | "system"
  | "storage"
  | "manual"
  | "api_error";

export type AuthDiagnosticSeverity = "info" | "warn" | "error";

export interface AuthDiagnosticEntry {
  id: string;
  timestamp: string; // ISO 8601
  localTimeFormatted: string; // HH:mm:ss
  category: AuthDiagnosticCategory;
  event: string;
  severity: AuthDiagnosticSeverity;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface LastSignOutRecord {
  timestamp: string;
  localTimeFormatted: string;
  isManual: boolean;
  reasonCode: string;
  summary: string;
  suspectedCause: string;
  recommendation: string;
  lastTokenExpiresAt: string | null;
  secondsSinceTokenExpiry: number | null;
  lastRefreshHttpError: {
    status: number;
    body: string;
    endpoint: string;
    timestamp: string;
  } | null;
  clockSkewSeconds: number | null;
  storageState: {
    keyFound: boolean;
    keyBytes: number;
    totalKeys: number;
  } | null;
  isOnline: boolean;
}

const STORAGE_KEY_LOGS = "tracability_auth_diagnostic_logs_v1";
const STORAGE_KEY_LAST_SIGNOUT = "tracability_auth_last_signout_record";
const MAX_LOG_ENTRIES = 80;

// In-memory state
let inMemoryLogs: AuthDiagnosticEntry[] = [];
let lastSignOutRecordInMemory: LastSignOutRecord | null = null;
let isManualSignOutFlag = false;
let manualSignOutTimeoutId: any = null;
let lastKnownSessionSnapshot: {
  userId: string | null;
  email: string | null;
  expiresAt: number | null;
  expiresAtIso: string | null;
  updatedAt: string;
} | null = null;
let lastRefreshHttpError: {
  status: number;
  body: string;
  endpoint: string;
  timestamp: string;
} | null = null;
let lastKnownClockSkewSeconds: number | null = null;
let listeners: Set<() => void> = new Set();
let isWatchersInitialized = false;

function getIsOnline(): boolean {
  if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
    return navigator.onLine;
  }
  return true;
}

// Safe localStorage wrappers
function safeGetLocalStorage(key: string): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLocalStorage(key: string, value: string): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemoveLocalStorage(key: string): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

// Load logs on module init
function loadLogsFromStorage(): AuthDiagnosticEntry[] {
  const raw = safeGetLocalStorage(STORAGE_KEY_LOGS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.slice(-MAX_LOG_ENTRIES);
  } catch {
    // Ignore JSON parsing errors
  }
  return [];
}

inMemoryLogs = loadLogsFromStorage();

function persistLogs() {
  safeSetLocalStorage(STORAGE_KEY_LOGS, JSON.stringify(inMemoryLogs));
}

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.error("[AuthDiagnostics] Listener error", err);
    }
  }
}

export function subscribeToAuthDiagnostics(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function logAuthDiagnostic(params: {
  category: AuthDiagnosticCategory;
  event: string;
  severity: AuthDiagnosticSeverity;
  message: string;
  details?: Record<string, unknown> | null;
}): AuthDiagnosticEntry {
  const now = new Date();
  const timeFormatted = now.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const entry: AuthDiagnosticEntry = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now.toISOString(),
    localTimeFormatted: timeFormatted,
    category: params.category,
    event: params.event,
    severity: params.severity,
    message: params.message,
    details: params.details ?? null,
  };

  // Console output
  const prefix = `[AuthDiagnostics ${timeFormatted}] [${params.event}]`;
  if (params.severity === "error") {
    console.error(prefix, params.message, params.details ?? "");
  } else if (params.severity === "warn") {
    console.warn(prefix, params.message, params.details ?? "");
  } else {
    console.log(prefix, params.message, params.details ?? "");
  }

  inMemoryLogs.push(entry);
  if (inMemoryLogs.length > MAX_LOG_ENTRIES) {
    inMemoryLogs = inMemoryLogs.slice(-MAX_LOG_ENTRIES);
  }

  persistLogs();
  notifyListeners();
  return entry;
}

export function getAuthDiagnosticsLogs(): AuthDiagnosticEntry[] {
  return [...inMemoryLogs];
}

export function getLastSignOutRecord(): LastSignOutRecord | null {
  if (lastSignOutRecordInMemory) return lastSignOutRecordInMemory;
  const raw = safeGetLocalStorage(STORAGE_KEY_LAST_SIGNOUT);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LastSignOutRecord;
    lastSignOutRecordInMemory = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAuthDiagnosticLogs() {
  inMemoryLogs = [];
  lastSignOutRecordInMemory = null;
  safeRemoveLocalStorage(STORAGE_KEY_LOGS);
  safeRemoveLocalStorage(STORAGE_KEY_LAST_SIGNOUT);
  notifyListeners();
  logAuthDiagnostic({
    category: "manual",
    event: "LOGS_CLEARED",
    severity: "info",
    message: "Les logs de diagnostic ont été réinitialisés par l'utilisateur.",
  });
}


/**
 * Call this right when the user deliberately clicks "Se déconnecter"
 */
export function markManualSignOut() {
  isManualSignOutFlag = true;
  if (manualSignOutTimeoutId) clearTimeout(manualSignOutTimeoutId);
  // Keep flag active for 5 seconds to cover the async signOut flow
  manualSignOutTimeoutId = setTimeout(() => {
    isManualSignOutFlag = false;
  }, 5000);

  logAuthDiagnostic({
    category: "manual",
    event: "MANUAL_SIGNOUT_INITIATED",
    severity: "info",
    message: "Déconnexion volontaire initiée par l'utilisateur (clic 'Se déconnecter').",
    details: {
      userId: lastKnownSessionSnapshot?.userId,
      userEmail: lastKnownSessionSnapshot?.email,
    },
  });

  recordSignOutRecord(true, "manual_signout", "Déconnexion manuelle initiée par l'utilisateur.");
}

function recordSignOutRecord(isManual: boolean, reasonCode: string, summary: string) {
  const now = new Date();
  const timeFormatted = now.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const expiresAt = lastKnownSessionSnapshot?.expiresAt;
  const nowSec = Math.floor(now.getTime() / 1000);
  const secondsSinceTokenExpiry = expiresAt ? nowSec - expiresAt : null;

  const storageHealth = checkStorageHealth();

  let suspectedCause = "Déconnexion normale demandée par l'utilisateur.";
  let recommendation = "Aucune action requise.";

  if (!isManual) {
    if (lastRefreshHttpError?.body?.includes("invalid_grant") || lastRefreshHttpError?.body?.includes("Refresh Token")) {
      suspectedCause =
        "Le jeton de rafraîchissement (Refresh Token) a été rejeté par Supabase ('invalid_grant'). " +
        "Causes possibles : (1) Ce compte s'est connecté sur un autre ordinateur/navigateur et Supabase a invalidé l'ancienne session (Refresh Token Reuse Detection). " +
        "(2) La session a dépassé la durée maximale d'inactivité autorisée.";
      recommendation =
        "Vérifier si un autre utilisateur ou poste partage le même identifiant. Si oui, créer un compte dédié par poste ou désactiver la rotation stricte de refresh token dans Supabase Auth Settings.";
    } else if (lastRefreshHttpError?.status === 0 || !storageHealth.isOnline) {
      suspectedCause =
        "Déconnexion due à une coupure réseau ou échec de communication lors du renouvellement du jeton. " +
        "Le poste n'a pas pu joindre Supabase au moment requis.";
      recommendation =
        "Vérifier la connexion réseau ou WiFi de ce poste. Si le problème survient au retour de veille, le poste met du temps à rétablir le réseau après veille.";
    } else if (secondsSinceTokenExpiry && secondsSinceTokenExpiry > 60) {
      suspectedCause = `Le jeton d'accès a expiré il y a ${secondsSinceTokenExpiry} secondes et n'a pas pu être renouvelé automatiquement (possible mise en veille prolongée du poste ou horloge système en décalage).`;
      recommendation =
        "Vérifier la mise en veille Windows de ce poste et vérifier que l'horloge Windows est synchronisée sur le temps Internet (NTP).";
    } else if (!storageHealth.supabaseTokenFound) {
      suspectedCause =
        "La clé de session Supabase est absente du stockage local (localStorage). " +
        "Causes possibles : Un logiciel de nettoyage (CCleaner, antivirus) ou une stratégie d'entreprise vide le profil WebView2.";
      recommendation =
        "Vérifier si un antivirus ou nettoyeur efface les données d'application ou le dossier local WebView2 de ce poste.";
    } else if (lastKnownClockSkewSeconds && Math.abs(lastKnownClockSkewSeconds) > 60) {
      suspectedCause = `Horloge système du PC décalée de ${lastKnownClockSkewSeconds} secondes par rapport au serveur Supabase.`;
      recommendation =
        "Synchroniser l'heure de Windows dans 'Paramètres > Heure et langue > Synchroniser votre horloge'.";
    } else {
      suspectedCause =
        "Événement de déconnexion SIGNED_OUT reçu de Supabase sans demande manuelle de l'utilisateur.";
      recommendation =
        "Partager ce rapport de diagnostic pour identifier précisément l'origine de l'événement.";
    }
  }

  const record: LastSignOutRecord = {
    timestamp: now.toISOString(),
    localTimeFormatted: timeFormatted,
    isManual,
    reasonCode,
    summary,
    suspectedCause,
    recommendation,
    lastTokenExpiresAt: lastKnownSessionSnapshot?.expiresAtIso ?? null,
    secondsSinceTokenExpiry,
    lastRefreshHttpError: lastRefreshHttpError ? { ...lastRefreshHttpError } : null,
    clockSkewSeconds: lastKnownClockSkewSeconds,
    storageState: {
      keyFound: storageHealth.supabaseTokenFound,
      keyBytes: storageHealth.supabaseTokenBytes,
      totalKeys: storageHealth.totalKeys,
    },
    isOnline: storageHealth.isOnline,
  };

  lastSignOutRecordInMemory = record;
  safeSetLocalStorage(STORAGE_KEY_LAST_SIGNOUT, JSON.stringify(record));
}


/**
 * Handle Supabase onAuthStateChange events
 */
export function handleAuthDiagnosticsStateChange(event: string, session: any) {
  const user = session?.user;
  const expiresAt = session?.expires_at ? Number(session.expires_at) : null;
  const expiresAtIso = expiresAt ? new Date(expiresAt * 1000).toISOString() : null;

  if (session && user) {
    lastKnownSessionSnapshot = {
      userId: user.id,
      email: user.email ?? null,
      expiresAt,
      expiresAtIso,
      updatedAt: new Date().toISOString(),
    };
  }

  if (event === "SIGNED_IN") {
    logAuthDiagnostic({
      category: "auth_state",
      event: "SIGNED_IN",
      severity: "info",
      message: `Utilisateur connecté : ${user?.email || user?.id || "inconnu"}`,
      details: {
        userId: user?.id,
        email: user?.email,
        expiresAt: expiresAtIso,
        expiresInSeconds: expiresAt ? expiresAt - Math.floor(Date.now() / 1000) : null,
      },
    });
  } else if (event === "TOKEN_REFRESHED") {
    const remainingSec = expiresAt ? expiresAt - Math.floor(Date.now() / 1000) : 0;
    logAuthDiagnostic({
      category: "token_refresh",
      event: "TOKEN_REFRESHED",
      severity: "info",
      message: `Jeton renouvelé avec succès (expire dans ${Math.round(remainingSec / 60)} min).`,
      details: {
        userId: user?.id,
        newExpiresAt: expiresAtIso,
        expiresInSeconds: remainingSec,
      },
    });
    // Clear any previous refresh error on success
    lastRefreshHttpError = null;
  } else if (event === "USER_UPDATED") {
    logAuthDiagnostic({
      category: "auth_state",
      event: "USER_UPDATED",
      severity: "info",
      message: "Profil utilisateur mis à jour par Supabase.",
    });
  } else if (event === "SIGNED_OUT" || !session) {
    const isManual = isManualSignOutFlag;
    isManualSignOutFlag = false;

    if (isManual) {
      logAuthDiagnostic({
        category: "auth_state",
        event: "SIGNED_OUT_MANUAL",
        severity: "info",
        message: "Déconnexion manuelle confirmée par Supabase.",
      });
    } else {
      logAuthDiagnostic({
        category: "auth_state",
        event: "UNEXPECTED_AUTOMATIC_SIGNOUT",
        severity: "error",
        message: "Déconnexion automatique inattendue détectée !",
        details: {
          previousUser: lastKnownSessionSnapshot?.email || lastKnownSessionSnapshot?.userId,
          lastTokenExpiresAt: lastKnownSessionSnapshot?.expiresAtIso,
          lastRefreshError: lastRefreshHttpError,
          clockSkewSeconds: lastKnownClockSkewSeconds,
          isOnline: getIsOnline(),
        },
      });

      recordSignOutRecord(
        false,
        "unexpected_automatic_signout",
        "Déconnexion automatique sans action de l'utilisateur."
      );
    }
  } else {
    logAuthDiagnostic({
      category: "auth_state",
      event,
      severity: "info",
      message: `Événement Supabase Auth : ${event}`,
    });
  }
}

/**
 * Intercept fetch requests made by Supabase client to record auth API responses and detect refresh failures
 */
export async function authDiagnosticFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const isAuthEndpoint = url.includes("/auth/v1/");
  const isRefreshTokenEndpoint = isAuthEndpoint && url.includes("grant_type=refresh_token");
  const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();

  try {
    const response = await fetch(input, init);
    const durationMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime
    );

    // Extract server date header for clock skew detection
    const serverDateHeader = response.headers.get("date");
    if (serverDateHeader) {
      try {
        const serverTimeMs = Date.parse(serverDateHeader);
        if (Number.isFinite(serverTimeMs)) {
          lastKnownClockSkewSeconds = Math.round((serverTimeMs - Date.now()) / 1000);
        }
      } catch {
        // Ignore date parse issues
      }
    }

    // If it's an auth endpoint with error status
    if (isAuthEndpoint && !response.ok) {
      let errorBody = "";
      try {
        const clone = response.clone();
        errorBody = await clone.text();
      } catch {
        errorBody = "<impossible de lire le corps de réponse>";
      }

      const parsedError = tryParseJson(errorBody);
      const isCriticalRefreshFailure = isRefreshTokenEndpoint;

      lastRefreshHttpError = {
        status: response.status,
        body: errorBody,
        endpoint: url,
        timestamp: new Date().toISOString(),
      };

      logAuthDiagnostic({
        category: isRefreshTokenEndpoint ? "token_refresh" : "auth_state",
        event: isRefreshTokenEndpoint ? "TOKEN_REFRESH_HTTP_ERROR" : "AUTH_HTTP_ERROR",
        severity: isCriticalRefreshFailure ? "error" : "warn",
        message: isRefreshTokenEndpoint
          ? `Échec renouvellement jeton : HTTP ${response.status} (${response.statusText || "Error"}) en ${durationMs}ms`
          : `Erreur API Auth : HTTP ${response.status} sur ${url.split("?")[0]}`,
        details: {
          status: response.status,
          statusText: response.statusText,
          durationMs,
          endpoint: url,
          errorResponse: parsedError || errorBody,
        },
      });
    } else if (isRefreshTokenEndpoint && response.ok) {
      logAuthDiagnostic({
        category: "token_refresh",
        event: "TOKEN_REFRESH_HTTP_SUCCESS",
        severity: "info",
        message: `Appel renouvellement jeton réussi (HTTP 200 en ${durationMs}ms).`,
        details: { durationMs },
      });
      lastRefreshHttpError = null;
    }

    return response;
  } catch (fetchError: any) {
    const durationMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime
    );
    const errorMessage = fetchError?.message || String(fetchError);
    const isOnline = getIsOnline();

    if (isAuthEndpoint) {
      lastRefreshHttpError = {
        status: 0,
        body: `Network Error: ${errorMessage}`,
        endpoint: url,
        timestamp: new Date().toISOString(),
      };

      logAuthDiagnostic({
        category: "network",
        event: "AUTH_FETCH_NETWORK_FAILURE",
        severity: "error",
        message: `Erreur réseau lors de l'appel Auth (${errorMessage}) en ${durationMs}ms. En ligne: ${isOnline}`,
        details: {
          endpoint: url,
          errorMessage,
          isOnline,
          durationMs,
        },
      });
    }

    throw fetchError;
  }
}

function tryParseJson(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Storage Health Check
 */
export function checkStorageHealth(): {
  isAvailable: boolean;
  isOnline: boolean;
  supabaseTokenFound: boolean;
  supabaseTokenBytes: number;
  supabaseTokenKey: string | null;
  totalKeys: number;
  error: string | null;
} {
  const isOnline = getIsOnline();
  if (typeof window === "undefined" || !window.localStorage) {

    return {
      isAvailable: false,
      isOnline,
      supabaseTokenFound: false,
      supabaseTokenBytes: 0,
      supabaseTokenKey: null,
      totalKeys: 0,
      error: "window.localStorage non disponible dans cet environnement.",
    };
  }

  try {
    // Test write/read
    const testKey = "__auth_diag_storage_test__";
    window.localStorage.setItem(testKey, "ok");
    const testVal = window.localStorage.getItem(testKey);
    window.localStorage.removeItem(testKey);

    if (testVal !== "ok") {
      return {
        isAvailable: false,
        isOnline,
        supabaseTokenFound: false,
        supabaseTokenBytes: 0,
        supabaseTokenKey: null,
        totalKeys: window.localStorage.length,
        error: "Échec de lecture/écriture du test localStorage.",
      };
    }

    // Find Supabase token key
    let supabaseKey: string | null = null;
    let tokenBytes = 0;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && (key.includes("auth-token") || key.startsWith("sb-"))) {
        supabaseKey = key;
        const val = window.localStorage.getItem(key) || "";
        tokenBytes = val.length;
        break;
      }
    }

    return {
      isAvailable: true,
      isOnline,
      supabaseTokenFound: Boolean(supabaseKey),
      supabaseTokenBytes: tokenBytes,
      supabaseTokenKey: supabaseKey,
      totalKeys: window.localStorage.length,
      error: null,
    };
  } catch (err: any) {
    return {
      isAvailable: false,
      isOnline,
      supabaseTokenFound: false,
      supabaseTokenBytes: 0,
      supabaseTokenKey: null,
      totalKeys: 0,
      error: err?.message || String(err),
    };
  }
}

/**
 * Measure clock drift against Supabase server
 */
export async function measureClockSkew(supabaseUrl?: string): Promise<{
  serverTime: string | null;
  localTime: string;
  skewSeconds: number | null;
  isSkewCritical: boolean;
  latencyMs: number;
  error: string | null;
}> {
  const localNow = new Date();
  const localTime = localNow.toISOString();
  const targetUrl = supabaseUrl || (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_SUPABASE_URL);

  if (!targetUrl) {
    return {
      serverTime: null,
      localTime,
      skewSeconds: null,
      isSkewCritical: false,
      latencyMs: 0,
      error: "URL Supabase non configurée.",
    };
  }

  const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    // Ping Supabase health or root endpoint
    const pingUrl = `${targetUrl.replace(/\/$/, "")}/auth/v1/health`;
    const response = await fetch(pingUrl, { method: "GET" });
    const latencyMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime
    );

    const dateHeader = response.headers.get("date");
    if (!dateHeader) {
      return {
        serverTime: null,
        localTime,
        skewSeconds: null,
        isSkewCritical: false,
        latencyMs,
        error: "En-tête HTTP 'Date' absent de la réponse Supabase.",
      };
    }

    const serverMs = Date.parse(dateHeader);
    const skewSeconds = Math.round((serverMs - Date.now()) / 1000);
    const isSkewCritical = Math.abs(skewSeconds) > 60;

    lastKnownClockSkewSeconds = skewSeconds;

    logAuthDiagnostic({
      category: "system",
      event: "CLOCK_SKEW_MEASURED",
      severity: isSkewCritical ? "error" : Math.abs(skewSeconds) > 15 ? "warn" : "info",
      message: `Décalage d'horloge mesuré : ${skewSeconds >= 0 ? "+" : ""}${skewSeconds}s (Latence : ${latencyMs}ms).`,
      details: {
        serverTime: new Date(serverMs).toISOString(),
        localTime,
        skewSeconds,
        latencyMs,
        isSkewCritical,
      },
    });

    return {
      serverTime: new Date(serverMs).toISOString(),
      localTime,
      skewSeconds,
      isSkewCritical,
      latencyMs,
      error: null,
    };
  } catch (err: any) {
    const latencyMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime
    );
    return {
      serverTime: null,
      localTime,
      skewSeconds: null,
      isSkewCritical: false,
      latencyMs,
      error: err?.message || String(err),
    };
  }
}

/**
 * Trigger manual token refresh test
 */
export async function testManualTokenRefresh(supabaseClient: any): Promise<{
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}> {
  if (!supabaseClient) {
    return { success: false, message: "Client Supabase non initialisé." };
  }

  logAuthDiagnostic({
    category: "manual",
    event: "TEST_TOKEN_REFRESH_START",
    severity: "info",
    message: "Test manuel de renouvellement de session initié...",
  });

  try {
    const { data, error } = await supabaseClient.auth.refreshSession();
    if (error) {
      logAuthDiagnostic({
        category: "manual",
        event: "TEST_TOKEN_REFRESH_FAILED",
        severity: "error",
        message: `Échec du test de renouvellement : ${error.message} (status: ${error.status})`,
        details: {
          errorName: error.name,
          errorMessage: error.message,
          errorStatus: error.status,
        },
      });
      return {
        success: false,
        message: `Erreur: ${error.message}`,
        details: { error },
      };
    }

    const expiresAt = data.session?.expires_at;
    const remainingSec = expiresAt ? expiresAt - Math.floor(Date.now() / 1000) : null;

    logAuthDiagnostic({
      category: "manual",
      event: "TEST_TOKEN_REFRESH_SUCCESS",
      severity: "info",
      message: `Test de renouvellement réussi ! Nouvelle expiration dans ${remainingSec ? Math.round(remainingSec / 60) : "?"} min.`,
      details: {
        userId: data.user?.id,
        email: data.user?.email,
        expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
      },
    });

    return {
      success: true,
      message: "Renouvellement de session réussi avec succès !",
      details: {
        userId: data.user?.id,
        email: data.user?.email,
        expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
      },
    };
  } catch (err: any) {
    logAuthDiagnostic({
      category: "manual",
      event: "TEST_TOKEN_REFRESH_EXCEPTION",
      severity: "error",
      message: `Exception lors du test de renouvellement : ${err?.message || err}`,
    });
    return {
      success: false,
      message: `Exception: ${err?.message || err}`,
    };
  }
}

/**
 * Initialize system background watchers:
 * - Sleep / Resume heartbeat
 * - Online / Offline network listeners
 * - Storage mutation listener
 */
export function initAuthDiagnosticsWatchers(supabaseUrl?: string) {
  if (isWatchersInitialized || typeof window === "undefined") return;
  isWatchersInitialized = true;

  logAuthDiagnostic({
    category: "system",
    event: "DIAGNOSTICS_INITIALIZED",
    severity: "info",
    message: "Surveillance diagnostique d'authentification démarrée.",
    details: {
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "inconnu",
      isOnline: getIsOnline(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });

  // 1. Initial clock skew check in background
  void measureClockSkew(supabaseUrl);

  // 2. Network online / offline listeners
  window.addEventListener("online", () => {
    logAuthDiagnostic({
      category: "network",
      event: "NETWORK_ONLINE",
      severity: "info",
      message: "Connexion réseau rétablie (online).",
    });
  });

  window.addEventListener("offline", () => {
    logAuthDiagnostic({
      category: "network",
      event: "NETWORK_OFFLINE",
      severity: "warn",
      message: "Connexion réseau perdue (offline).",
    });
  });

  // 3. Storage mutation listener (detects if another tab or external script clears the token)
  window.addEventListener("storage", (event) => {
    if (!event.key || event.key.includes("auth-token") || event.key.startsWith("sb-")) {
      logAuthDiagnostic({
        category: "storage",
        event: "STORAGE_MUTATION_EXTERNAL",
        severity: event.newValue ? "info" : "warn",
        message: event.newValue
          ? `Clé de session modifiée par une autre fenêtre (${event.key}).`
          : `Clé de session SUPPRIMÉE par une autre fenêtre ou un processus externe (${event.key}) !`,
        details: {
          key: event.key,
          hadOldValue: Boolean(event.oldValue),
          hasNewValue: Boolean(event.newValue),
        },
      });
    }
  });

  // 4. Heartbeat timer for detecting OS sleep / wake
  let lastHeartbeat = Date.now();
  setInterval(() => {
    const now = Date.now();
    const elapsed = now - lastHeartbeat;
    lastHeartbeat = now;

    // Expected interval is ~10s. If elapsed > 25s, the system was suspended/asleep!
    if (elapsed > 25000) {
      const suspendedSeconds = Math.round((elapsed - 10000) / 1000);
      const isOnline = getIsOnline();

      logAuthDiagnostic({
        category: "system",
        event: "SYSTEM_RESUME_AFTER_SLEEP",
        severity: "warn",
        message: `Sortie de veille détectée : le poste a été suspendu pendant env. ${Math.round(suspendedSeconds / 60)} min (${suspendedSeconds}s). En ligne: ${isOnline}`,
        details: {
          suspendedSeconds,
          isOnline,
          lastTokenExpiresAt: lastKnownSessionSnapshot?.expiresAtIso,
        },
      });

      // Re-verify clock skew after waking
      void measureClockSkew(supabaseUrl);
    }
  }, 10000);

  // Expose on global window object for quick DevTools inspection
  if (typeof window !== "undefined") {
    (window as any).__AUTH_DIAGNOSTICS__ = {
      getLogs: getAuthDiagnosticsLogs,
      getLastSignOut: getLastSignOutRecord,
      getReport: generateAuthDiagnosticReport,
      copyReport: copyReportToClipboard,
      measureClockSkew: () => measureClockSkew(supabaseUrl),
      clearLogs: clearAuthDiagnosticLogs,
      checkStorage: checkStorageHealth,
    };
  }
}

/**
 * Generate formatted text report for sharing
 */
export function generateAuthDiagnosticReport(currentUser?: { id?: string; email?: string | null } | null): string {
  const now = new Date();
  const storage = checkStorageHealth();
  const lastSignOut = getLastSignOutRecord();
  const logs = getAuthDiagnosticsLogs();

  const timeZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "inconnu";
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "inconnu";
  const isOnline = getIsOnline();


  const lines: string[] = [];
  lines.push("================================================================================");
  lines.push("              TRACABILITY OS - RAPPORT DIAGNOSTIC D'AUTHENTIFICATION             ");
  lines.push("================================================================================");
  lines.push(`Généré le        : ${now.toISOString()} (${now.toLocaleString("fr-FR")})`);
  lines.push(`Fuseau horaire   : ${timeZone}`);
  lines.push(`Plateforme / Nav : ${userAgent}`);
  lines.push(`État Réseau      : ${isOnline ? "EN LIGNE (Connected)" : "HORS LIGNE (Offline)"}`);
  lines.push("");

  lines.push("--------------------------------------------------------------------------------");
  lines.push("1. ANALYSE DE LA DERNIÈRE DÉCONNEXION");
  lines.push("--------------------------------------------------------------------------------");
  if (!lastSignOut) {
    lines.push("Aucune déconnexion enregistrée depuis l'installation ou la réinitialisation.");
  } else {
    lines.push(`Horodatage      : ${lastSignOut.timestamp} (${lastSignOut.localTimeFormatted})`);
    lines.push(`Type             : ${lastSignOut.isManual ? "MANUELLE (Utilisateur a cliqué 'Se déconnecter')" : "AUTOMATIQUE INATTENDUE"}`);
    lines.push(`Code raison      : ${lastSignOut.reasonCode}`);
    lines.push(`Résumé           : ${lastSignOut.summary}`);
    lines.push(`Cause suspectée  : ${lastSignOut.suspectedCause}`);
    lines.push(`Recommandation   : ${lastSignOut.recommendation}`);
    if (lastSignOut.secondsSinceTokenExpiry !== null) {
      lines.push(`Décalage jeton   : Jeton expiré depuis ${lastSignOut.secondsSinceTokenExpiry}s au moment de la déconnexion`);
    }
    if (lastSignOut.lastRefreshHttpError) {
      lines.push(`Dernière erreur  : HTTP ${lastSignOut.lastRefreshHttpError.status} sur ${lastSignOut.lastRefreshHttpError.endpoint}`);
      lines.push(`Détail réponse   : ${lastSignOut.lastRefreshHttpError.body}`);
    }
  }
  lines.push("");

  lines.push("--------------------------------------------------------------------------------");
  lines.push("2. SANTÉ DU STOCKAGE LOCAL (LocalStorage & WebView2)");
  lines.push("--------------------------------------------------------------------------------");
  lines.push(`LocalStorage accessible : ${storage.isAvailable ? "OUI (Test lecture/écriture OK)" : "NON (" + storage.error + ")"}`);
  lines.push(`Clé jeton Supabase      : ${storage.supabaseTokenFound ? "PRÉSENTE (" + storage.supabaseTokenKey + ", " + storage.supabaseTokenBytes + " octets)" : "ABSENTE DU STOCKAGE !"}`);
  lines.push(`Nombre total de clés    : ${storage.totalKeys}`);
  lines.push("");

  lines.push("--------------------------------------------------------------------------------");
  lines.push("3. HORLOGE SYSTÈME & DÉCALAGE SERVEUR");
  lines.push("--------------------------------------------------------------------------------");
  lines.push(`Heure locale machine : ${now.toISOString()}`);
  if (lastKnownClockSkewSeconds !== null) {
    const sign = lastKnownClockSkewSeconds >= 0 ? "+" : "";
    lines.push(`Décalage serveur     : ${sign}${lastKnownClockSkewSeconds} secondes`);
    if (Math.abs(lastKnownClockSkewSeconds) > 60) {
      lines.push(`ATTENTION            : Horloge décalée de plus de 60s ! Cela perturbe l'expiration des jetons JWT.`);
    } else {
      lines.push(`État décalage        : NORMAL (< 60s)`);
    }
  } else {
    lines.push("Décalage serveur     : Non mesuré récemment.");
  }
  lines.push("");

  lines.push("--------------------------------------------------------------------------------");
  lines.push("4. ÉTAT DE LA SESSION ACTUELLE");
  lines.push("--------------------------------------------------------------------------------");
  const userEmail = currentUser?.email || lastKnownSessionSnapshot?.email;
  const userId = currentUser?.id || lastKnownSessionSnapshot?.userId;
  lines.push(`Utilisateur actif    : ${userEmail || "Non connecté"}`);
  lines.push(`Identifiant User ID  : ${userId || "Aucun"}`);
  if (lastKnownSessionSnapshot?.expiresAt) {
    const remaining = lastKnownSessionSnapshot.expiresAt - Math.floor(Date.now() / 1000);
    const expDate = new Date(lastKnownSessionSnapshot.expiresAt * 1000);
    lines.push(`Expiration du jeton  : ${expDate.toISOString()} (${expDate.toLocaleString("fr-FR")})`);
    lines.push(`Temps restant        : ${remaining > 0 ? Math.round(remaining / 60) + " minutes (" + remaining + "s)" : "EXPIRÉ depuis " + Math.abs(remaining) + "s"}`);
  }
  lines.push("");

  lines.push("--------------------------------------------------------------------------------");
  lines.push(`5. HISTORIQUE RÉCENT DES ÉVÉNEMENTS AUTH (${logs.length} derniers événements)`);
  lines.push("--------------------------------------------------------------------------------");
  if (logs.length === 0) {
    lines.push("Aucun événement enregistré.");
  } else {
    logs.slice(-30).forEach((entry, idx) => {
      const severityMark = entry.severity === "error" ? "❌ [ERREUR]" : entry.severity === "warn" ? "⚠️ [AVERT]" : "ℹ️ [INFO]";
      lines.push(`${idx + 1}. ${entry.localTimeFormatted} ${severityMark} [${entry.event}]`);
      lines.push(`   Message : ${entry.message}`);
      if (entry.details) {
        lines.push(`   Détails : ${JSON.stringify(entry.details)}`);
      }
    });
  }
  lines.push("================================================================================");
  lines.push("                              FIN DU RAPPORT                                    ");
  lines.push("================================================================================");

  return lines.join("\n");
}

/**
 * Copy report to clipboard with fallback
 */
export async function copyReportToClipboard(currentUser?: { id?: string; email?: string | null } | null): Promise<boolean> {
  const text = generateAuthDiagnosticReport(currentUser);
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }

  try {
    if (typeof document !== "undefined") {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      return success;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Download report as a .txt file
 */
export function downloadReportFile(currentUser?: { id?: string; email?: string | null } | null) {
  if (typeof document === "undefined" || typeof Blob === "undefined") return;
  const text = generateAuthDiagnosticReport(currentUser);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const now = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rapport-diagnostic-auth-${now}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
