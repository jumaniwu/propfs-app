/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy:      '#0D1B2A',
        steel:     '#1B3A5C',
        gold:      '#C9A84C',
        'gold-lt': '#FAF0D0',
        cream:     '#F5F0E8',
        'green-dk': '#1B5E20',
        'green-lt': '#E8F5E9',
        'red-dk':   '#B71C1C',
        'red-lt':   '#FFEBEE',
        amber:     '#E65100',
        'amber-lt':'#FFF3E0',
        'blue-dk': '#0D47A1',
        'blue-lt': '#E3F2FD',
        border:    'hsl(var(--border))',
        input:     'hsl(var(--input))',
        ring:      'hsl(var(--ring))',
        background:'hsl(var(--background))',
        foreground:'hsl(var(--foreground))',
        primary: {
          DEFAULT:   'hsl(var(--primary))',
          foreground:'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:   'hsl(var(--secondary))',
          foreground:'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:   'hsl(var(--destructive))',
          foreground:'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:   'hsl(var(--muted))',
          foreground:'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:   'hsl(var(--accent))',
          foreground:'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT:   'hsl(var(--card))',
          foreground:'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT:   'hsl(var(--popover))',
          foreground:'hsl(var(--popover-foreground))',
        },
      },
      fontFamily: {
        serif:  ['Playfair Display', 'Georgia', 'serif'],
        sans:   ['DM Sans', 'system-ui', 'sans-serif'],
        mono:   ['DM Mono', 'Courier New', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
        'fade-in':        'fade-in 0.3s ease-out',
      },
    },
  },
  plugins: [],
}
