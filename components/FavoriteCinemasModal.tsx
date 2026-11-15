import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Loader2, MapPin, Plus, Trash2, X } from 'lucide-react';
import { FavoriteCinema } from '../types';
import { CinemaCity, CinemaOption, searchCinemaCities, searchCinemasNearCity } from '../services/cinemaDirectory';
import { CINEMA_COLORS, CINEMA_INK, MAX_FAVORITE_CINEMAS, uniqueFavoriteCinemas } from '../utils/favoriteCinemas';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { haptics } from '../utils/haptics';

interface Props {
  cinemas: FavoriteCinema[];
  /** Chaque changement est enregistré aussitôt : pas de bouton « Valider » à oublier. */
  onChange: (cinemas: FavoriteCinema[]) => void;
  onClose: () => void;
}

const fieldClass =
  'h-12 w-full appearance-none rounded-2xl border border-stone-200 bg-white px-4 text-sm font-semibold text-charcoal outline-none transition focus:border-bitter-lime focus:ring-4 focus:ring-bitter-lime/20 dark:border-white/10 dark:bg-[#191919] dark:text-white';

/**
 * Mes cinémas : jusqu'à cinq salles UGC, dans l'ordre où leurs séances
 * s'affichent. La première reste « le » cinéma de l'app (rappel de séance,
 * proposition de créneaux dans un espace).
 *
 * L'ajout reprend le parcours éprouvé de l'ancien choix unique : la ville
 * d'abord, puis la salle, dans l'annuaire `cinema-directory`.
 */
const FavoriteCinemasModal: React.FC<Props> = ({ cinemas: initial, onChange, onClose }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('cinemas.title'));
  const [cinemas, setCinemas] = useState<FavoriteCinema[]>(() => uniqueFavoriteCinemas(initial));
  const [adding, setAdding] = useState(initial.length === 0);
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<CinemaCity[]>([]);
  const [selectedCity, setSelectedCity] = useState<CinemaCity | null>(null);
  const [options, setOptions] = useState<CinemaOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const full = cinemas.length >= MAX_FAVORITE_CINEMAS;

  const commit = (next: FavoriteCinema[]) => {
    const list = uniqueFavoriteCinemas(next);
    setCinemas(list);
    onChange(list);
  };

  useEffect(() => {
    const query = cityQuery.trim();
    if (query.length < 2 || selectedCity?.label === cityQuery) {
      setCityResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchCinemaCities(query).then((result) => {
        setCityResults(result.data);
        setError(result.error || '');
      });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [cityQuery, selectedCity?.label]);

  const chooseCity = async (city: CinemaCity) => {
    setSelectedCity(city);
    setCityQuery(city.label);
    setCityResults([]);
    setOptions([]);
    setError('');
    setLoading(true);
    try {
      const result = await searchCinemasNearCity(city);
      setOptions(result.data);
      setError(result.error || (result.data.length === 0 ? t('cinemas.noneInCity') : ''));
    } catch (e) {
      console.warn('[Cinémas] Sélection de ville interrompue', e);
      setError(t('cinemas.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const add = (option: CinemaOption) => {
    if (full || !selectedCity || cinemas.some((c) => c.id === option.id)) return;
    haptics.success();
    commit([...cinemas, { id: option.id, name: option.name, city: selectedCity.label }]);
    if (cinemas.length + 1 >= MAX_FAVORITE_CINEMAS) setAdding(false);
  };

  const move = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= cinemas.length) return;
    haptics.soft();
    const next = [...cinemas];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  const remove = (id: string) => {
    haptics.soft();
    commit(cinemas.filter((c) => c.id !== id));
  };

  const iconButton =
    'grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-stone-500 transition hover:bg-stone-100 hover:text-charcoal disabled:opacity-25 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-white';

  return (
    <div {...dialog.props} className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
      <button className="absolute inset-0 bg-charcoal/60 backdrop-blur-sm" onClick={onClose} aria-label={t('showtimes.close')} tabIndex={-1} />
      <section className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] bg-cream dark:bg-[#111] sm:rounded-[2rem]">
        <div className="mx-auto mt-3 h-[5px] w-10 shrink-0 rounded-full bg-stone-200 dark:bg-white/15" aria-hidden="true" />
        <header className="flex shrink-0 items-start justify-between gap-3 px-5 pb-4 pt-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">{t('cinemas.kicker')}</p>
            <h2 className="mt-1.5 text-[28px] font-black leading-none tracking-tight text-charcoal dark:text-white">{t('cinemas.title')}</h2>
            <p className="mt-2 text-[13px] font-medium leading-relaxed text-stone-600 dark:text-stone-400">
              {t('cinemas.subtitle', { max: String(MAX_FAVORITE_CINEMAS) })}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('showtimes.close')}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sand text-charcoal dark:bg-white/10 dark:text-white"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto overscroll-contain px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
          {cinemas.length > 0 && (
            <ol className="space-y-2">
              {cinemas.map((cinema, index) => {
                const color = CINEMA_COLORS[index % CINEMA_COLORS.length];
                return (
                  <li
                    key={cinema.id}
                    className="flex items-center gap-2 rounded-[18px] border border-stone-200 bg-white py-1.5 pl-3 pr-1 dark:border-white/10 dark:bg-white/5"
                  >
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ring-1 ring-black/5 dark:ring-white/25`}
                      style={{ background: color, color: CINEMA_INK[index % CINEMA_INK.length] }}
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1 pl-1">
                      <p className="truncate text-sm font-extrabold text-charcoal dark:text-white">{cinema.name}</p>
                      <p className="truncate text-[11px] font-semibold text-stone-500 dark:text-stone-400">{cinema.city}</p>
                    </div>
                    <button
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={t('cinemas.moveUp', { name: cinema.name })}
                      className={iconButton}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      onClick={() => move(index, 1)}
                      disabled={index === cinemas.length - 1}
                      aria-label={t('cinemas.moveDown', { name: cinema.name })}
                      className={iconButton}
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button onClick={() => remove(cinema.id)} aria-label={t('cinemas.remove', { name: cinema.name })} className={iconButton}>
                      <Trash2 size={16} />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}

          {full ? (
            <p className="rounded-2xl bg-sand px-4 py-3 text-xs font-bold text-stone-600 dark:bg-white/5 dark:text-stone-300">
              {t('cinemas.full', { max: String(MAX_FAVORITE_CINEMAS) })}
            </p>
          ) : !adding ? (
            <button
              onClick={() => setAdding(true)}
              className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed border-stone-400 text-[13px] font-extrabold text-forest transition active:scale-[0.99] dark:border-white/25 dark:text-bitter-lime"
            >
              <Plus size={16} strokeWidth={2.6} /> {t('cinemas.add')}
            </button>
          ) : (
            <div className="space-y-2.5 rounded-[22px] bg-sand p-4 dark:bg-white/5">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-600 dark:text-stone-300">
                {selectedCity ? t('cinemas.step2') : t('cinemas.step1')}
              </p>
              <label htmlFor="favorite-cinemas-city" className="block text-xs font-bold text-charcoal dark:text-white">
                {t('cinemas.city')}
              </label>
              <div className="relative">
                <MapPin size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  id="favorite-cinemas-city"
                  value={cityQuery}
                  onChange={(event) => {
                    setCityQuery(event.target.value);
                    setSelectedCity(null);
                    setOptions([]);
                    setError('');
                  }}
                  placeholder={t('cinemas.cityPlaceholder')}
                  className={`${fieldClass} pl-11`}
                  autoComplete="off"
                />
              </div>
              {cityResults.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-white/10 dark:bg-[#191919]">
                  {cityResults.map((city) => (
                    <button
                      key={city.id}
                      onClick={() => void chooseCity(city)}
                      className="flex min-h-[48px] w-full items-center justify-between gap-3 border-b border-stone-100 px-4 text-left last:border-0 hover:bg-stone-50 dark:border-white/5 dark:hover:bg-white/5"
                    >
                      <span className="text-sm font-bold text-charcoal dark:text-white">{city.label}</span>
                      <span className="text-[11px] font-bold text-stone-500">UGC</span>
                    </button>
                  ))}
                </div>
              )}
              {loading && (
                <p className="flex items-center gap-2 text-xs font-bold text-stone-500">
                  <Loader2 size={14} className="animate-spin" /> {t('cinemas.searching')}
                </p>
              )}
              {options.length > 0 && (
                <div className="space-y-1.5">
                  {options.map((option) => {
                    const followed = cinemas.some((c) => c.id === option.id);
                    return (
                      <button
                        key={option.id}
                        onClick={() => add(option)}
                        disabled={followed}
                        className="flex min-h-[48px] w-full items-center gap-2.5 rounded-[14px] border border-stone-200 bg-white px-3.5 text-left transition active:scale-[0.99] disabled:active:scale-100 dark:border-white/10 dark:bg-[#191919]"
                      >
                        <span className="min-w-0 flex-1 text-[13px] font-bold text-charcoal dark:text-white">{option.name}</span>
                        {followed ? (
                          <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-forest dark:text-bitter-lime">
                            <Check size={12} /> {t('cinemas.followed')}
                          </span>
                        ) : (
                          <Plus size={16} strokeWidth={2.6} className="text-charcoal dark:text-white" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {error && <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">{error}</p>}
            </div>
          )}

          <p className="text-[11px] font-semibold leading-relaxed text-stone-500 dark:text-stone-400">{t('cinemas.footnote')}</p>
        </div>
      </section>
    </div>
  );
};

export default FavoriteCinemasModal;
