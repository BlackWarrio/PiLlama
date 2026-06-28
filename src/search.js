'use strict';

const axios = require('axios');

async function webSearch(query) {
  const res = await axios.get('https://api.duckduckgo.com/', {
    params: { q: query, format: 'json', no_html: 1, skip_disambig: 1 },
    timeout: 8000,
  });
  const d = res.data;
  const results = [];

  if (d.AbstractText) results.push(d.AbstractText);
  if (d.Answer) results.push(d.Answer);
  for (const r of (d.RelatedTopics || []).slice(0, 5)) {
    if (r.Text) results.push(r.Text);
  }

  return results.length ? results.join('\n') : 'No results found.';
}

module.exports = { webSearch };
