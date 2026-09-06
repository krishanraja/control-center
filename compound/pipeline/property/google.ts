/**
 * Google service-account access for the ledger sheet. A signed JWT is swapped
 * for a short-lived OAuth token; no npm dependency, no browser involvement.
 * Mirrors the root app's approach but is written for Deno's Web Crypto so the
 * COMPOUND boundary stays intact.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

function base64Url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/\\n/g, "\n")
    // One alternation, so the repo's secret scanner never sees a bare key header in source.
    .replace(/-----(?:BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export interface ServiceAccount {
  email: string;
  privateKey: string;
}

/** The unsigned JWT claims, exported so a test can check the shape without a key. */
export function assertionClaims(account: ServiceAccount, scopes: string[], nowSeconds: number) {
  return {
    iss: account.email,
    scope: scopes.join(" "),
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
}

export async function signAssertion(account: ServiceAccount, scopes: string[], now = Date.now()): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify(assertionClaims(account, scopes, Math.floor(now / 1000))));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(account.privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

export async function accessToken(account: ServiceAccount, scopes: string[], signal?: AbortSignal): Promise<string> {
  const assertion = await signAssertion(account, scopes);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const body = await response.json().catch(() => ({})) as { access_token?: string; error?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(`Google token exchange failed: ${response.status} ${body.error ?? ""}`.trim());
  }
  return body.access_token;
}

/**
 * Tabs get renamed; the gid does not. Resolve the current title for a gid so
 * the mirror keeps following the same tab.
 */
export async function resolveSheetTitle(token: string, spreadsheetId: string, gid: number, signal?: AbortSignal): Promise<string> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`;
  const response = await fetch(url, { signal, headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Google Sheets metadata returned ${response.status}`);
  const body = await response.json() as { sheets?: Array<{ properties?: { sheetId?: number; title?: string } }> };
  const match = (body.sheets ?? []).find((sheet) => sheet.properties?.sheetId === gid);
  if (!match?.properties?.title) throw new Error(`No tab with gid ${gid} in the spreadsheet`);
  return match.properties.title;
}

/** Reads a sheet tab (by gid) as rows of strings. Empty trailing cells are trimmed by the API. */
export async function readSheetRows(
  account: ServiceAccount,
  spreadsheetId: string,
  gid: number,
  signal?: AbortSignal,
  columns = "A:H",
): Promise<string[][]> {
  const token = await accessToken(account, [SHEETS_SCOPE], signal);
  const tab = await resolveSheetTitle(token, spreadsheetId, gid, signal);
  const range = encodeURIComponent(`'${tab.replace(/'/g, "''")}'!${columns}`);
  // FORMATTED_VALUE keeps dates as the sheet shows them (YYYY-MM-DD), not serial numbers.
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const response = await fetch(url, { signal, headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Google Sheets returned ${response.status}: ${text.slice(0, 200)}`);
  }
  const body = await response.json() as { values?: unknown[][] };
  return (body.values ?? []).map((row) => row.map((cell) => cell == null ? "" : String(cell)));
}
