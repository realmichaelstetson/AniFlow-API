/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        "product-sans": ["'Product Sans'", "-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "Roboto", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border, 0 0% 14.9%))",
        input: "hsl(var(--input, 0 0% 14.9%))",
        ring: "hsl(var(--ring, 0 0% 83.1%))",
        background: "hsl(var(--background, 0 0% 0%))",
        foreground: "hsl(var(--foreground, 0 0% 98%))",
        primary: {
          DEFAULT: "hsl(var(--primary, 0 0% 98%))",
          foreground: "hsl(var(--primary-foreground, 0 0% 9%))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary, 0 0% 9.4%))",
          foreground: "hsl(var(--secondary-foreground, 0 0% 98%))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive, 0 62.8% 30.6%))",
          foreground: "hsl(var(--destructive-foreground, 0 0% 98%))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted, 0 0% 9.4%))",
          foreground: "hsl(var(--muted-foreground, 0 0% 63.9%))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent, 0 0% 9.4%))",
          foreground: "hsl(var(--accent-foreground, 0 0% 98%))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover, 0 0% 4.7%))",
          foreground: "hsl(var(--popover-foreground, 0 0% 98%))",
        },
        card: {
          DEFAULT: "hsl(var(--card, 0 0% 1.2%))",
          foreground: "hsl(var(--card-foreground, 0 0% 98%))",
        },
        "shad-canvas": "#000000",
        "shad-card": "#030303",
        "shad-track": "#0C0C0C",
        "shad-active": "#181818",
        "shad-hover": "#141414",
      },
      borderRadius: {
        lg: "var(--radius, 0.75rem)",
        md: "calc(var(--radius, 0.75rem) - 2px)",
        sm: "calc(var(--radius, 0.75rem) - 4px)",
      },
      zIndex: {
        '25': '25',
      },
    },
  },
  plugins: [],
};
