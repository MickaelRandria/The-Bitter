/**
 * Spotify : créer une playlist dans le compte de la personne.
 *
 * Connexion « Authorization Code + PKCE » : aucun secret, l'identifiant client
 * est public par nature. Spotify revient sur `/spotify/` (public/spotify/
 * index.html), qui échange le code contre un jeton puis renvoie sur
 * `/?spotify=playlist`.
 *
 * Limites du mode développement de Spotify (février 2026) : le propriétaire de
 * l'appli doit être Premium, et seuls les comptes ajoutés à la main dans le
 * tableau de bord Spotify (cinq au plus) peuvent se connecter. Sans
 * VITE_SPOTIFY_CLIENT_ID, le bouton n'apparaît pas.
 */

const CLIENT_ID = (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined)?.trim() || '';
const SCOPES = 'playlist-modify-private playlist-modify-public';
const PKCE_KEY = 'bitter:spotify:pkce';
const TOKEN_KEY = 'bitter:spotify:token';
const PENDING_KEY = 'bitter:spotify:pending';
const API = 'https://api.spotify.com/v1';

export const spotifyAvailable = CLIENT_ID.length > 0;

interface StoredToken {
  access: string;
  refresh?: string;
  expiresAt: number;
}

const redirectUri = () => `${window.location.origin}/spotify/`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage bloqué : la connexion ne survivra pas au retour de Spotify.
  }
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Part chez Spotify. `pending` est rendu au retour par `takePendingPlaylist`. */
export async function startSpotifyLogin(pending: string) {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  write(PKCE_KEY, { verifier, state, clientId: CLIENT_ID, redirectUri: redirectUri() });
  write(PENDING_KEY, pending);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
    state,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

/** Ce qu'on voulait faire avant de partir chez Spotify, une seule fois. */
export function takePendingPlaylist(): string | null {
  const pending = read<string>(PENDING_KEY);
  write(PENDING_KEY, null);
  return pending;
}

export const isSpotifyConnected = () => !!read<StoredToken>(TOKEN_KEY);

export function disconnectSpotify() {
  write(TOKEN_KEY, null);
}

async function accessToken(): Promise<string | null> {
  const token = read<StoredToken>(TOKEN_KEY);
  if (!token) return null;
  if (Date.now() < token.expiresAt - 60_000) return token.access;
  if (!token.refresh) return null;
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: token.refresh, client_id: CLIENT_ID }),
  });
  if (!response.ok) {
    write(TOKEN_KEY, null);
    return null;
  }
  const body = await response.json();
  const next: StoredToken = {
    access: body.access_token,
    refresh: body.refresh_token || token.refresh,
    expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000,
  };
  write(TOKEN_KEY, next);
  return next.access;
}

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (response.status === 401 || response.status === 403) {
    // Jeton révoqué, ou compte absent de la liste des testeurs de l'appli.
    write(TOKEN_KEY, null);
    throw Object.assign(Error('spotify-auth'), { code: response.status });
  }
  if (!response.ok) throw Error(`spotify ${response.status}`);
  return response.status === 204 ? (undefined as T) : response.json();
}

/** L'adresse Spotify d'un morceau, ou null quand Spotify ne le trouve pas. */
async function findTrack(token: string, title: string, artist: string): Promise<string | null> {
  const queries = [`track:"${title}" artist:"${artist}"`, `${title} ${artist}`];
  for (const q of queries) {
    const body = await api<{ tracks?: { items?: { uri: string }[] } }>(
      token,
      `/search?type=track&limit=1&q=${encodeURIComponent(q)}`
    );
    const uri = body.tracks?.items?.[0]?.uri;
    if (uri) return uri;
  }
  return null;
}

export interface PlaylistResult {
  url: string;
  found: number;
  total: number;
}

/**
 * Cherche chaque morceau sur Spotify puis crée une playlist privée.
 * Rend null quand il faut d'abord se connecter.
 */
export async function createSpotifyPlaylist(
  name: string,
  description: string,
  tracks: { title: string; artist: string }[],
  onProgress?: (done: number) => void
): Promise<PlaylistResult | null> {
  const token = await accessToken();
  if (!token) return null;
  const uris: string[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const uri = await findTrack(token, tracks[i].title, tracks[i].artist).catch((error) => {
      if ((error as Error).message === 'spotify-auth') throw error;
      return null;
    });
    if (uri && !uris.includes(uri)) uris.push(uri);
    onProgress?.(i + 1);
  }
  if (!uris.length) throw Error('spotify-nothing-found');
  const playlist = await api<{ id: string; external_urls?: { spotify?: string } }>(token, '/me/playlists', {
    method: 'POST',
    body: JSON.stringify({ name, description, public: false }),
  });
  for (let i = 0; i < uris.length; i += 100) {
    await api(token, `/playlists/${playlist.id}/items`, {
      method: 'POST',
      body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
    });
  }
  return {
    url: playlist.external_urls?.spotify || `https://open.spotify.com/playlist/${playlist.id}`,
    found: uris.length,
    total: tracks.length,
  };
}
