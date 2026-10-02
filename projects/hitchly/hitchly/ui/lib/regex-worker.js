import { runRegex } from "./regex.js";
self.onmessage = e => self.postMessage(runRegex(e.data.pattern, e.data.flags, e.data.text));
