import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const rawBasePath = process.env.VITE_BASE_PATH || "/";
const base = `/${rawBasePath.replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");

export default defineConfig({
  base,
  plugins: [react()],
});
