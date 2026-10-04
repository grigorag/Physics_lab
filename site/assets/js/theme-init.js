// Applies the saved (or system) color theme before the first paint.
// Loaded as a classic blocking script in <head>; core/theme.js handles the rest.
(function () {
  var theme;
  try { theme = localStorage.getItem('physlab-theme'); } catch (e) { /* storage blocked */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.dataset.theme = theme;
})();
