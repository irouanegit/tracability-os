import assert from "node:assert/strict";
import test from "node:test";
import {
  logAuthDiagnostic,
  getAuthDiagnosticsLogs,
  getLastSignOutRecord,
  markManualSignOut,
  handleAuthDiagnosticsStateChange,
  generateAuthDiagnosticReport,
  clearAuthDiagnosticLogs,
  authDiagnosticFetch,
  checkStorageHealth,
} from "../src/lib/authDiagnostics.ts";

test("logAuthDiagnostic records and retrieves diagnostic entries", () => {
  clearAuthDiagnosticLogs();
  
  const entry = logAuthDiagnostic({
    category: "auth_state",
    event: "TEST_EVENT",
    severity: "info",
    message: "Test message for diagnostics",
    details: { foo: "bar" },
  });

  assert.ok(entry.id);
  assert.equal(entry.event, "TEST_EVENT");
  assert.equal(entry.category, "auth_state");
  assert.equal(entry.severity, "info");
  assert.equal(entry.message, "Test message for diagnostics");
  assert.deepEqual(entry.details, { foo: "bar" });

  const logs = getAuthDiagnosticsLogs();
  assert.ok(logs.some((l) => l.event === "TEST_EVENT"));
});

test("markManualSignOut distinguishes manual signout from automatic unexpected signout", () => {
  clearAuthDiagnosticLogs();

  // 1. First test manual signout flow
  markManualSignOut();
  handleAuthDiagnosticsStateChange("SIGNED_OUT", null);

  const manualRecord = getLastSignOutRecord();
  assert.ok(manualRecord);
  assert.equal(manualRecord.isManual, true);
  assert.equal(manualRecord.reasonCode, "manual_signout");

  // 2. Now test unexpected signout flow (e.g. Supabase session dropped without clicking signout)
  handleAuthDiagnosticsStateChange("SIGNED_IN", {
    user: { id: "user-123", email: "chef@casabianca.ma" },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });

  // Sudden SIGNED_OUT without markManualSignOut
  handleAuthDiagnosticsStateChange("SIGNED_OUT", null);

  const unexpectedRecord = getLastSignOutRecord();
  assert.ok(unexpectedRecord);
  assert.equal(unexpectedRecord.isManual, false);
  assert.equal(unexpectedRecord.reasonCode, "unexpected_automatic_signout");
  assert.ok(unexpectedRecord.suspectedCause);
  assert.ok(unexpectedRecord.recommendation);
});

test("TOKEN_REFRESHED state change logs remaining time and updates snapshot", () => {
  clearAuthDiagnosticLogs();

  const fakeExpiresAt = Math.floor(Date.now() / 1000) + 3500;
  handleAuthDiagnosticsStateChange("TOKEN_REFRESHED", {
    user: { id: "user-abc", email: "quality@casabianca.ma" },
    expires_at: fakeExpiresAt,
  });

  const logs = getAuthDiagnosticsLogs();
  const refreshEntry = logs.find((l) => l.event === "TOKEN_REFRESHED");
  assert.ok(refreshEntry);
  assert.equal(refreshEntry.category, "token_refresh");
  assert.ok(refreshEntry.message.includes("Jeton renouvelé avec succès"));
});

test("generateAuthDiagnosticReport compiles formatted report with all essential sections", () => {
  const report = generateAuthDiagnosticReport({
    id: "test-user-id",
    email: "test@example.com",
  });

  assert.ok(report.includes("RAPPORT DIAGNOSTIC D'AUTHENTIFICATION"));
  assert.ok(report.includes("1. ANALYSE DE LA DERNIÈRE DÉCONNEXION"));
  assert.ok(report.includes("2. SANTÉ DU STOCKAGE LOCAL"));
  assert.ok(report.includes("3. HORLOGE SYSTÈME & DÉCALAGE SERVEUR"));
  assert.ok(report.includes("4. ÉTAT DE LA SESSION ACTUELLE"));
  assert.ok(report.includes("5. HISTORIQUE RÉCENT DES ÉVÉNEMENTS AUTH"));
  assert.ok(report.includes("FIN DU RAPPORT"));
});

test("checkStorageHealth executes safely in test environment", () => {
  const health = checkStorageHealth();
  assert.equal(typeof health.isAvailable, "boolean");
  assert.equal(typeof health.isOnline, "boolean");
  assert.equal(typeof health.supabaseTokenFound, "boolean");
});

test("authDiagnosticFetch intercepts refresh_token endpoint failures and logs error details", async () => {
  clearAuthDiagnosticLogs();

  // Mock a mock server using node's global fetch or intercepted mock
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input, init) => {
      return new Response(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "Invalid Refresh Token: Refresh Token Not Found",
        }),
        {
          status: 400,
          statusText: "Bad Request",
          headers: {
            "Content-Type": "application/json",
            date: new Date().toUTCString(),
          },
        }
      );
    };

    const res = await authDiagnosticFetch("https://mock.supabase.co/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
    });

    assert.equal(res.status, 400);

    const logs = getAuthDiagnosticsLogs();
    const errorEntry = logs.find((l) => l.event === "TOKEN_REFRESH_HTTP_ERROR");
    assert.ok(errorEntry);
    assert.equal(errorEntry.severity, "error");
    assert.ok(errorEntry.message.includes("Échec renouvellement jeton : HTTP 400"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
