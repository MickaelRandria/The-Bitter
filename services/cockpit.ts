import { supabase } from './supabase';
import type { Snapshot } from '../supabase/functions/cockpit/logic';

export type CockpitSnapshot = Snapshot;
export type CockpitContact = Snapshot['contacts'][number];

const TOKEN_KEY = 'bitter_cockpit_token';

const readToken = (): string | null => {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

const storeToken = (token: string) => {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Stockage bloqué : la session admin s'arrêtera à cette page.
  }
};

export interface CockpitResult<T> {
  ok: boolean;
  data?: T;
  code?: string;
  message?: string;
}

async function call<T>(body: Record<string, unknown>): Promise<CockpitResult<T>> {
  if (!supabase) return { ok: false, code: 'auth', message: 'Connecte-toi pour ouvrir le cockpit.' };
  const { data, error } = await supabase.functions.invoke('cockpit', { body });
  if (!error) return { ok: true, data: data as T };
  const response = (error as { context?: Response }).context;
  const detail = response && typeof response.json === 'function' ? await response.json().catch(() => null) : null;
  return { ok: false, code: detail?.code ?? 'upstream', message: detail?.message ?? 'Cockpit injoignable.' };
}

/** Sans mot de passe, ne réussit que pour le compte du propriétaire. */
export async function unlockCockpit(password?: string): Promise<CockpitResult<{ token?: string }>> {
  const result = await call<{ token?: string }>({ action: 'unlock', password });
  if (result.ok && result.data?.token) storeToken(result.data.token);
  return result;
}

export const loadCockpit = () => call<CockpitSnapshot>({ action: 'snapshot', token: readToken() });

export const draftCampaign = (segment: string, mode: string, subject: string, body: string) =>
  call<{ subject: string; body: string }>({ action: 'campaign_draft', token: readToken(), segment, mode, subject, body });

export type CampaignFormat = 'wall' | 'notes' | 'news';

export const previewCampaign = (format: CampaignFormat, segment: string, subject: string, body: string) =>
  call<{ html: string }>({ action: 'campaign_preview', token: readToken(), format, segment, subject, body });

export const testCampaign = (format: CampaignFormat, subject: string, body: string) =>
  call<{ ok: boolean }>({ action: 'campaign_test', token: readToken(), format, subject, body });

export const sendCampaign = (format: CampaignFormat, segment: string, subject: string, body: string) =>
  call<{ sent: number; failed: number; skipped: number }>({ action: 'campaign_send', token: readToken(), format, segment, subject, body });
