import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    headers: {
      'Content-Security-Policy': "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;",
    },
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * Sépare les dépendances du code applicatif.
         *
         * Tout arrivait dans un seul fichier d'entrée de 1,2 Mo : la moindre
         * correction d'une ligne de l'application obligeait le téléphone à
         * retélécharger React, Supabase et les icônes avec elle. Isolées, ces
         * dépendances gardent leur empreinte entre deux déploiements et restent
         * dans le cache — ce qui n'a de valeur que depuis que `vercel.json` leur
         * donne un cache immuable.
         *
         * Le premier chargement n'y gagne presque rien : c'est le second, et tous
         * les suivants, qui deviennent quasi gratuits.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-dom') || id.includes('/scheduler/') || /\/react\//.test(id)) {
            return 'vendor-react';
          }
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('@dicebear')) return 'vendor-avatars';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (
            id.includes('html-to-image') ||
            id.includes('dompurify') ||
            id.includes('papaparse')
          ) {
            return 'vendor-export';
          }
          return undefined;
        },
      },
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
        // L'application est francophone : le manifeste annonçait `lang: "en"`
        // (valeur par défaut du plugin) et une description en anglais, que les
        // stores et les navigateurs reprennent tels quels.
        lang: 'fr',
        dir: 'ltr',
        description:
          'Note tes films, suis ce que tu regardes, planifie tes séances et découvre ton ADN cinéma.',
        // Identifiant stable de l'application. Sans lui, le navigateur déduit
        // l'identité de `start_url` : la changer un jour créerait une seconde
        // application aux yeux du système au lieu de mettre à jour la première.
        id: '/',
        categories: ['entertainment', 'lifestyle'],
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
          // Le même fichier sert d'icône maskable, et c'est volontaire : le logo
          // tient dans le cercle de sécurité de 80 %, et le dégradé va jusqu'aux
          // bords — exactement ce qu'un masque adaptatif attend. Une version
          // rétrécie sur un fond rapporté ferait moins bien, en ajoutant un
          // liseré visible.
          {
            src: 'favicon_io/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
});
