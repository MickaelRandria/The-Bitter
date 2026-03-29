import React, { useEffect, useState } from 'react';
import { X, Star, Film } from 'lucide-react';
import { SpaceMember, getMemberTopFilms, getMemberStats } from '../services/supabase';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  member: SpaceMember;
  onClose: () => void;
}

export default function MemberProfileModal({ member, onClose }: Props) {
  const { t } = useLanguage();
  const [topFilms, setTopFilms] = useState<
    { id: string; title: string; poster_url?: string; year: number; director: string; avg_rating: number }[]
  >([]);
  const [stats, setStats] = useState<{ watchedCount: number; avgRating: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [films, memberStats] = await Promise.all([
        getMemberTopFilms(member.profile_id),
        getMemberStats(member.profile_id),
      ]);
      setTopFilms(films);
      setStats(memberStats);
      setLoading(false);
    };
    load();
  }, [member.profile_id]);

  const isOwner = member.role === 'owner';

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
      <div className="relative bg-white dark:bg-[#1a1a1a] w-full sm:max-w-md rounded-t-[3rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)] overflow-hidden border border-sand dark:border-white/10">
        {/* Header */}
        <div className="p-8 border-b border-sand dark:border-white/10 bg-white dark:bg-[#1a1a1a] flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black tracking-tight text-charcoal dark:text-white">
              {t('shared.memberProfile')}
            </h3>
            <p className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-500 tracking-widest mt-1">
              {t('shared.publicProfile')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-3 bg-stone-100 dark:bg-[#252525] rounded-full text-stone-500 hover:text-charcoal dark:hover:text-white transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-8 overflow-y-auto no-scrollbar space-y-8">
          {/* Avatar + Name */}
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 rounded-full bg-stone-100 dark:bg-[#252525] border-4 border-white dark:border-white/10 shadow-lg mb-4 flex items-center justify-center overflow-hidden">
              {member.profile?.avatar_url ? (
                <img src={member.profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-black text-stone-300 dark:text-stone-700">
                  {(member.profile?.first_name || '?')[0].toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-charcoal dark:text-white tracking-tight">
                {member.profile?.first_name}
              </h2>
              {isOwner && (
                <span className="text-[9px] font-black uppercase tracking-widest bg-bitter-lime text-charcoal px-2 py-0.5 rounded-lg">
                  Fondateur
                </span>
              )}
            </div>
          </div>

          {/* Stats */}
          {!loading && stats && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-stone-50 dark:bg-[#161616] rounded-2xl p-4 border border-stone-100 dark:border-white/5 text-center">
                <p className="text-2xl font-black text-charcoal dark:text-white">{stats.watchedCount}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 mt-1">
                  Films notés
                </p>
              </div>
              <div className="bg-stone-50 dark:bg-[#161616] rounded-2xl p-4 border border-stone-100 dark:border-white/5 text-center">
                <p className="text-2xl font-black text-charcoal dark:text-white">
                  {stats.avgRating > 0 ? stats.avgRating.toFixed(1) : '—'}
                </p>
                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 mt-1">
                  Moyenne /10
                </p>
              </div>
            </div>
          )}

          {/* Bio */}
          {member.profile?.bio && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-600 tracking-widest">Bio</h4>
              <p className="text-sm font-medium text-charcoal dark:text-stone-300 leading-relaxed p-4 bg-stone-50 dark:bg-[#161616] rounded-2xl border border-stone-100 dark:border-white/5">
                {member.profile.bio}
              </p>
            </div>
          )}

          {/* Top 5 */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-600 tracking-widest flex items-center gap-2">
              <Film size={12} />
              Top 5 films
            </h4>
            {loading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-14 bg-stone-100 dark:bg-[#252525] rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : topFilms.length === 0 ? (
              <div className="text-center py-8 bg-stone-50 dark:bg-[#161616] rounded-2xl border border-dashed border-stone-200 dark:border-white/10">
                <p className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-widest">
                  Aucun film noté
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {topFilms.map((film, i) => (
                  <div
                    key={film.id}
                    className="flex items-center gap-3 bg-stone-50 dark:bg-[#161616] rounded-2xl p-3 border border-stone-100 dark:border-white/5"
                  >
                    <span className="text-[10px] font-black text-stone-300 dark:text-stone-700 w-4 text-center shrink-0">{i + 1}</span>
                    {film.poster_url ? (
                      <img src={film.poster_url} alt="" className="w-8 rounded-md object-cover aspect-[2/3] shrink-0" />
                    ) : (
                      <div className="w-8 aspect-[2/3] bg-stone-200 dark:bg-[#252525] rounded-md shrink-0 flex items-center justify-center">
                        <Film size={12} className="text-stone-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-charcoal dark:text-white truncate">{film.title}</p>
                      <p className="text-[10px] text-stone-400 dark:text-stone-600 truncate">{film.director} · {film.year}</p>
                    </div>
                    <div className="flex items-center gap-1 text-charcoal bg-bitter-lime px-2.5 py-1 rounded-lg shrink-0">
                      <Star size={10} fill="currentColor" />
                      <span className="text-[10px] font-black">{film.avg_rating.toFixed(1)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
