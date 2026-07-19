/** Zero-dependency health check for Vercel (no Express — res.json() is unavailable). */
module.exports = (_req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, service: 'exam-flow-api' }));
};
