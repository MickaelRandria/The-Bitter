import { Movie } from '../types';

export type NotificationType = 'streak' | 'weekly' | 'unrated' | 'monthly';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
}

export interface NotificationPrefs {
  streak: boolean;
  weekly: boolean;
  unrated: boolean;
  monthly: boolean;
}

const STORAGE_KEY = 'bitter_notifications_read';
const PREFS_KEY = 'bitter_notification_prefs';

const DEFAULT_PREFS: NotificationPrefs = { streak: true, weekly: true, unrated: true, monthly: true };

export function getNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_PREFS };
}

export function saveNotificationPrefs(prefs: NotificationPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function getReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function markAsRead(id: string): void {
  const ids = getReadIds();
  ids.add(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export function markAllAsRead(ids: string[]): void {
  const existing = getReadIds();
  ids.forEach((id) => existing.add(id));
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing]));
}

export function sendTestNotification(movies: Movie[]): void {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const count = movies.filter(
    (m) => m.status === 'watched' && (m.dateWatched || 0) >= sevenDaysAgo
  ).length;
  const body = `Cette semaine : ${count} film${count !== 1 ? 's' : ''} vu${count !== 1 ? 's' : ''}. ${count > 0 ? 'Continue sur ta lancée !' : 'Temps de regarder quelque chose !'}`;

  const fire = () =>
    new Notification('Récap de la semaine 🎬', { body, icon: '/pwa-192x192.png', badge: '/pwa-192x192.png' });

  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    fire();
  } else if (Notification.permission === 'default') {
    Notification.requestPermission().then((p) => {
      if (p === 'granted') fire();
    });
  }
}

export function computeNotifications(movies: Movie[], prefs?: NotificationPrefs): AppNotification[] {
  const effectivePrefs = prefs ?? getNotificationPrefs();
  const readIds = getReadIds();
  const watched = movies.filter((m) => m.status === 'watched');
  const now = Date.now();
  const notifications: AppNotification[] = [];

  // 🔥 Streak
  if (effectivePrefs.streak) {
    const watchedDays = [
      ...new Set(
        watched
          .filter((m) => m.dateWatched)
          .map((m) => {
            const d = new Date(m.dateWatched!);
            return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          })
      ),
    ].sort();

    let streak = 1;
    let maxStreak = 1;
    for (let i = 1; i < watchedDays.length; i++) {
      const prev = new Date(watchedDays[i - 1].replace(/-/g, '/'));
      const curr = new Date(watchedDays[i].replace(/-/g, '/'));
      const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        streak++;
        maxStreak = Math.max(maxStreak, streak);
      } else {
        streak = 1;
      }
    }

    const todayStr = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })();
    const yesterdayStr = (() => {
      const d = new Date(now - 86400000);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })();
    const lastDay = watchedDays[watchedDays.length - 1];
    const isActiveStreak = lastDay === todayStr || lastDay === yesterdayStr;

    if (isActiveStreak && maxStreak >= 3) {
      const id = `streak-${maxStreak}`;
      notifications.push({
        id,
        type: 'streak',
        title: `🔥 ${maxStreak} jours de suite !`,
        body: `Tu regardes des films depuis ${maxStreak} jours consécutifs. Continue !`,
        createdAt: now,
        read: readIds.has(id),
      });
    }
  }

  // 📅 Weekly recap
  if (effectivePrefs.weekly) {
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const recentMovies = watched.filter((m) => (m.dateWatched || 0) >= sevenDaysAgo);
    if (recentMovies.length > 0) {
      const avgRating =
        recentMovies.reduce((sum, m) => {
          const avg =
            (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4;
          return sum + avg;
        }, 0) / recentMovies.length;

      const id = `weekly-${new Date().toISOString().slice(0, 10)}`;
      notifications.push({
        id,
        type: 'weekly',
        title: `📅 ${recentMovies.length} film${recentMovies.length > 1 ? 's' : ''} cette semaine`,
        body: `Note moyenne : ${avgRating.toFixed(1)}/10. ${recentMovies.length > 1 ? 'Belle semaine cinéma !' : 'Continue sur ta lancée !'}`,
        createdAt: now - 1000,
        read: readIds.has(id),
      });
    }
  }

  // 🎬 Unrated reminder
  if (effectivePrefs.unrated) {
    const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
    const unrated = movies.filter(
      (m) => m.status === 'watchlist' && m.dateAdded <= threeDaysAgo
    );
    if (unrated.length > 0) {
      const id = `unrated-${unrated.length}`;
      notifications.push({
        id,
        type: 'unrated',
        title: `🎬 ${unrated.length} film${unrated.length > 1 ? 's' : ''} en attente`,
        body:
          unrated.length === 1
            ? `"${unrated[0].title}" attend ta note depuis quelques jours.`
            : `Dont "${unrated[0].title}" et ${unrated.length - 1} autre${unrated.length > 2 ? 's' : ''}.`,
        createdAt: now - 2000,
        read: readIds.has(id),
      });
    }
  }

  // 📊 Monthly stats
  if (effectivePrefs.monthly) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const thisMonth = watched.filter((m) => (m.dateWatched || 0) >= startOfMonth.getTime());
    if (thisMonth.length >= 5) {
      const monthName = new Date().toLocaleDateString('fr-FR', { month: 'long' });
      const id = `monthly-${new Date().toISOString().slice(0, 7)}`;
      notifications.push({
        id,
        type: 'monthly',
        title: `📊 ${thisMonth.length} films en ${monthName}`,
        body: `Tu es en bonne forme ce mois-ci ! Total dans ta collection : ${watched.length} films vus.`,
        createdAt: now - 3000,
        read: readIds.has(id),
      });
    }
  }

  return notifications;
}
