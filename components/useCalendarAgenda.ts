import { useCallback, useEffect, useMemo, useState } from 'react';
import { CinemaScreening, Movie } from '../types';
import { loadCalendarSessions } from '../services/calendarAgenda';
import { fetchLocalReleaseDate, getTheatreReleases, TheatreRelease } from '../services/tmdb';
import {
  AgendaEvent,
  calendarDay,
  calendarHistory,
  majorCalendarReleases,
  mergeCalendarEvents,
} from '../utils/calendarAgenda';

export function useCalendarAgenda(
  movies: Movie[],
  profileId: string | undefined,
  language: string,
  today: string
) {
  const [screenings, setScreenings] = useState<CinemaScreening[]>([]);
  const [plans, setPlans] = useState<AgendaEvent[]>([]);
  const [releases, setReleases] = useState<TheatreRelease[]>([]);
  const [localDates, setLocalDates] = useState<Record<number, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);
  const wishesKey = movies
    .filter(
      (movie) =>
        movie.status === 'watchlist' &&
        movie.mediaType !== 'tv' &&
        movie.tmdbId &&
        movie.seasonNumber == null
    )
    .map((movie) => movie.tmdbId)
    .sort((a, b) => a! - b!)
    .join(',');

  useEffect(() => {
    let cancelled = false;
    setScreenings([]);
    setPlans([]);
    if (!profileId) return;
    void loadCalendarSessions(profileId)
      .then((result) => {
        if (!cancelled) {
          setScreenings(result.screenings);
          setPlans(result.events);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, revision]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void getTheatreReleases('FR', {
      horizonDays: 90,
      language: language === 'fr' ? 'fr-FR' : 'en-US',
    })
      .then((data) => {
        if (!cancelled)
          setReleases(majorCalendarReleases([...data.upcoming, ...data.thisWeek], today));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [language, today, revision]);

  useEffect(() => {
    let cancelled = false;
    const ids = wishesKey.split(',').filter(Boolean).map(Number);
    void (async () => {
      // Une grosse collection ne doit pas déclencher des centaines d'appels d'un coup.
      const dates: Record<number, string | null> = {};
      for (let start = 0; start < ids.length; start += 6) {
        if (cancelled) return;
        await Promise.all(
          ids.slice(start, start + 6).map(async (id) => {
            dates[id] = await fetchLocalReleaseDate(id, 'FR');
          })
        );
        if (!cancelled) setLocalDates({ ...dates });
      }
      if (!cancelled && !ids.length) setLocalDates({});
    })();
    return () => {
      cancelled = true;
    };
  }, [wishesKey, revision]);

  const history = useMemo(() => calendarHistory(movies), [movies]);
  const wishes = useMemo(
    () =>
      movies
        .filter(
          (movie) =>
            movie.status === 'watchlist' &&
            movie.mediaType !== 'tv' &&
            movie.tmdbId &&
            localDates[movie.tmdbId] &&
            localDates[movie.tmdbId]! >= today
        )
        .map(
          (movie): AgendaEvent => ({
            id: `wish:${movie.id}`,
            kind: 'watchlist-release',
            day: localDates[movie.tmdbId!]!,
            title: movie.title,
            posterUrl: movie.posterUrl,
            tmdbId: movie.tmdbId,
            movieId: movie.id,
          })
        )
        .sort((a, b) => a.day.localeCompare(b.day)),
    [movies, localDates, today]
  );
  const days = useMemo(() => {
    const byMovie = new Map(movies.map((movie) => [movie.id, movie]));
    const watched = history.map((watch): AgendaEvent => {
      const movie = byMovie.get(watch.movieId)!;
      return {
        id: watch.id,
        kind: 'watched',
        day: watch.day,
        movieId: watch.movieId,
        title: movie.title,
        posterUrl: movie.posterUrl,
        tmdbId: movie.tmdbId,
      };
    });
    const sessions = screenings
      .filter((screening) => screening.status !== 'completed' && screening.startsAt > Date.now())
      .map((screening): AgendaEvent => {
        const plan = plans.find((event) => event.planId === screening.planId);
        return {
          id: `screening:${screening.id}`,
          kind: 'screening',
          screeningId: screening.id,
          planId: screening.planId,
          day: calendarDay(screening.startsAt),
          startsAt: screening.startsAt,
          title: screening.title,
          posterUrl: screening.posterUrl,
          tmdbId: screening.tmdbId,
          cinemaName: screening.cinemaName,
          spaceName: plan?.spaceName,
          participants: plan?.participants,
          pending: screening.status === 'pending',
        };
      });
    const big = releases.map(
      (film): AgendaEvent => ({
        id: `release:${film.id}`,
        kind: 'release',
        day: film.releaseDate,
        title: film.title,
        posterUrl: film.posterPath
          ? `https://image.tmdb.org/t/p/w185${film.posterPath}`
          : undefined,
        tmdbId: film.id,
      })
    );
    return mergeCalendarEvents([...watched, ...sessions, ...plans, ...wishes, ...big]);
  }, [history, movies, screenings, plans, wishes, releases]);
  return { history, wishes, days, screenings, releases, loading, error, refresh };
}
