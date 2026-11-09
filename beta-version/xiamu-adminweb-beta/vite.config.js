import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import WindiCSS from 'vite-plugin-windicss'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')
    const proxyTarget = env.VITE_API_PROXY_TARGET
    const devHost = String(env.VITE_DEV_HOST || '::').trim() || '::'
    const publicBasePath = String(env.VITE_PUBLIC_BASE_PATH || '/').trim() || '/'
    const normalizedBasePath = publicBasePath.endsWith('/') ? publicBasePath : `${publicBasePath}/`

    const serverConfig = {
        host: devHost,
    }

    if (proxyTarget) {
        serverConfig.proxy = {
            '/api': {
                target: proxyTarget,
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/api/, '')
            },
        }
    }

    return {
        base: normalizedBasePath,
        resolve: {
            alias: {
                "~": path.resolve(__dirname, "src")
            },
        },
        server: serverConfig,
        plugins: [vue(), WindiCSS()],
        build: {
            chunkSizeWarningLimit: 1500,
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        if (id.includes('node_modules')) {
                            return id.toString().split('node_modules/')[1].split('/')[0].toString();
                        }
                    }
                }
            }
        }
    }
})
