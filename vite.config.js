import { defineConfig } from 'vite';

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
      name: 'html-transform',
      transformIndexHtml(html) {
        return html.replace(
          '<script type="module" src="/analytics.js"></script>',
          '<script type="module">\nimport { inject } from "@vercel/analytics";\ninject();\n</script>'
        );
      },
    },
  ],
});
