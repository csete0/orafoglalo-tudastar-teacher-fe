module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        'bg-base': 'var(--color-bg-base)',
        'bg-panel': 'var(--color-bg-panel)',
        'bg-element': 'var(--color-bg-element)',
        primary: 'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
        success: 'var(--color-success)',
        danger: 'var(--color-danger)',
        warning: 'var(--color-warning)',
        'text-base': 'var(--color-text-primary)',
        'text-muted': 'var(--color-text-secondary)',
        'border-default': 'var(--color-border-default)',
      },
    },
  },
  plugins: [],
};
