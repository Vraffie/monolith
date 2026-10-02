/** HTTP status code and MIME type reference (IANA registries, abridged to what people actually meet). */
export const STATUS = [
  [100, "Continue", "The client may continue sending the request body."],
  [101, "Switching Protocols", "The server is switching protocols as requested (e.g. WebSocket upgrade)."],
  [102, "Processing", "WebDAV: the server has accepted the request and is still working."],
  [103, "Early Hints", "Lets the browser start preloading resources while the final response is prepared."],
  [200, "OK", "The request succeeded."],
  [201, "Created", "A new resource was created; the Location header usually points to it."],
  [202, "Accepted", "Accepted for processing, which has not finished."],
  [203, "Non-Authoritative Information", "Success, but the content was modified by a proxy."],
  [204, "No Content", "Success with no body (typical for DELETE and some PUTs)."],
  [205, "Reset Content", "Success; the client should reset the form or view."],
  [206, "Partial Content", "Only the requested byte range is returned (Range requests, resumable downloads)."],
  [207, "Multi-Status", "WebDAV: several independent results in one response."],
  [300, "Multiple Choices", "Several representations exist; the client must choose."],
  [301, "Moved Permanently", "The resource has a new permanent URL. Browsers and search engines cache this; clients may change POST to GET. Use 308 to keep the method."],
  [302, "Found", "Temporary redirect. Not cached by default, so every visit reaches the server (what Hitchly uses so each click is counted). Historically clients change POST to GET."],
  [303, "See Other", "Redirect to another URL, always fetched with GET (the standard answer after a form POST)."],
  [304, "Not Modified", "Your cached copy is still valid (conditional request)."],
  [307, "Temporary Redirect", "Temporary redirect that keeps the request method and body."],
  [308, "Permanent Redirect", "Permanent redirect that keeps the request method and body."],
  [400, "Bad Request", "The server cannot understand the request (malformed syntax, invalid framing)."],
  [401, "Unauthorized", "Authentication is required or failed. (Despite the name, this is about authentication.)"],
  [402, "Payment Required", "Reserved for future use; a few APIs use it for billing limits."],
  [403, "Forbidden", "Understood but refused: you are authenticated but not allowed."],
  [404, "Not Found", "No such resource (or the server hides that it exists)."],
  [405, "Method Not Allowed", "The method is not supported for this resource; the Allow header lists valid ones."],
  [406, "Not Acceptable", "No representation matches the Accept headers."],
  [408, "Request Timeout", "The server gave up waiting for the request."],
  [409, "Conflict", "The request conflicts with current state (duplicate, edit conflict)."],
  [410, "Gone", "The resource existed and was deliberately removed; Hitchly uses it for expired or used-up links."],
  [411, "Length Required", "A Content-Length header is required."],
  [412, "Precondition Failed", "A conditional header (If-Match, …) did not hold."],
  [413, "Content Too Large", "The request body is larger than the server accepts."],
  [414, "URI Too Long", "The URL is longer than the server accepts."],
  [415, "Unsupported Media Type", "The Content-Type is not supported."],
  [416, "Range Not Satisfiable", "The requested byte range cannot be served."],
  [417, "Expectation Failed", "The Expect header cannot be met."],
  [418, "I'm a teapot", "April Fools' joke from RFC 2324; some services use it for deliberate refusals."],
  [421, "Misdirected Request", "The request was sent to a server that cannot answer for that host."],
  [422, "Unprocessable Content", "Well-formed but semantically invalid (validation errors)."],
  [423, "Locked", "WebDAV: the resource is locked."],
  [425, "Too Early", "The server will not risk processing a request that might be replayed."],
  [426, "Upgrade Required", "The client must switch protocols."],
  [428, "Precondition Required", "The server requires a conditional request."],
  [429, "Too Many Requests", "Rate limited; Retry-After says when to try again."],
  [431, "Request Header Fields Too Large", "Headers are too large."],
  [451, "Unavailable For Legal Reasons", "Blocked for legal reasons."],
  [500, "Internal Server Error", "Generic server failure."],
  [501, "Not Implemented", "The server does not support the method."],
  [502, "Bad Gateway", "A gateway or proxy got an invalid response from upstream."],
  [503, "Service Unavailable", "Overloaded or down for maintenance; Retry-After may say when to retry."],
  [504, "Gateway Timeout", "A gateway or proxy timed out waiting for upstream."],
  [505, "HTTP Version Not Supported", "The HTTP version is not supported."],
  [507, "Insufficient Storage", "WebDAV: the server cannot store the representation."],
  [511, "Network Authentication Required", "The client must authenticate to gain network access (captive portals)."],
].map(([code, name, meaning]) => ({ code, name, meaning, class: ["Informational", "Success", "Redirection", "Client error", "Server error"][Math.floor(code / 100) - 1] }));

export const MIME = [
  ["html", "text/html"], ["htm", "text/html"], ["css", "text/css"], ["js", "text/javascript"], ["mjs", "text/javascript"], ["json", "application/json"],
  ["xml", "application/xml"], ["txt", "text/plain"], ["csv", "text/csv"], ["md", "text/markdown"], ["yaml", "application/yaml"], ["yml", "application/yaml"],
  ["pdf", "application/pdf"], ["zip", "application/zip"], ["gz", "application/gzip"], ["tar", "application/x-tar"], ["7z", "application/x-7z-compressed"],
  ["png", "image/png"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["gif", "image/gif"], ["webp", "image/webp"], ["avif", "image/avif"],
  ["svg", "image/svg+xml"], ["ico", "image/vnd.microsoft.icon"], ["bmp", "image/bmp"], ["tiff", "image/tiff"],
  ["mp3", "audio/mpeg"], ["wav", "audio/wav"], ["ogg", "audio/ogg"], ["flac", "audio/flac"], ["m4a", "audio/mp4"],
  ["mp4", "video/mp4"], ["webm", "video/webm"], ["mov", "video/quicktime"], ["avi", "video/x-msvideo"], ["mkv", "video/x-matroska"],
  ["woff", "font/woff"], ["woff2", "font/woff2"], ["ttf", "font/ttf"], ["otf", "font/otf"], ["wasm", "application/wasm"],
  ["doc", "application/msword"], ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xls", "application/vnd.ms-excel"], ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["ppt", "application/vnd.ms-powerpoint"], ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ["ics", "text/calendar"], ["vcf", "text/vcard"], ["rss", "application/rss+xml"], ["atom", "application/atom+xml"], ["sql", "application/sql"],
  ["sh", "application/x-sh"], ["bin", "application/octet-stream"], ["form", "application/x-www-form-urlencoded"], ["multipart", "multipart/form-data"],
].map(([ext, type]) => ({ ext, type }));

export function searchStatus(q) {
  const s = q.trim().toLowerCase();
  if (!s) return STATUS;
  return STATUS.filter(r => String(r.code).startsWith(s) || r.name.toLowerCase().includes(s) || r.meaning.toLowerCase().includes(s) || r.class.toLowerCase().includes(s));
}

export function searchMime(q) {
  const s = q.trim().toLowerCase().replace(/^\./, "");
  if (!s) return MIME;
  return MIME.filter(r => r.ext.includes(s) || r.type.includes(s));
}
