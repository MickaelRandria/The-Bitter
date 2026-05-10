import React, { useState } from 'react';
import {
  RotateCw,
  X,
  Star,
  TrendingUp,
  Target,
  TrendingDown,
  ThumbsDown,
  Search,
  Sparkles,
} from 'lucide-react';
import { Movie, MovieWatch, RewatchSentiment } from '../types';

const SENTIMENTS: {
  id: RewatchSentiment;
  label: string;
  icon: React.ElementType;
}[] = [
  { id: 'better', label: "C'était mieux", icon: TrendingUp },
  { id: 'same', label: 'Toujours aussi bien', icon: Target },
  { id: 'worse', label: "C'était moyen", icon: TrendingDown },
  { id: 'disappointed', label: 'Décevant', icon: ThumbsDown },
  { id: 'discovered', label: "J'ai découvert des détails", icon: Search },
  { id: 'nostalgic', label: 'Nostalgie', icon: Sparkles },
];

const SENTIMENT_BASE =
  'bg-stone-50 dark:bg-[#202020] text-stone-600 dark:text-stone-400 border-stone-200 dark:border-white/10';
const SENTIMENT_ACTIVE =
  'bg-forest/10 dark:bg-bitter-lime/10 text-forest dark:text-bitter-lime border-forest dark:border-bitter-lime';

interface RewatchModalProps {
  movie: Movie;
  onClose: () => void;
  onSave: (watch: MovieWatch) => void;
}

const CRITERIA = [
  { key: 'story' as const, label: 'Écriture' },
  { key: 'visuals' as const, label: 'Esthétique' },
  { key: 'acting' as const, label: 'Interprétation' },
  { key: 'sound' as const, label: 'Univers Sonore' },
];

const RewatchModal: React.FC<RewatchModalProps> = ({ movie, onClose, onSave }) => {
  const lastWatch = movie.watches?.[movie.watches.length - 1];
  const lastRatings = lastWatch?.ratings ?? movie.ratings;
  const lastAvg =
    (lastRatings.story + lastRatings.visuals + lastRatings.acting + lastRatings.sound) / 4;
  const lastDate = lastWatch?.watched_at
    ? new Date(lastWatch.watched_at)
    : movie.dateWatched
      ? new Date(movie.dateWatched)
      : new Date(movie.dateAdded);

  const [ratings, setRatings] = useState({ ...lastRatings });
  const [sentiment, setSentiment] = useState<RewatchSentiment | null>(null);
  const [review, setReview] = useState('');

  const currentAvg = (ratings.story + ratings.visuals + ratings.acting + ratings.sound) / 4;
  const globalDiff = currentAvg - lastAvg;
  const watchNumber = (movie.watch_count ?? 1) + 1;

  const handleSave = () => {
    if (!sentiment) return;
    const watch: MovieWatch = {
      id: crypto.randomUUID(),
      watch_number: watchNumber,
      watched_at: new Date().toISOString(),
      ratings: {
        story: Math.round(ratings.story * 2) / 2,
        visuals: Math.round(ratings.visuals * 2) / 2,
        acting: Math.round(ratings.acting * 2) / 2,
        sound: Math.round(ratings.sound * 2) / 2,
      },
      review: review.trim() || undefined,
      sentiment,
    };
    onSave(watch);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1a1a1a] w-full sm:max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl max-h-[92vh] overflow-y-auto border border-sand dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-[#1a1a1a] border-b border-sand dark:border-white/10 p-6 flex items-center justify-between z-10 rounded-t-[2.5rem] sm:rounded-t-[2.5rem]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-forest/10 dark:bg-bitter-lime/10 rounded-full flex items-center justify-center">
              <RotateCw size={18} strokeWidth={2.5} className="text-forest dark:text-bitter-lime" />
            </div>
            <div>
              <h2 className="font-black text-base text-charcoal dark:text-white leading-tight">
                Rewatch #{watchNumber - 1}
              </h2>
              <p className="text-[11px] text-stone-400 dark:text-stone-600 font-medium truncate max-w-[180px]">
                {movie.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center hover:bg-stone-200 dark:hover:bg-[#303030] transition-all active:scale-90"
          >
            <X size={18} strokeWidth={2.5} className="text-charcoal dark:text-white" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Dernière vision */}
          <div className="bg-stone-50 dark:bg-[#202020] p-4 rounded-2xl border border-stone-200 dark:border-white/10">
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 mb-2">
              Dernière vision
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Star size={14} fill="#D9FF00" className="text-bitter-lime" />
                <span className="font-black text-base text-charcoal dark:text-white">
                  {lastAvg.toFixed(1)}
                </span>
              </div>
              <span className="text-[11px] text-stone-400 dark:text-stone-600 font-medium">
                {lastDate.toLocaleDateString('fr-FR', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>
          </div>

          {/* Sentiments */}
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-charcoal dark:text-white mb-3">
              Par rapport à la dernière fois ?
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {SENTIMENTS.map((s) => {
                const Icon = s.icon;
                const isSelected = sentiment === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSentiment(s.id)}
                    className={`p-3 rounded-2xl border-2 transition-all text-left active:scale-[0.98] hover:scale-[1.01] ${
                      isSelected ? SENTIMENT_ACTIVE : SENTIMENT_BASE
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={16} strokeWidth={2.5} />
                      <span className="font-bold text-[11px] leading-tight">{s.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notation */}
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-charcoal dark:text-white mb-3">
              Nouvelle notation
            </h3>
            <div className="space-y-4">
              {CRITERIA.map(({ key, label }) => {
                const criterionDiff = ratings[key] - lastRatings[key];
                return (
                  <div key={key}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600">
                        {label}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black text-charcoal dark:text-white">
                          {ratings[key].toFixed(1)}
                        </span>
                        {Math.abs(criterionDiff) >= 0.05 && (
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                              criterionDiff > 0
                                ? 'bg-forest/15 text-forest dark:bg-bitter-lime/15 dark:text-bitter-lime'
                                : 'bg-stone-200 dark:bg-white/10 text-stone-500 dark:text-stone-400'
                            }`}
                          >
                            {criterionDiff > 0 ? '+' : ''}
                            {criterionDiff.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.5"
                      value={ratings[key]}
                      onChange={(e) =>
                        setRatings((prev) => ({ ...prev, [key]: parseFloat(e.target.value) }))
                      }
                      className="w-full accent-forest dark:accent-bitter-lime"
                    />
                  </div>
                );
              })}
            </div>

            {/* Moyenne globale en temps réel */}
            <div className="mt-4 p-3 bg-forest/10 dark:bg-bitter-lime/10 rounded-2xl border border-forest/20 dark:border-bitter-lime/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-forest dark:text-bitter-lime">
                  Moyenne actuelle
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black text-forest dark:text-bitter-lime">
                    {currentAvg.toFixed(1)}
                  </span>
                  {Math.abs(globalDiff) >= 0.05 && (
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        globalDiff > 0
                          ? 'bg-forest/15 text-forest dark:bg-bitter-lime/15 dark:text-bitter-lime'
                          : 'bg-stone-200 dark:bg-white/10 text-stone-500 dark:text-stone-400'
                      }`}
                    >
                      {globalDiff > 0 ? '+' : ''}
                      {globalDiff.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Review optionnelle */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 mb-2">
              Notes (optionnel)
            </label>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Qu'as-tu remarqué de nouveau ?"
              className="w-full p-3 bg-stone-50 dark:bg-[#202020] border border-stone-200 dark:border-white/10 rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-forest dark:focus:ring-bitter-lime transition-all text-charcoal dark:text-white placeholder:text-stone-300 dark:placeholder:text-stone-700"
              rows={3}
            />
          </div>

          {/* Bouton sauvegarder */}
          <button
            onClick={handleSave}
            disabled={!sentiment}
            className="w-full py-4 bg-forest hover:bg-forest/90 dark:hover:bg-bitter-lime dark:hover:text-charcoal text-white rounded-[2rem] font-black text-[11px] uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            Enregistrer ce rewatch
          </button>
        </div>
      </div>
    </div>
  );
};

export default RewatchModal;
