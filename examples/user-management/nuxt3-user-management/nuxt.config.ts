// https://nuxt.com/docs/4.x/api/nuxt-config
export default defineNuxtConfig({
  srcDir: '.',
  devtools: { enabled: true },
  modules: ['@nuxtjs/supabase'],
  // This single-page example renders its own sign-in form when signed out.
  supabase: { redirect: false },
  css: ['@/assets/main.css'],
})
