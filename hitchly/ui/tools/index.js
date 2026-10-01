// Tool registry. A tool is { id, title, group, blurb, keywords, needsAuth, mount(root, ctx) }.
// Client-only tools work without signing in; tools that call the server set needsAuth.
import links from "./links.js";

export const GROUPS = ["Links", "QR & URLs", "Encode & decode", "Generate", "Format & convert", "Admin"];
export const tools = [links];
