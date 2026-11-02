// https://v3.nuxtjs.org/api/configuration/nuxt.config
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ['@nuxtjs/supabase'],
  // This single-page example renders its own sign-in form when signed out.
  supabase: { redirect: false },
  css: ['@/assets/main.css'],
})
