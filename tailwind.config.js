/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/src/**/*.{js,ts,jsx,tsx}",
  ],
  // We drive theming via [data-theme="dark"] on <html>, not the 'dark' class.
  // The design-system.css file owns all token values.
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Map every semantic color to the corresponding CSS variable.
        // All components that use these class names are now automatically
        // theme-aware without any code changes.
        background: 'var(--bg-app)',
        surface: 'var(--bg-surface)',
        'surface-hover': 'var(--bg-surface-hover)',
        foreground: 'var(--text-primary)',
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          foreground: '#ffffff',
        },
        danger: 'var(--color-danger)',
        success: 'var(--color-success)',
        card: {
          DEFAULT: 'var(--bg-surface)',
          foreground: 'var(--text-primary)',
        },
        border: 'var(--border-color)',
        muted: 'var(--text-secondary)',
        'muted-bg': 'var(--bg-surface)',
        overlay: 'var(--bg-overlay)',
      },
      borderRadius: {
        sm: 'var(--border-radius-sm)',
        md: 'var(--border-radius-md)',
        lg: 'var(--border-radius-lg)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      transitionDuration: {
        fast: '150ms',
        normal: '250ms',
      },
      width: {
        sidebar: 'var(--sidebar-width)',
      },
      height: {
        navbar: 'var(--navbar-height)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
