/** Colour-vision-deficiency simulation (Machado, Oliveira & Fernandes 2009, severity 1.0), done in linear RGB. An approximation, not a diagnosis. */
export const TYPES = {
  protanopia: { label: "Protanopia (no red cones)", m: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998] },
  deuteranopia: { label: "Deuteranopia (no green cones)", m: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881] },
  tritanopia: { label: "Tritanopia (no blue cones)", m: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039] },
  achromatopsia: { label: "Achromatopsia (no colour)", m: [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722] },
};

const TO_LIN = Float32Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const fromLin = v => { const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(c * 255))); };

export function simulatePixel([r, g, b], type) {
  const t = TYPES[type];
  if (!t) throw new Error("Unknown type");
  const m = t.m, R = TO_LIN[r], G = TO_LIN[g], B = TO_LIN[b];
  return [fromLin(m[0] * R + m[1] * G + m[2] * B), fromLin(m[3] * R + m[4] * G + m[5] * B), fromLin(m[6] * R + m[7] * G + m[8] * B)];
}

/** In place on RGBA bytes (ImageData.data). */
export function simulateImageData(data, type) {
  const t = TYPES[type];
  if (!t) throw new Error("Unknown type");
  const m = t.m;
  for (let i = 0; i < data.length; i += 4) {
    const R = TO_LIN[data[i]], G = TO_LIN[data[i + 1]], B = TO_LIN[data[i + 2]];
    data[i] = fromLin(m[0] * R + m[1] * G + m[2] * B); data[i + 1] = fromLin(m[3] * R + m[4] * G + m[5] * B); data[i + 2] = fromLin(m[6] * R + m[7] * G + m[8] * B);
  }
  return data;
}
