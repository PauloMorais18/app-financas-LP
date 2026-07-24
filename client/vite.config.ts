import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import {VitePWA} from "vite-plugin-pwa";

export default defineConfig({
  plugins:[react(),VitePWA({
    registerType:"autoUpdate",
    devOptions:{enabled:true},
    includeAssets:["finanbase-icon.svg","icons/finanbase-180.png"],
    manifest:{
      name:"Finanbase — Controle Financeiro",short_name:"Finanbase",description:"Controle financeiro multiusuário integrado ao Google Sheets.",
      theme_color:"#2161f5",background_color:"#f6f8fb",display:"standalone",orientation:"portrait-primary",start_url:"/",scope:"/",lang:"pt-BR",categories:["finance","productivity"],
      icons:[
        {src:"/icons/finanbase-192.png",sizes:"192x192",type:"image/png",purpose:"any"},
        {src:"/icons/finanbase-512.png",sizes:"512x512",type:"image/png",purpose:"any"},
        {src:"/icons/finanbase-maskable-512.png",sizes:"512x512",type:"image/png",purpose:"maskable"}
      ]
    },
    workbox:{
      navigateFallback:"/index.html",
      cleanupOutdatedCaches:true,
      skipWaiting:true,
      clientsClaim:true,
      runtimeCaching:[{urlPattern:({url})=>url.pathname.startsWith("/api/"),handler:"NetworkOnly"}]
    }
  })],
  server:{host:"127.0.0.1",port:5180,strictPort:true,proxy:{"/api":"http://localhost:3333"}}
});
