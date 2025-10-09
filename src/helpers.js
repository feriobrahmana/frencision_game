export const rndInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const rand = (a = 1, b = 0) => Math.random() * (a - b) + b;
