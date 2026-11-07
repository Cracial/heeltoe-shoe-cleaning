'use strict';
// Autentikasi: password scrypt + sesi berbasis cookie HttpOnly (token disimpan sebagai hash).
const crypto = require('node:crypto');
const { get, run } = require('../db');
const { HttpError } = require('./util');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam, diperpanjang otomatis saat aktif
const COOKIE = 'sk_session';

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 32);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [algo, s, h] = String(stored).split('$');
  if (algo !== 'scrypt' || !s || !h) return false;
  const expected = Buffer.from(h, 'hex');
  const actual = crypto.scryptSync(String(pw), Buffer.from(s, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha(token), userId, Date.now() + SESSION_TTL_MS);
  run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
  return token;
}
function destroySession(token) {
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha(token));
}
function userFromToken(token) {
  if (!token) return null;
  const h = sha(token);
  const row = get(
    `SELECT u.id, u.name, u.username, u.role, u.phone, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND u.active = 1`, h);
  if (!row || row.expires_at < Date.now()) return null;
  // Perpanjang sesi jika sisa < setengah TTL
  if (row.expires_at - Date.now() < SESSION_TTL_MS / 2) {
    run('UPDATE sessions SET expires_at = ? WHERE token_hash = ?', Date.now() + SESSION_TTL_MS, h);
  }
  delete row.expires_at;
  return row;
}

function cookieHeader(token, secure) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${token ? SESSION_TTL_MS / 1000 : 0}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** Middleware: wajib login, dan (opsional) salah satu role. Admin selalu boleh. */
function requireRole(...roles) {
  return (ctx) => {
    if (!ctx.user) throw new HttpError(401, 'Silakan login terlebih dahulu');
    if (roles.length && ctx.user.role !== 'admin' && !roles.includes(ctx.user.role)) {
      throw new HttpError(403, 'Peran Anda tidak memiliki akses ke fitur ini');
    }
  };
}

// Pembatas percobaan login sederhana (in-memory).
const attempts = new Map();
function checkLoginRate(key) {
  const now = Date.now();
  const a = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  attempts.set(key, a);
  if (a.length >= 10) throw new HttpError(429, 'Terlalu banyak percobaan login. Coba lagi 15 menit lagi.');
}
function recordLoginFail(key) {
  const a = attempts.get(key) || [];
  a.push(Date.now());
  attempts.set(key, a);
}

module.exports = {
  hashPassword, verifyPassword, createSession, destroySession, userFromToken,
  cookieHeader, requireRole, checkLoginRate, recordLoginFail, COOKIE,
};
