'use strict';
const { get, run } = require('../db');
const { bad, HttpError, str } = require('../lib/util');
const auth = require('../lib/auth');

module.exports = (r) => {
  r.post('/api/auth/login', (ctx) => {
    const username = str(ctx.body.username, 'Username', { max: 50 });
    const password = str(ctx.body.password, 'Password', { max: 200 });
    const key = `${ctx.ip}:${username.toLowerCase()}`;
    auth.checkLoginRate(key);
    const u = get('SELECT * FROM users WHERE username = ? AND active = 1', username);
    if (!u || !auth.verifyPassword(password, u.password_hash)) {
      auth.recordLoginFail(key);
      throw new HttpError(401, 'Username atau password salah');
    }
    const token = auth.createSession(u.id);
    ctx.setHeader('Set-Cookie', auth.cookieHeader(token, ctx.secure));
    return { id: u.id, name: u.name, username: u.username, role: u.role };
  });

  r.post('/api/auth/logout', (ctx) => {
    auth.destroySession(ctx.cookies[auth.COOKIE]);
    ctx.setHeader('Set-Cookie', auth.cookieHeader('', ctx.secure));
    return { ok: true };
  });

  r.get('/api/auth/me', auth.requireRole(), (ctx) => ctx.user);

  r.post('/api/auth/password', auth.requireRole(), (ctx) => {
    const oldPw = str(ctx.body.old_password, 'Password lama');
    const newPw = str(ctx.body.new_password, 'Password baru', { min: 6, max: 200 });
    const u = get('SELECT password_hash FROM users WHERE id = ?', ctx.user.id);
    if (!auth.verifyPassword(oldPw, u.password_hash)) throw bad('Password lama salah');
    run('UPDATE users SET password_hash = ? WHERE id = ?', auth.hashPassword(newPw), ctx.user.id);
    return { message: 'Password berhasil diganti' };
  });
};
