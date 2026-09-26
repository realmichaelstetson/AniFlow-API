import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#000000",
        surface: {
          base: "#000000",
          card: "#030303",
          track: "#0C0C0C",
          pill: "#181818",
          hover: "#141414",
          hover2: "#161616",
        },
      },
      fontFamily: {
        "product-sans": [
          "Product Sans",
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      borderColor: {
        subtle: "rgba(255, 255, 255, 0.08)",
        overlay: "rgba(255, 255, 255, 0.1)",
        inset: "rgba(255, 255, 255, 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
