import React, { useEffect, useState } from 'react';
import { TMDB_API_KEY, TMDB_BASE_URL } from '../constants';
import { Ticket } from 'lucide-react';

interface StreamingBadgeProps {
  mediaId: number;
  mediaType: 'movie' | 'tv';
  releaseDate?: string;
}

const PROVIDER_STYLES: Record<number, string> = {
  8: 'bg-red-600 text-white', // Netflix
  337: 'bg-blue-900 text-white', // Disney+
  119: 'bg-blue-500 text-white', // Prime
  381: 'bg-black text-white', // Canal+
};

const PROVIDER_NAMES: Record<number, string> = {
  8: 'NETFLIX',
  337: 'DISNEY+',
  119: 'PRIME',
  381: 'CANAL+',
};

const StreamingBadge: React.FC<StreamingBadgeProps> = ({ mediaId, mediaType, releaseDate }) => {
  const [badge, setBadge] = useState<{
    type: 'provider' | 'cinema';
    label: string;
    className?: string;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchProviders = async () => {
      try {
        const res = await fetch(
          `${TMDB_BASE_URL}/${mediaType}/${mediaId}/watch/providers?api_key=${TMDB_API_KEY}`
        );
        const data = await res.json();
        const frProviders = data.results?.FR;

        if (!isMounted) return;

        // 1. Check Flatrate (Streaming par abonnement)
        // On cherche s'il y a un des majeurs (Netflix, Disney, Prime, Canal)
        const flatrate = frProviders?.flatrate || [];
        const priorityProvider = flatrate.find((p: any) => PROVIDER_STYLES[p.provider_id]);

        if (priorityProvider) {
          setBadge({
            type: 'provider',
            label: PROVIDER_NAMES[priorityProvider.provider_id] || priorityProvider.provider_name,
            className: PROVIDER_STYLES[priorityProvider.provider_id],
          });
          return; // Priorité absolue au streaming
        }

        // 2. Check Cinema (plus précis avec release_dates)
        if (mediaType === 'movie' && releaseDate && !priorityProvider) {
          try {
            const releaseDatesRes = await fetch(
              `${TMDB_BASE_URL}/movie/${mediaId}/release_dates?api_key=${TMDB_API_KEY}`
            );
            const releaseDatesData = await releaseDatesRes.json();

            const frReleases = releaseDatesData.results?.find((r: any) => r.iso_3166_1 === 'FR');

            if (frReleases?.release_dates) {
              const now = new Date();
              const threeMonthsAgo = new Date();
              threeMonthsAgo.setMonth(now.getMonth() - 3);

              const theatricalRelease = frReleases.release_dates.find((rd: any) => rd.type === 3);
              const digitalRelease = frReleases.release_dates.find((rd: any) => rd.type === 4);

              if (theatricalRelease) {
                const theatricalDate = new Date(theatricalRelease.release_date);
                const isRecentTheatrical = theatricalDate >= threeMonthsAgo && theatricalDate <= now;

                let hasDigitalRelease = false;
                if (digitalRelease) {
                  const digitalDate = new Date(digitalRelease.release_date);
                  const twoWeeksAgo = new Date();
                  twoWeeksAgo.setDate(now.getDate() - 14);
                  hasDigitalRelease = digitalDate < twoWeeksAgo;
                }

                if (isRecentTheatrical && !hasDigitalRelease) {
                  if (!isMounted) return;
                  setBadge({ type: 'cinema', label: 'AU CINÉMA' });
                }
              }
            } else {
              // Pas de données FR : fallback date simple
              const release = new Date(releaseDate);
              const now = new Date();
              const threeMonthsAgo = new Date();
              threeMonthsAgo.setMonth(now.getMonth() - 3);
              if (release >= threeMonthsAgo && release <= now) {
                if (!isMounted) return;
                setBadge({ type: 'cinema', label: 'AU CINÉMA' });
              }
            }
          } catch {
            // Fallback date simple en cas d'erreur API
            const release = new Date(releaseDate);
            const now = new Date();
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(now.getMonth() - 3);
            if (release >= threeMonthsAgo && release <= now) {
              if (!isMounted) return;
              setBadge({ type: 'cinema', label: 'AU CINÉMA' });
            }
          }
        }
      } catch (error) {
        // En cas d'erreur sur watch/providers, on n'affiche rien
      }
    };

    fetchProviders();

    return () => {
      isMounted = false;
    };
  }, [mediaId, mediaType, releaseDate]);

  if (!badge) return null;

  if (badge.type === 'cinema') {
    return (
      <div className="bg-charcoal/90 backdrop-blur-md text-white px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-lg border border-white/10 animate-[fadeIn_0.3s_ease-out]">
        <Ticket size={10} className="text-bitter-lime" />
        <span className="text-[9px] font-black uppercase tracking-wide">{badge.label}</span>
      </div>
    );
  }

  return (
    <div
      className={`px-2.5 py-1 rounded-lg shadow-lg border border-white/10 animate-[fadeIn_0.3s_ease-out] ${badge.className}`}
    >
      <span className="text-[9px] font-black uppercase tracking-wide">{badge.label}</span>
    </div>
  );
};

export default StreamingBadge;
