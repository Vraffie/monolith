// Tool registry. A tool is { id, title, group, blurb, keywords, needsAuth, mount(root, ctx) }.
// Client-only tools work without signing in; tools that call the server set needsAuth.
import links from "./links.js";
import qr from "./qr.js";
import tracer from "./tracer.js";
import checker from "./checker.js";
import bulk from "./bulk.js";
import importTool from "./import.js";
import exportTool from "./export.js";
import maintenance from "./maintenance.js";
import utm from "./utm.js";
import urlparse from "./urlparse.js";
import base64 from "./base64.js";
import urlcodec from "./urlcodec.js";
import jwt from "./jwt.js";
import hash from "./hash.js";
import uuid from "./uuid.js";
import password from "./password.js";
import json from "./json.js";
import time from "./time.js";
import color from "./color.js";
import regex from "./regex.js";
import text from "./text.js";
import radix from "./radix.js";

export const GROUPS = ["Links", "QR & URLs", "Encode & decode", "Generate", "Format & convert", "Admin"];
export const tools = [links, bulk, qr, tracer, utm, urlparse, base64, urlcodec, jwt, hash, uuid, password, json, time, color, regex, text, radix, checker, importTool, exportTool, maintenance];
