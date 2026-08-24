import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, Loader2, MapPin, Trash2, X } from 'lucide-react';
import { FavoriteCinema } from '../types';
import { CinemaCity, CinemaOption, searchCinemaCities, searchCinemasNearCity } from '../services/cinemaDirectory';
import { useDialog } from '../utils/useDialog';

interface FavoriteCinemaModalProps {
  existing?: FavoriteCinema;
  onSave: (cinema: FavoriteCinema) => void;
  onRemove: () => void;
  onClose: () => void;
}

const fieldClass =
  'h-12 w-full appearance-none rounded-2xl border border-stone-200 bg-white px-4 text-sm font-semibold text-charcoal outline-none transition focus:border-bitter-lime focus:ring-4 focus:ring-bitter-lime/10 dark:border-white/10 dark:bg-[#191919] dark:text-white';

const labelClass = 'mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-stone-400';

/**
 * Choix du cinéma favori, repris tel quel du parcours déjà éprouvé de
 * `CinemaScreeningComposer` : ville d'abord, puis établissement UGC. L'annuaire
 * est le même (`cinema-directory`), donc les identifiants aussi — c'est celui-là
 * que la fiche film enverra pour demander les horaires.
 */
const FavoriteCinemaModal: React.FC<FavoriteCinemaModalProps> = ({ existing, onSave, onRemove, onClose }) => {
  const dialog = useDialog(onClose, 'Ton cinéma favori');
  const [cityQuery, setCityQuery] = useState(existing?.city ?? '');
  const [cityResults, setCityResults] = useState<CinemaCity[]>([]);
  const [selectedCity, setSelectedCity] = useState<CinemaCity | null>(null);
  const [cinemas, setCinemas] = useState<CinemaOption[]>([]);
  const [selectedCinemaId, setSelectedCinemaId] = useState(existing?.id ?? '');
  const [isCinemaLoading, setIsCinemaLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState('');

  const selectedCinema = cinemas.find((cinema) => cinema.id === selectedCinemaId);

  useEffect(() => {
    const query = cityQuery.trim();
    if (query.length < 2 || selectedCity?.label === cityQuery) {
      setCityResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchCinemaCities(query).then((result) => {
        setCityResults(result.data);
        setDirectoryError(result.error || '');
      });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [cityQuery, selectedCity?.label]);

  const chooseCity = async (city: CinemaCity) => {
    setSelectedCity(city);
    setCityQuery(city.label);
    setCityResults([]);
    setCinemas([]);
    setSelectedCinemaId('');
    setDirectoryError('');
    setIsCinemaLoading(true);
    try {
      const result = await searchCinemasNearCity(city);
      setCinemas(result.data);
      // Une ville à un seul UGC ne mérite pas un choix : on le présélectionne.
      setSelectedCinemaId(result.data.length === 1 ? result.data[0].id : '');
      setDirectoryError(result.error || (result.data.length === 0 ? 'Aucun cinéma UGC dans cette ville.' : ''));
    } catch (error) {
      console.warn('[Cinémas] Sélection de ville interrompue', error);
      setDirectoryError('Impossible de charger les cinémas UGC de cette ville.');
    } finally {
      setIsCinemaLoading(false);
    }
  };

  const save = () => {
    if (!selectedCinema || !selectedCity) return;
    onSave({ id: selectedCinema.id, name: selectedCinema.name, city: selectedCity.label });
    onClose();
  };

  return (
    <div {...dialog.props} className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
      <button className="absolute inset-0 bg-charcoal/70 backdrop-blur-md" onClick={onClose} aria-label="Fermer" />
      <section className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-[#f7f4ee] shadow-2xl dark:bg-[#111] sm:rounded-[2rem]">
        <header className="flex items-start justify-between border-b border-stone-200/80 px-6 pb-5 pt-6 dark:border-white/10">
          <div>
            <div className="mb-2 flex items-center gap-2 text-bitter-lime">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-bitter-lime/15">
                <MapPin size={14} />
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.18em]">The Bitter · cinéma</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-charcoal dark:text-white">Ton cinéma favori</h2>
            <p className="mt-1 text-xs font-medium text-stone-500 dark:text-stone-400">
              Les fiches films t’y montreront directement les séances à venir.
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full bg-white text-stone-500 dark:text-stone-400 shadow-sm transition hover:text-charcoal dark:bg-white/10 dark:hover:text-white"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </header>

        <div className="space-y-6 overflow-y-auto px-6 py-6">
          {existing && (
            <div className="flex items-center gap-3 rounded-2xl border border-bitter-lime/30 bg-bitter-lime/10 px-4 py-3">
              <Check size={15} className="shrink-0 text-bitter-lime" />
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-charcoal dark:text-white">{existing.name}</p>
                <p className="truncate text-[11px] font-bold text-stone-500 dark:text-stone-400">{existing.city}</p>
              </div>
            </div>
          )}

          <section>
            <label className={labelClass}>Ville</label>
            <div className="relative">
              <MapPin size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                value={cityQuery}
                onChange={(event) => {
                  setCityQuery(event.target.value);
                  setSelectedCity(null);
                  setSelectedCinemaId('');
                  setCinemas([]);
                  setDirectoryError('');
                }}
                placeholder="Ville UGC (Lyon, Paris…)"
                className={`${fieldClass} pl-11`}
              />
            </div>
            {cityResults.length > 0 && (
              <div className="mt-2 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#191919]">
                {cityResults.map((city) => (
                  <button
                    key={city.id}
                    onClick={() => void chooseCity(city)}
                    className="flex w-full items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 text-left last:border-0 hover:bg-stone-50 dark:border-white/5 dark:hover:bg-white/5"
                  >
                    <span className="text-sm font-bold text-charcoal dark:text-white">{city.label}</span>
                    <span className="text-[11px] font-bold text-stone-400">UGC</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {selectedCity && (
            <section>
              <label className={labelClass}>Cinéma</label>
              <div className="relative">
                <select
                  value={selectedCinemaId}
                  onChange={(event) => setSelectedCinemaId(event.target.value)}
                  disabled={isCinemaLoading}
                  className={`${fieldClass} pr-9 disabled:opacity-60`}
                  aria-label="Choisir un cinéma UGC"
                >
                  <option value="">
                    {isCinemaLoading ? 'Recherche des UGC…' : cinemas.length ? 'Choisir un UGC' : 'Aucun UGC trouvé'}
                  </option>
                  {cinemas.map((cinema) => (
                    <option key={cinema.id} value={cinema.id}>
                      {cinema.name}
                    </option>
                  ))}
                </select>
                {isCinemaLoading ? (
                  <Loader2 size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-bitter-lime" />
                ) : (
                  <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-stone-400" />
                )}
              </div>
            </section>
          )}

          {directoryError && (
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{directoryError}</p>
          )}

          <button
            onClick={save}
            disabled={!selectedCinema}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-charcoal text-[11px] font-black uppercase tracking-[0.15em] text-white transition hover:scale-[1.01] disabled:opacity-40 dark:bg-bitter-lime dark:text-charcoal"
          >
            <Check size={17} />
            {existing ? 'Changer de cinéma' : 'Choisir ce cinéma'}
          </button>

          {existing && (
            <button
              onClick={() => {
                onRemove();
                onClose();
              }}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 text-[11px] font-black uppercase tracking-[0.15em] text-stone-500 dark:text-stone-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-white/10 dark:hover:border-red-500/30 dark:hover:bg-red-500/10 dark:hover:text-red-300"
            >
              <Trash2 size={15} /> Retirer mon cinéma favori
            </button>
          )}
        </div>
      </section>
    </div>
  );
};

export default FavoriteCinemaModal;
