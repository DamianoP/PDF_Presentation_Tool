import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

export default defineConfig({
  root: 'data',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'data/index.html'),
        presentation: resolve(__dirname, 'data/presentation.html'),
        qa: resolve(__dirname, 'data/qa.html'),
        remote: resolve(__dirname, 'data/remote.html'),
      },
      output: {
        entryFileNames: 'js/[name]-[hash].js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  plugins: [
    {
      name: 'inject-precache-manifest',
      closeBundle() {
        const distPath = resolve(__dirname, 'dist');
        const swPath = resolve(distPath, 'sw.js');
        if (!fs.existsSync(swPath)) return;

        // Find all generated hashed .js and .css files
        const assets = [];
        const walkSync = (dir) => {
          if (!fs.existsSync(dir)) return;
          const files = fs.readdirSync(dir);
          files.forEach((file) => {
            const filepath = resolve(dir, file);
            if (fs.statSync(filepath).isDirectory()) {
              walkSync(filepath);
            } else {
              // Only inject js / css assets from Vite
              if ((file.endsWith('.js') && dir.includes('/dist/js')) || 
                  (file.endsWith('.css') && dir.includes('/dist/assets'))) {
                 const relativePath = filepath.replace(distPath + '/', '');
                 assets.push(relativePath);
              }
            }
          });
        };
        
        walkSync(distPath);

        // Inject them into sw.js
        let swContent = fs.readFileSync(swPath, 'utf-8');
        const injectString = assets.map(a => `'${a}'`).join(',\n  ');
        
        swContent = swContent.replace(
          '/* VITE_INJECT_ASSETS */',
          injectString
        );
        
        fs.writeFileSync(swPath, swContent);
        console.log(`[vite-plugin] Injected ${assets.length} hashed assets into sw.js`);
      }
    }
  ]
});