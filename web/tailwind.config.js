/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "SF Pro Display",
          "Inter",
          "system-ui",
          "sans-serif"
        ],
        mono: ["SF Mono", "ui-monospace", "Menlo", "monospace"]
      },
      colors: {
        macbg: "#ECECEE",
        macpanel: "rgba(255,255,255,0.72)",
        macpanel2: "rgba(246,246,248,0.85)",
        macborder: "rgba(0,0,0,0.08)",
        macsidebar: "rgba(238,238,240,0.78)",
        macblue: "#0A84FF",
        macblue2: "#3B9BFF",
        macgray: "#8E8E93",
        macred: "#FF5F57",
        macyellow: "#FEBC2E",
        macgreen: "#28C840",
        macink: "#1D1D1F",
        macsub: "#6E6E73"
      },
      boxShadow: {
        mac: "0 20px 60px -10px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.08)",
        macsoft: "0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.06)"
      },
      borderRadius: {
        mac: "14px",
        macwin: "12px"
      },
      backdropBlur: {
        mac: "24px"
      }
    }
  },
  plugins: []
};
