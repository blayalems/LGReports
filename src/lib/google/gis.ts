// Thin wrapper around Google Identity Services' OAuth token client.
// Access tokens live in memory only — never localStorage/IndexedDB — so closing the
// tab signs the leader out of the API (the workbook itself stays shared via Drive).
// The OAuth *client id* is public by design (it ships in every client-side OAuth app);
// no secret of any kind exists in this codebase.

const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** Sheets read/write + who-is-signed-in. Deliberately NO Drive scope — see docs/google-sheets-setup.md. */
export const OAUTH_SCOPES = 'https://www.googleapis.com/auth/spreadsheets openid email';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

interface GisNamespace {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string; message?: string }) => void;
      }): TokenClient;
      revoke(accessToken: string, done?: () => void): void;
    };
  };
}

declare global {
  interface Window {
    google?: GisNamespace;
  }
}

let gisLoading: Promise<GisNamespace> | null = null;

function loadGis(): Promise<GisNamespace> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (!gisLoading) {
    gisLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.onload = () => {
        if (window.google?.accounts?.oauth2) resolve(window.google);
        else reject(new Error('Google Identity Services failed to initialize'));
      };
      script.onerror = () => {
        gisLoading = null;
        reject(new Error('Could not load Google sign-in (are you offline?)'));
      };
      document.head.appendChild(script);
    });
  }
  return gisLoading;
}

export class GoogleAuth {
  private clientId: string;
  private accessToken: string | null = null;
  private expiresAt = 0;
  private email: string | null = null;
  private pending: Promise<string | null> | null = null;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  /** Signed-in account email once known (used as actorId for the shared audit trail). */
  getEmail(): string | null {
    return this.email;
  }

  hasFreshToken(): boolean {
    return !!this.accessToken && Date.now() < this.expiresAt - 60_000;
  }

  /**
   * Returns a valid access token or null. `interactive: false` only succeeds when the
   * browser already has a Google session with prior consent (no popup); use it for
   * page-load restores. `interactive: true` may open the consent popup — only call it
   * from a user gesture (button click), or popup blockers will eat it.
   */
  async getToken(interactive: boolean): Promise<string | null> {
    if (this.hasFreshToken()) return this.accessToken;
    if (this.pending) return this.pending;

    this.pending = (async () => {
      try {
        const gis = await loadGis();
        const token = await new Promise<string | null>((resolve) => {
          const client = gis.accounts.oauth2.initTokenClient({
            client_id: this.clientId,
            scope: OAUTH_SCOPES,
            callback: (response) => {
              if (response.access_token) {
                this.accessToken = response.access_token;
                this.expiresAt = Date.now() + (response.expires_in ?? 3600) * 1000;
                resolve(response.access_token);
              } else {
                resolve(null);
              }
            },
            error_callback: () => resolve(null),
          });
          client.requestAccessToken({ prompt: interactive ? '' : 'none' });
        });
        if (token && !this.email) await this.fetchEmail(token);
        return token;
      } catch {
        return null;
      } finally {
        this.pending = null;
      }
    })();
    return this.pending;
  }

  private async fetchEmail(token: string): Promise<void> {
    try {
      const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const info = (await res.json()) as { email?: string };
        this.email = info.email ?? null;
      }
    } catch {
      // Email is a nicety for the audit trail; token auth still works without it.
    }
  }

  signOut(): void {
    if (this.accessToken && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(this.accessToken);
    }
    this.accessToken = null;
    this.expiresAt = 0;
    this.email = null;
  }
}
