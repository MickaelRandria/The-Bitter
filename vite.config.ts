import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    headers: {
      'Content-Security-Policy': "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;",
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Le worker généré par défaut sait mettre le cache à jour, mais ne sait pas
      // afficher une Web Push. Cette version conserve le précache Workbox et
      // ajoute le traitement push + clic sur une notification.
      strategies: 'injectManifest',
      srcDir: 'public',
      // Conserver le nom historique : les PWA déjà installées avaient /sw.js.
      // Ainsi, le navigateur récupère cette nouvelle version au lieu de rester
      // bloqué sur le worker précédent et son cache.
      filename: 'sw.js',
      devOptions: {
        enabled: false,
      },
      includeAssets: [
        'favicon_io/favicon.ico',
        'favicon_io/apple-touch-icon.png',
        'favicon_io/android-chrome-192x192.png',
        'favicon_io/android-chrome-512x512.png',
        // Le splash de lancement doit être peint immédiatement, dès le premier
        // démarrage en standalone et hors ligne : il ne peut pas dépendre du réseau.
        'icons/BitterLoadingScreen.webp',
      ],
      manifest: {
        name: 'The Bitter',
        short_name: 'Bitter',
        description: 'A warm, minimalist, mobile-first movie tracking application.',
        theme_color: '#1c1917',
        // Fond du splash natif généré par Android avant que la page ne s'affiche.
        // Il était crème, ce qui produisait un éclair blanc juste avant notre écran
        // de lancement, qui est sombre.
        background_color: '#0c0c0c',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'favicon_io/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'favicon_io/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'favicon_io/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
});
