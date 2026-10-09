const { LEGAL_DOCS } = require('./legalContent');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function registerLegalPages(app) {
  app.get('/legal/:page', (req, res) => {
    const doc = Object.hasOwn(LEGAL_DOCS, req.params.page) && LEGAL_DOCS[req.params.page];
    if (!doc) return res.sendStatus(404);
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
    res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(doc.title)}</title><style>body{max-width:760px;margin:auto;padding:24px;font:18px/1.6 system-ui;color:#30243c;background:#fffaf2}h1{color:#954400}h2{font-size:22px;margin-top:32px}a{color:#493591}</style><main><h1>${escape(doc.title)}</h1><p>Updated ${escape(doc.updated)}</p>${doc.sections.map(([title, body]) => `<section><h2>${escape(title)}</h2><p>${escape(body)}</p></section>`).join('')}<nav><a href="/legal/privacy">Privacy</a> · <a href="/legal/terms">Terms</a> · <a href="/legal/delete-account">Delete account</a></nav></main></html>`);
  });
}
module.exports = { registerLegalPages };
