import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

// script.js is a classic (non-module) script so the inline onclick/onchange
// handlers in index.html keep working (its functions must stay in global scope).
// Vite can't bundle a classic <script src>, so we serve it verbatim in dev and
// copy it into dist/ on build. styles.css is handled natively by Vite (relative link).
export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  },
  plugins: [
    {
      name: 'root-classic-script',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if ((req.url || '').split('?')[0] === '/script.js') {
            const p = path.resolve('script.js');
            if (fs.existsSync(p)) {
              res.setHeader('Content-Type', 'application/javascript');
              res.end(fs.readFileSync(p));
              return;
            }
          }
          next();
        });
      },
      closeBundle() {
        const src = path.resolve('script.js');
        if (fs.existsSync(src)) fs.copyFileSync(src, path.resolve('dist/script.js'));
      },
    },
    {
      name: 'html-transform',
      transformIndexHtml(html) {
        return html.replace(
          '<script type="module" src="/analytics.js"></script>',
          '<script type="module">\nimport { inject } from "@vercel/analytics";\nimport { injectSpeedInsights } from "@vercel/speed-insights";\ninject();\ninjectSpeedInsights();\n</script>'
        );
      },
    },
  ],
});
