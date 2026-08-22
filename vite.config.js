import { defineConfig, loadEnv } from 'vite';
import fs from 'fs';
import path from 'path';

// script.js is a classic (non-module) script so the inline onclick/onchange
// handlers in index.html keep working (its functions must stay in global scope).
// Vite can't bundle a classic <script src>, so we serve it verbatim in dev and
// copy it into dist/ on build. styles.css is handled natively by Vite (relative link).
// supabase-config.js is the same: classic, one place for URL + publishable key.
function supabaseConfigSource(env) {
  const filePath = path.resolve('supabase-config.js');
  let src = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
  const key = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';
  if (url) {
    src = src.replace(
      /url:\s*'[^']*'/,
      "url: " + JSON.stringify(url)
    );
  }
  if (key) {
    src = src.replace(
      /key:\s*'[^']*'/,
      "key: " + JSON.stringify(key)
    );
  }
  return src;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
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
            const pathname = (req.url || '').split('?')[0];
            if (pathname === '/script.js') {
              const p = path.resolve('script.js');
              if (fs.existsSync(p)) {
                res.setHeader('Content-Type', 'application/javascript');
                res.end(fs.readFileSync(p));
                return;
              }
            }
            if (pathname === '/supabase-config.js') {
              res.setHeader('Content-Type', 'application/javascript');
              res.end(supabaseConfigSource(env));
              return;
            }
            next();
          });
        },
        closeBundle() {
          const scriptSrc = path.resolve('script.js');
          if (fs.existsSync(scriptSrc)) {
            fs.copyFileSync(scriptSrc, path.resolve('dist/script.js'));
          }
          const cfg = supabaseConfigSource(env);
          if (cfg) fs.writeFileSync(path.resolve('dist/supabase-config.js'), cfg);
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
  };
});
