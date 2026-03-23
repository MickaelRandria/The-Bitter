import React, { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { Movie } from '../types';
import {
  AppNotification,
  computeNotifications,
  markAsRead,
  markAllAsRead,
  getNotificationPrefs,
} from '../utils/notifications';

interface NotificationCenterProps {
  movies: Movie[];
}

const typeIcon: Record<AppNotification['type'], string> = {
  streak: '🔥',
  weekly: '📅',
  unrated: '🎬',
  monthly: '📊',
};

const NotificationCenter: React.FC<NotificationCenterProps> = ({ movies }) => {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNotifications(computeNotifications(movies, getNotificationPrefs()));
  }, [movies]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkOne = (id: string) => {
    markAsRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const handleMarkAll = () => {
    markAllAsRead(notifications.map((n) => n.id));
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const requestBrowserPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-full text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-bitter-lime text-stone-900 text-[10px] font-black rounded-full flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 dark:border-stone-800">
            <span className="font-bold text-stone-900 dark:text-stone-100 text-sm">
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAll}
                className="text-xs text-stone-400 hover:text-bitter-lime transition-colors font-medium"
              >
                Tout marquer lu
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-stone-400 dark:text-stone-500 text-sm">
                Aucune notification pour le moment.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleMarkOne(n.id)}
                  className={`flex gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-stone-50 dark:hover:bg-stone-800 ${
                    !n.read ? 'bg-lime-50 dark:bg-stone-800/60' : ''
                  }`}
                >
                  <span className="text-2xl leading-none mt-0.5">{typeIcon[n.type]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`text-sm font-semibold leading-tight ${
                          !n.read
                            ? 'text-stone-900 dark:text-stone-100'
                            : 'text-stone-600 dark:text-stone-400'
                        }`}
                      >
                        {n.title}
                      </p>
                      {!n.read && (
                        <span className="shrink-0 w-2 h-2 rounded-full bg-bitter-lime mt-1" />
                      )}
                    </div>
                    <p className="text-xs text-stone-500 dark:text-stone-500 mt-0.5 leading-snug">
                      {n.body}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {'Notification' in window && Notification.permission === 'default' && (
            <div className="px-4 py-3 border-t border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50">
              <button
                onClick={requestBrowserPermission}
                className="text-xs text-stone-500 dark:text-stone-400 hover:text-bitter-lime transition-colors"
              >
                🔔 Activer les notifications navigateur
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
