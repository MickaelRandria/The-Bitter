import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import {
  X, CheckCircle, XCircle, Loader2,
  Star, MessageSquare, Download, Archive,
  Settings, ArrowRight, FileText, Layers,
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { searchMovieForImport } from '../services/tmdb';
import { Movie, MovieFormData } from '../types';

interface Props {
  userId: string;
  onImportMovies: (movies: Movie[]) => void;
  onClose: () => void;
}

interface MergedRow {
  Name: string;
  Year: string;
  Date: string;
  'Letterboxd URI': string;
  Rating: string;
  Review: string;
  'Watched Date': string;
  Rewatch: string;
}

interface DetectedFile {
  name: string;
  type: 'watched' | 'ratings' | 'reviews' | 'unknown';
  count: number;
  ratingCount: number;
  reviewCount: number;
}

interface ImportResult {
  title: string;
  year: string;
  success: boolean;
  reason?: string;
}

function detectFileType(rows: Record<string, string>[]): DetectedFile['type'] {
  if (!rows.length) return 'unknown';
  const cols = Object.keys(rows[0]);
  if (cols.includes('Review')) return 'reviews';
  if (cols.includes('Rating') && cols.includes('Name')) return 'ratings';
  if (cols.includes('Name')) return 'watched';
  return 'unknown';
}

function mergeFiles(
  parsedFiles: { rows: Record<string, string>[]; type: DetectedFile['type'] }[]
): MergedRow[] {
  const map = new Map<string, MergedRow>();
  for (const { rows } of parsedFiles) {
    for (const row of rows) {
      const key = row['Letterboxd URI']?.trim() || `${row.Name?.trim()}::${row.Year?.trim()}`;
      if (!key || !row.Name?.trim()) continue;
      const existing = map.get(key);
      if (existing) {
        if (!existing.Rating && row.Rating) existing.Rating = row.Rating;
        if (!existing.Review && row.Review) existing.Review = row.Review;
        if (!existing.Date && row.Date) existing.Date = row.Date;
      } else {
        map.set(key, {
          Name: row.Name?.trim() || '',
          Year: row.Year?.trim() || '',
          Date: row.Date?.trim() || '',
          'Letterboxd URI': row['Letterboxd URI']?.trim() || '',
          Rating: row.Rating?.trim() || '',
          Review: row.Review?.trim() || '',
          'Watched Date': row['Watched Date']?.trim() || '',
          Rewatch: row.Rewatch?.trim() || '',
        });
      }
    }
  }
  return Array.from(map.values()).filter(r => r.Name);
}

function delay(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

function convertRating(letterboxdRating: string): number | null {
  const v = parseFloat(letterboxdRating);
  if (!letterboxdRating || isNaN(v) || v <= 0) return null;
  return Math.round(v * 2);
}

function buildSupabaseRow(
  userId: string,
  data: MovieFormData,
  row: MergedRow,
  rating: number | null
) {
  const watchedDateStr = row['Watched Date'] || row.Date;
  const dateWatched = watchedDateStr ? new Date(watchedDateStr).toISOString() : null;
  return {
    profile_id: userId,
    tmdb_id: data.tmdbId ?? null,
    title: data.title,
    director: data.director,
    director_id: data.directorId ?? null,
    actors: data.actors || null,
    actor_ids: data.actorIds ? JSON.stringify(data.actorIds) : null,
    year: data.year,
    release_date: data.releaseDate || null,
    runtime: data.runtime || null,
    genre: data.genre,
    poster_url: data.posterUrl || null,
    tmdb_rating: data.tmdbRating || null,
    status: 'watched',
    date_watched: dateWatched,
    theme: 'black',
    tags: [],
    media_type: 'movie',
    story: rating,
    visuals: rating,
    acting: rating,
    sound: rating,
    review: row.Review || null,
    created_at: new Date().toISOString(),
    rated_at: dateWatched,
  };
}

function buildMovieObject(
  data: MovieFormData,
  row: MergedRow,
  rating: number | null
): Movie {
  const r = rating ?? 0;
  return {
    id: crypto.randomUUID(),
    tmdbId: data.tmdbId,
    title: data.title,
    director: data.director,
    directorId: data.directorId,
    actors: data.actors || '',
    actorIds: data.actorIds || [],
    year: data.year,
    releaseDate: data.releaseDate || '',
    runtime: data.runtime || 0,
    genre: data.genre,
    ratings: { story: r, visuals: r, acting: r, sound: r },
    review: data.review || '',
    comment: row.Review || undefined,
    status: 'watched',
    theme: 'black',
    posterUrl: data.posterUrl || '',
    dateAdded: Date.now(),
    dateWatched: (row['Watched Date'] || row.Date) ? new Date(row['Watched Date'] || row.Date).getTime() : Date.now(),
    tmdbRating: data.tmdbRating || 0,
    rewatch: false,
    tags: [],
    smartphoneFactor: 0,
    hype: 5,
    mediaType: 'movie',
  };
}

// ─── Tutorial steps ───────────────────────────────────────────────────────────
const TUTORIAL_STEPS = [
  {
    icon: Settings,
    color: 'bg-stone-100 dark:bg-[#252525] text-charcoal dark:text-white',
    title: 'Letterboxd → Settings',
    desc: 'Connecte-toi sur letterboxd.com et ouvre les paramètres de ton compte.',
  },
  {
    icon: Archive,
    color: 'bg-stone-100 dark:bg-[#252525] text-charcoal dark:text-white',
    title: 'Data → Export your data',
    desc: 'Dans la section "Data", clique sur "Export your data" pour générer l\'archive.',
  },
  {
    icon: Download,
    color: 'bg-forest/10 dark:bg-lime-400/10 text-forest dark:text-lime-400',
    title: 'Télécharge l\'archive ZIP',
    desc: 'Letterboxd génère un fichier ZIP contenant tous tes fichiers CSV.',
  },
  {
    icon: Layers,
    color: 'bg-[#00d735]/10 text-[#00a828]',
    title: 'Extrais et dépose ici',
    desc: 'Extrais le ZIP et dépose les fichiers CSV directement dans The Bitter.',
  },
];

// ─── File explanations ────────────────────────────────────────────────────────
const FILE_CARDS = [
  {
    file: 'ratings.csv',
    icon: Star,
    badge: 'Requis',
    badgeClass: 'bg-forest/10 dark:bg-lime-400/10 text-forest dark:text-lime-400',
    iconBg: 'bg-amber-50 dark:bg-amber-900/20',
    iconColor: 'text-amber-500',
    title: 'Tous tes films notés',
    desc: 'La liste complète de tes films avec leur note (convertie en /10 dans The Bitter).',
  },
  {
    file: 'reviews.csv',
    icon: MessageSquare,
    badge: 'Optionnel',
    badgeClass: 'bg-stone-100 dark:bg-[#252525] text-stone-500 dark:text-stone-400',
    iconBg: 'bg-forest/10 dark:bg-lime-400/10',
    iconColor: 'text-forest dark:text-lime-400',
    title: 'Tes critiques rédigées',
    desc: 'Ajoute ce fichier pour importer le texte de tes avis dans "Mon avis" sur chaque film.',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────
function LetterboxdImport({ userId, onImportMovies, onClose }: Props) {
  const [phase, setPhase] = useState<'upload' | 'preview' | 'processing' | 'done'>('upload');
  const [uploadTab, setUploadTab] = useState<'tuto' | 'files'>('tuto');
  const [mergedRows, setMergedRows] = useState<MergedRow[]>([]);
  const [detectedFiles, setDetectedFiles] = useState<DetectedFile[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<ImportResult[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setParseError(null);
    const pending: { rows: Record<string, string>[]; name: string; type: DetectedFile['type'] }[] = [];
    let parsed = 0;

    Array.from(files).forEach(file => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: ({ data }) => {
          const type = detectFileType(data);
          pending.push({ rows: data, name: file.name, type });
          parsed++;
          if (parsed === files.length) {
            const validFiles = pending.filter(f => f.type !== 'unknown');
            if (!validFiles.length) {
              setParseError('Aucun fichier reconnu. Dépose ratings.csv (et optionnellement reviews.csv) depuis ton export Letterboxd.');
              return;
            }
            const merged = mergeFiles(validFiles);
            if (!merged.length) {
              setParseError('Aucun film trouvé dans ces fichiers.');
              return;
            }
            setDetectedFiles(pending.map(f => ({
              name: f.name,
              type: f.type,
              count: f.rows.filter(r => r.Name?.trim()).length,
              ratingCount: f.rows.filter(r => r.Rating?.trim()).length,
              reviewCount: f.rows.filter(r => r.Review?.trim()).length,
            })));
            setMergedRows(merged);
            setPhase('preview');
          }
        },
        error: () => setParseError(`Impossible de lire ${file.name}.`),
      });
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const runImport = async () => {
    setPhase('processing');
    setProgress({ current: 0, total: mergedRows.length });
    const successMovies: Movie[] = [];
    const supabaseRows: ReturnType<typeof buildSupabaseRow>[] = [];
    const importResults: ImportResult[] = [];

    for (let i = 0; i < mergedRows.length; i++) {
      const row = mergedRows[i];
      setProgress({ current: i + 1, total: mergedRows.length });
      try {
        const tmdbData = await searchMovieForImport(row.Name, row.Year);
        if (!tmdbData || !tmdbData.tmdbId) {
          importResults.push({ title: row.Name, year: row.Year, success: false, reason: 'Non trouvé sur TMDB' });
        } else {
          const rating = convertRating(row.Rating);
          successMovies.push(buildMovieObject(tmdbData, row, rating));
          supabaseRows.push(buildSupabaseRow(userId, tmdbData, row, rating));
          importResults.push({ title: row.Name, year: row.Year, success: true });
        }
      } catch {
        importResults.push({ title: row.Name, year: row.Year, success: false, reason: 'Erreur réseau' });
      }
      if (i < mergedRows.length - 1) await delay(600);
    }

    if (supabase && supabaseRows.length > 0) {
      try {
        const CHUNK = 50;
        for (let i = 0; i < supabaseRows.length; i += CHUNK) {
          await supabase.from('user_movies').upsert(supabaseRows.slice(i, i + CHUNK), {
            onConflict: 'profile_id,tmdb_id',
            ignoreDuplicates: false,
          });
        }
      } catch {
        // RLS block for guests — films still added to local state
      }
    }

    // Dedup within the batch — same film can't appear twice even if both CSV files had it
    const seenTmdbIds = new Set<number>();
    const dedupedMovies = successMovies.filter((m) => {
      if (!m.tmdbId) return true;
      if (seenTmdbIds.has(m.tmdbId)) return false;
      seenTmdbIds.add(m.tmdbId);
      return true;
    });

    setResults(importResults);
    setPhase('done');
    if (dedupedMovies.length > 0) onImportMovies(dedupedMovies);
  };

  const totalRatings = mergedRows.filter((r: MergedRow) => r.Rating).length;
  const totalReviews = mergedRows.filter((r: MergedRow) => r.Review).length;
  const successCount = results.filter((r: ImportResult) => r.success).length;
  const failCount = results.filter((r: ImportResult) => !r.success).length;
  const progressPct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div
        className="absolute inset-0 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm"
        onClick={phase === 'processing' ? undefined : onClose}
      />

      <div className="relative z-10 bg-cream dark:bg-[#0c0c0c] w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden border-t border-white/20">
        {/* Handle */}
        <div className="w-full flex justify-center pt-3 pb-1 bg-white dark:bg-[#1a1a1a]">
          <div className="w-12 h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-6 pb-4 border-b border-sand dark:border-white/5 flex items-center justify-between bg-white dark:bg-[#1a1a1a]">
          <div className="flex items-center gap-3">
            <img src="/icons/letterboxd.jpeg" alt="Letterboxd" className="w-8 h-8 rounded-lg shadow-sm" />
            <div>
              <h2 className="text-xl font-black tracking-tight text-charcoal dark:text-white leading-none">
                Import Letterboxd
              </h2>
              <p className="text-[10px] font-medium text-stone-400 dark:text-stone-500 mt-0.5">
                Films · Notes · Critiques
              </p>
            </div>
          </div>
          {phase !== 'processing' && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center active:scale-90 transition-transform text-stone-500 dark:text-stone-400"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar bg-cream dark:bg-[#0c0c0c]">

          {/* ── UPLOAD ─────────────────────────────────────────────────────── */}
          {phase === 'upload' && (
            <div className="p-5 space-y-4">

              {/* Drop zone */}
              <div
                className="border-2 border-dashed border-stone-200 dark:border-stone-700 rounded-[2rem] p-7 flex flex-col items-center gap-3 cursor-pointer hover:border-[#00d735]/60 transition-colors"
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
              >
                <img src="/icons/letterboxd.jpeg" alt="Letterboxd" className="w-12 h-12 rounded-2xl shadow-md" />
                <div className="text-center">
                  <p className="text-sm font-black text-charcoal dark:text-white mb-1">
                    Dépose tes fichiers Letterboxd ici
                  </p>
                  <p className="text-[11px] text-stone-400 dark:text-stone-500">
                    ratings.csv · reviews.csv
                  </p>
                </div>
                <button className="mt-1 px-5 py-2.5 bg-[#00d735] hover:bg-[#00c130] text-white rounded-xl font-black text-[11px] uppercase tracking-widest transition-colors flex items-center gap-2">
                  <FileText size={12} />
                  Choisir les fichiers
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                multiple
                className="hidden"
                onChange={e => handleFiles(e.target.files)}
              />

              {parseError && (
                <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-100 dark:border-red-900/20">
                  <XCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">{parseError}</p>
                </div>
              )}

              {/* ── Pill switcher ──────────────────────────────────────────── */}
              <div className="relative bg-stone-100 dark:bg-[#161616] p-1 rounded-full flex border border-stone-200/50 dark:border-white/5 shadow-inner">
                <div
                  className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white dark:bg-[#2a2a2a] rounded-full shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={{ transform: uploadTab === 'tuto' ? 'translateX(0)' : 'translateX(100%)' }}
                />
                <button
                  onClick={() => setUploadTab('tuto')}
                  className={`relative z-10 flex-1 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-colors duration-300 ${uploadTab === 'tuto' ? 'text-charcoal dark:text-white' : 'text-stone-400 dark:text-stone-600'}`}
                >
                  Comment faire
                </button>
                <button
                  onClick={() => setUploadTab('files')}
                  className={`relative z-10 flex-1 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-colors duration-300 ${uploadTab === 'files' ? 'text-charcoal dark:text-white' : 'text-stone-400 dark:text-stone-600'}`}
                >
                  Quoi déposer
                </button>
              </div>

              {/* ── Tab: Tutorial ──────────────────────────────────────────── */}
              {uploadTab === 'tuto' && (
                <div className="space-y-2 animate-[fadeIn_0.25s_ease-out]">
                  {TUTORIAL_STEPS.map((step, i) => {
                    const Icon = step.icon;
                    return (
                      <div key={i} className="flex items-start gap-3 bg-white dark:bg-[#1a1a1a] rounded-2xl p-4 border border-stone-100 dark:border-white/5">
                        <div className="flex flex-col items-center gap-1.5 shrink-0">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${step.color}`}>
                            <Icon size={16} strokeWidth={2} />
                          </div>
                          {i < TUTORIAL_STEPS.length - 1 && (
                            <div className="w-px h-4 bg-stone-100 dark:bg-white/10" />
                          )}
                        </div>
                        <div className="pt-1 flex-1">
                          <p className="text-xs font-black text-charcoal dark:text-white leading-none mb-1">
                            {step.title}
                          </p>
                          <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
                            {step.desc}
                          </p>
                        </div>
                        <span className="text-[10px] font-black text-stone-200 dark:text-stone-700 pt-1 shrink-0">
                          {i + 1}
                        </span>
                      </div>
                    );
                  })}

                  <button
                    onClick={() => setUploadTab('files')}
                    className="w-full flex items-center justify-center gap-2 py-3 text-[11px] font-black uppercase tracking-widest text-forest dark:text-lime-400 hover:opacity-80 transition-opacity"
                  >
                    Voir quels fichiers déposer <ArrowRight size={12} />
                  </button>
                </div>
              )}

              {/* ── Tab: Files explanation ─────────────────────────────────── */}
              {uploadTab === 'files' && (
                <div className="space-y-2 animate-[fadeIn_0.25s_ease-out]">
                  {FILE_CARDS.map((card, i) => {
                    const Icon = card.icon;
                    return (
                      <div key={i} className="flex items-start gap-3 bg-white dark:bg-[#1a1a1a] rounded-2xl p-4 border border-stone-100 dark:border-white/5">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${card.iconBg}`}>
                          <Icon size={16} strokeWidth={2} className={card.iconColor} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-xs font-black text-charcoal dark:text-white">
                              {card.file}
                            </p>
                            <span className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md ${card.badgeClass}`}>
                              {card.badge}
                            </span>
                          </div>
                          <p className="text-[10px] font-black text-stone-500 dark:text-stone-400 mb-0.5">
                            {card.title}
                          </p>
                          <p className="text-[10px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
                            {card.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex items-start gap-2.5 px-4 py-3 bg-stone-50 dark:bg-[#1a1a1a] rounded-2xl border border-stone-100 dark:border-white/5">
                    <div className="w-4 h-4 rounded-full bg-forest/20 dark:bg-lime-400/20 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle size={10} className="text-forest dark:text-lime-400" />
                    </div>
                    <p className="text-[10px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
                      Dépose les 2 fichiers en même temps — The Bitter les fusionne automatiquement. Aucun doublon possible.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PREVIEW ────────────────────────────────────────────────────── */}
          {phase === 'preview' && (
            <div className="p-5 space-y-4">
              {/* Detected files */}
              <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl border border-stone-100 dark:border-white/5 overflow-hidden divide-y divide-stone-100 dark:divide-white/5">
                {detectedFiles.map((f, i) => {
                  const card = FILE_CARDS.find(c => f.type === 'watched' ? c.file === 'watched.csv' : f.type === 'ratings' ? c.file === 'ratings.csv' : c.file === 'reviews.csv');
                  const Icon = card?.icon ?? FileText;
                  return (
                    <div key={i} className="px-4 py-3 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${card?.iconBg ?? 'bg-stone-100 dark:bg-[#252525]'}`}>
                        <Icon size={14} className={card?.iconColor ?? 'text-stone-500'} />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-black text-charcoal dark:text-white">{f.name}</p>
                        <p className="text-[10px] text-stone-400 dark:text-stone-500 font-medium">
                          {f.count} films
                          {f.ratingCount > 0 && ` · ${f.ratingCount} notes`}
                          {f.reviewCount > 0 && ` · ${f.reviewCount} critiques`}
                        </p>
                      </div>
                      <CheckCircle size={14} className="text-forest dark:text-lime-400 shrink-0" />
                    </div>
                  );
                })}
              </div>

              {/* Summary */}
              <div className="bg-[#00d735]/10 border border-[#00d735]/30 rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <img src="/icons/letterboxd.jpeg" alt="" className="w-9 h-9 rounded-xl shadow-sm" />
                  <div>
                    <p className="text-sm font-black text-charcoal dark:text-white">
                      {mergedRows.length} films à importer
                    </p>
                    <p className="text-[10px] text-stone-400 dark:text-stone-500">
                      Durée estimée : ~{Math.ceil(mergedRows.length * 0.6 / 60)} min
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className={`flex-1 px-3 py-2.5 rounded-xl text-center ${totalRatings > 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-stone-100/70 dark:bg-[#252525]'}`}>
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <Star size={11} className={totalRatings > 0 ? 'text-amber-500' : 'text-stone-300 dark:text-stone-600'} />
                      <p className="text-sm font-black text-charcoal dark:text-white">{totalRatings}</p>
                    </div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-stone-400 dark:text-stone-500">Notes</p>
                  </div>
                  <div className={`flex-1 px-3 py-2.5 rounded-xl text-center ${totalReviews > 0 ? 'bg-forest/10 dark:bg-lime-400/10' : 'bg-stone-100/70 dark:bg-[#252525]'}`}>
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <MessageSquare size={11} className={totalReviews > 0 ? 'text-forest dark:text-lime-400' : 'text-stone-300 dark:text-stone-600'} />
                      <p className="text-sm font-black text-charcoal dark:text-white">{totalReviews}</p>
                    </div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-stone-400 dark:text-stone-500">Critiques</p>
                  </div>
                </div>
              </div>

              {/* Preview list */}
              <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl border border-stone-100 dark:border-white/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100 dark:border-white/5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500">Aperçu</p>
                </div>
                <div className="divide-y divide-stone-100 dark:divide-white/5">
                  {mergedRows.slice(0, 5).map((r, i) => (
                    <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-charcoal dark:text-white truncate">{r.Name}</p>
                        <p className="text-[10px] text-stone-400 dark:text-stone-500">{r.Year}{r.Date ? ` · ${r.Date}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.Rating && (
                          <div className="flex items-center gap-0.5">
                            <Star size={10} className="text-amber-500" fill="currentColor" />
                            <span className="text-[10px] font-black text-stone-500 dark:text-stone-400">{r.Rating}</span>
                          </div>
                        )}
                        {r.Review && <MessageSquare size={11} className="text-forest dark:text-lime-400" />}
                      </div>
                    </div>
                  ))}
                  {mergedRows.length > 5 && (
                    <div className="px-4 py-3 text-center text-[10px] text-stone-400 dark:text-stone-500 font-medium">
                      + {mergedRows.length - 5} autres films
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={runImport}
                className="w-full py-4 bg-[#00d735] hover:bg-[#00c130] text-white rounded-2xl font-black text-sm uppercase tracking-wide active:scale-95 transition-all flex items-center justify-center gap-3 shadow-lg shadow-[#00d735]/20"
              >
                <img src="/icons/letterboxd.jpeg" alt="" className="w-5 h-5 rounded-md" />
                Lancer l'import
              </button>
              <button
                onClick={() => { setMergedRows([]); setDetectedFiles([]); setPhase('upload'); }}
                className="w-full py-3 text-xs font-black text-stone-400 dark:text-stone-500 uppercase tracking-wide"
              >
                Changer les fichiers
              </button>
            </div>
          )}

          {/* ── PROCESSING ─────────────────────────────────────────────────── */}
          {phase === 'processing' && (
            <div className="p-6 space-y-6">
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="relative w-16 h-16">
                  <img src="/icons/letterboxd.jpeg" alt="" className="w-16 h-16 rounded-2xl shadow-md" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white dark:bg-[#1a1a1a] rounded-full flex items-center justify-center shadow-sm">
                    <Loader2 size={14} className="text-[#00d735] animate-spin" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-base font-black text-charcoal dark:text-white">Import en cours…</p>
                  <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">
                    {progress.current} / {progress.total} films traités
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-wider">
                  <span>Progression</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="h-2.5 bg-stone-100 dark:bg-[#252525] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#00d735] rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              <p className="text-[11px] text-center text-stone-400 dark:text-stone-500 font-medium">
                Ne ferme pas cette fenêtre pendant l'import
              </p>
            </div>
          )}

          {/* ── DONE ───────────────────────────────────────────────────────── */}
          {phase === 'done' && (
            <div className="p-5 space-y-4">
              <div className={`rounded-2xl p-5 flex items-center gap-4 ${successCount > 0 ? 'bg-[#00d735]/10 border border-[#00d735]/30' : 'bg-stone-50 dark:bg-[#1a1a1a] border border-stone-100 dark:border-white/5'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${successCount > 0 ? 'bg-[#00d735]/20 text-[#00a828]' : 'bg-stone-100 dark:bg-[#252525] text-stone-400'}`}>
                  <CheckCircle size={20} />
                </div>
                <div>
                  <p className="text-base font-black text-charcoal dark:text-white">
                    {successCount} film{successCount !== 1 ? 's' : ''} importé{successCount !== 1 ? 's' : ''}
                  </p>
                  {failCount > 0 && (
                    <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5">
                      {failCount} non trouvé{failCount !== 1 ? 's' : ''} sur TMDB
                    </p>
                  )}
                </div>
              </div>

              {failCount > 0 && (
                <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl border border-stone-100 dark:border-white/5 overflow-hidden">
                  <div className="px-4 py-3 border-b border-stone-100 dark:border-white/5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500">Films non importés</p>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-stone-100 dark:divide-white/5 no-scrollbar">
                    {results.filter((r: ImportResult) => !r.success).map((r, i) => (
                      <div key={i} className="px-4 py-3 flex items-center gap-3">
                        <XCircle size={13} className="text-red-400 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-charcoal dark:text-stone-300">{r.title}</p>
                          <p className="text-[10px] text-stone-400 dark:text-stone-500">{r.year} · {r.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full py-4 bg-[#00d735] hover:bg-[#00c130] text-white rounded-2xl font-black text-sm uppercase tracking-wide active:scale-95 transition-all flex items-center justify-center gap-3 shadow-lg shadow-[#00d735]/20"
              >
                <img src="/icons/letterboxd.jpeg" alt="" className="w-5 h-5 rounded-md" />
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LetterboxdImport;
