const fs = require('fs');

const infra = JSON.parse(fs.readFileSync('./public/data/infra-health.json', 'utf8'));
const qa = JSON.parse(fs.readFileSync('./public/data/qa-health.json', 'utf8'));

const engines = [
  { id: 'agatha', name: 'Agatha', domain: 'COO / Conversation', cron: 'Continuous', n8n_workflow: 'None', state: 'Running', next_run: 'Now' },
  { id: 'vera', name: 'Vera', domain: 'Audit / Standards', cron: 'Daily 2AM / Fri 6AM', n8n_workflow: 'None', state: 'Sleeping', next_run: 'Wed 02:00 EST' },
  { id: 'arlo', name: 'Arlo', domain: 'Infra / Tools', cron: 'Sun 3AM', n8n_workflow: 'None', state: 'Sleeping', next_run: 'Sun 03:00 EST' },
  { id: 'maya', name: 'Maya', domain: 'Marketing / SEO', cron: 'Wed 9AM', n8n_workflow: 'O6AUi9W6UxBxhH94', state: 'Sleeping', next_run: 'Wed 09:00 EST' },
  { id: 'cleo', name: 'Cleo', domain: 'Content Engine', cron: 'Mon 7AM / Fri 6PM', n8n_workflow: 'content-draft-post', state: 'Sleeping', next_run: 'Mon 07:00 EST' },
  { id: 'leo', name: 'Leo', domain: 'Revenue / Finance', cron: 'Mon 8AM', n8n_workflow: 'pyr9wurcs1M9utW3', state: 'Errored', next_run: 'Pending trigger' },
  { id: 'felix', name: 'Felix', domain: 'Enterprise BD', cron: 'Mon-Fri 11AM', n8n_workflow: 'opportunity-update', state: 'Running', next_run: 'Wed 11:00 EST' },
  { id: 'zara', name: 'Zara', domain: 'BD Signals', cron: 'Mon-Fri 10AM', n8n_workflow: 'Uz8qzh6kuXkN2bc8', state: 'Sleeping', next_run: 'Wed 10:00 EST' },
  { id: 'nova', name: 'Nova', domain: 'Visibility / Podcasts', cron: 'Tue/Fri 9AM', n8n_workflow: 'None', state: 'Sleeping', next_run: 'Fri 09:00 EST' }
  , { id: 'hunter', name: 'Hunter', domain: 'Job Sourcing', cron: 'Mon,Thu 8AM', n8n_workflow: 'None', state: 'Sleeping', next_run: 'Thu 08:00 UTC' }
];

const mapped = engines.map(e => ({
  ...e,
  infra_status: infra[e.id]?.status || 'green',
  infra_note: infra[e.id]?.note || 'OK',
  qa_status: qa[e.id]?.status || 'green',
  qa_note: qa[e.id]?.note || 'OK'
}));

fs.writeFileSync('./public/data/execution-state.json', JSON.stringify({
  updated_at: new Date().toISOString(),
  engines: mapped
}, null, 2));
console.log('Built execution-state.json');
