// Curriculum browser + educator review queue. Reads the authored trees and the
// shared job store; every rendered draft waits here for a human decision.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch { /* leave empty */ }
  if (!response.ok) throw new Error(data.error || `Request failed (HTTP ${response.status})`);
  return data;
}

const state = { trees: [], coverage: [], jobs: [], expanded: new Set(), treeInitialized: false, timer: null };

function latestJob(entry) { return entry.jobs[0] || null; }
function topicState(entry) {
  const job = latestJob(entry);
  if (!job) return 'none';
  if (job.status === 'completed' && job.review) return job.review;
  return job.status;
}

function notice(message) {
  const el = document.getElementById('notice');
  if (!message) { el.hidden = true; return; }
  el.textContent = message; el.hidden = false;
}

function renderSummary() {
  const total = state.coverage.length;
  const drafts = state.coverage.filter(e => latestJob(e)?.status === 'completed').length;
  const approved = state.coverage.filter(e => topicState(e) === 'approved').length;
  const running = state.jobs.filter(j => ['queued', 'running'].includes(j.status)).length;
  document.getElementById('sum-topics').textContent = total;
  document.getElementById('sum-drafts').textContent = drafts;
  document.getElementById('sum-approved').textContent = approved;
  document.getElementById('sum-running').textContent = running;
}

function renderQueueSidebar() {
  const list = document.getElementById('queue-list');
  const active = state.jobs.filter(j => ['queued', 'running'].includes(j.status));
  if (!active.length) {
    const recent = state.jobs.slice(0, 8);
    list.innerHTML = recent.length ? recent.map(j => `<a class="library-item" href="./index.html"><strong>${esc(j.brief?.topic?.title || j.brief?.text?.slice(0, 60) || 'Lesson')}</strong><small>${esc(j.status)}${j.review ? ` · ${esc(j.review.decision)}` : ''}</small></a>`).join('') : '<p class="library-empty">Nothing generating.</p>';
    return;
  }
  list.innerHTML = active.map(j => `<span class="library-item"><strong>${esc(j.brief?.topic?.title || 'Lesson')}</strong><small>${esc(j.status)} · ${esc(j.message || '')}</small></span>`).join('');
}

function renderQueueBanner() {
  const banner = document.getElementById('queue-now');
  const running = state.jobs.find(j => j.status === 'running');
  const queued = state.jobs.filter(j => j.status === 'queued').length;
  if (!running && !queued) { banner.hidden = true; return; }
  banner.hidden = false;
  banner.innerHTML = running
    ? `<b>Now generating:</b> ${esc(running.brief?.topic?.title || running.id)} — ${esc(running.message || '')} ${queued ? `<br><b>${queued}</b> more in queue.` : ''}`
    : `<b>${queued}</b> topics queued, starting…`;
}

function renderReviewQueue() {
  const list = document.getElementById('review-list');
  const completed = state.jobs.filter(j => j.status === 'completed');
  document.getElementById('review-count').textContent = `${completed.filter(j => j.review?.decision !== 'approved').length} awaiting review`;
  if (!completed.length) { list.innerHTML = '<p class="empty-note">Rendered drafts waiting for review will appear here.</p>'; return; }
  list.innerHTML = completed.map(job => {
    const topic = job.brief?.topic;
    const video = job.artifacts?.video ? `/api/jobs/${job.id}/artifacts/video` : '';
    const review = job.review;
    const noteId = `review-note-${job.id}`;
    return `<article class="review-card" data-job="${job.id}"><details>
      <summary><span class="review-head"><h3>${esc(topic?.title || job.brief?.text?.slice(0, 80) || 'Lesson')}</h3>
      <small>${topic ? `${esc(topic.unitId)} · objectives ${esc((topic.objectiveCodes || []).join(', '))} · ` : ''}${esc(job.createdAt?.slice(0, 10) || '')}</small></span></summary>
      ${video ? `<video controls playsinline preload="metadata" src="${video}"></video>` : ''}
      ${review ? `<p class="review-state">Decision: <b>${esc(review.decision)}</b>${review.note ? ` — ${esc(review.note)}` : ''} (${esc(review.reviewer)}, ${esc((review.at || '').slice(0, 16).replace('T', ' '))})</p>` : ''}
      <div class="review-actions">
        <label for="${noteId}">Review note for ${esc(topic?.title || 'this lesson')}</label>
        <input id="${noteId}" type="text" maxlength="2000" placeholder="Add a review note" value="${esc(review?.note || '')}">
        <button type="button" class="approve" data-decision="approved">Approve</button>
        <button type="button" class="changes" data-decision="needs-changes">Needs changes</button>
        <button type="button" class="reject" data-decision="rejected">Reject</button>
      </div>
    </details></article>`;
  }).join('');
}

function renderTree() {
  const container = document.getElementById('tree');
  if (!state.trees.length) { container.innerHTML = '<p class="empty-note">No curriculum trees found. Add one under <code>curriculum/</code>.</p>'; return; }
  const byTopic = new Map(state.coverage.map(e => [e.topicId, e]));
  document.getElementById('tree-label').textContent = state.trees.map(t => t.title).join(' · ');
  container.innerHTML = state.trees.map(tree => tree.units.map(unit => {
    const open = state.expanded.has(unit.id);
    const topics = unit.topics.map(topic => {
      const entry = byTopic.get(topic.id);
      const status = entry ? topicState(entry) : 'none';
      const job = entry ? latestJob(entry) : null;
      const label = { none: 'not started', queued: 'queued', running: 'generating', completed: 'draft ready', failed: 'failed', interrupted: 'stopped', approved: 'approved', rejected: 'rejected', 'needs-changes': 'needs changes' }[status] || status;
      const href = job && ['completed', 'failed', 'interrupted'].includes(job.status) ? `./index.html` : '';
      return `<li class="topic-row">
        <span class="codes">${esc(topic.objectives.map(o => o.code).join(' · '))}</span>
        <span class="topic-title">${esc(topic.title)}${href ? `<small><a href="${href}">open draft ↗</a></small>` : `<small>${esc(topic.summary.slice(0, 90))}…</small>`}</span>
        <span class="chip ${status}">${label}</span>
        <button type="button" class="gen-btn" data-topic="${topic.id}" ${['queued', 'running'].includes(status) ? 'disabled' : ''}>${status === 'none' ? 'Generate' : 'Regenerate'}</button>
      </li>`;
    }).join('');
    const done = unit.topics.filter(t => topicState(byTopic.get(t.id) || { jobs: [] }) === 'approved').length;
    return `<section class="unit"><header class="unit-head">
      <button type="button" class="unit-toggle" data-unit="${unit.id}" aria-expanded="${open}" aria-controls="topics-${unit.id}">
        <h3>${esc(unit.title)}</h3><span class="strand">${esc(unit.strand)}</span>
        <span class="unit-stats">${done}/${unit.topics.length} approved</span><span class="unit-disclosure" aria-hidden="true">›</span>
      </button>
      <button type="button" class="gen-btn" data-unit-gen="${unit.id}">Generate unit</button>
    </header>${open ? `<ul class="unit-topics" id="topics-${unit.id}">${topics}</ul>` : ''}</section>`;
  }).join('')).join('');
}

async function load() {
  const [{ trees, coverage }, { jobs }] = await Promise.all([api('/api/curriculum'), api('/api/jobs')]);
  state.trees = trees; state.coverage = coverage; state.jobs = jobs;
  if (!state.treeInitialized) {
    const firstUnit = trees[0]?.units?.[0]?.id;
    if (firstUnit) state.expanded.add(firstUnit);
    state.treeInitialized = true;
  }
  renderSummary(); renderQueueSidebar(); renderQueueBanner(); renderReviewQueue(); renderTree();
  const active = jobs.some(j => ['queued', 'running'].includes(j.status));
  clearTimeout(state.timer);
  if (active) state.timer = setTimeout(() => load().catch(() => {}), 3000);
}

async function generate(payload) {
  notice('Queuing generation…');
  try {
    const result = await api('/api/batch', { method: 'POST', body: JSON.stringify(payload) });
    notice(result.count ? `${result.count} topic(s) queued.${result.errors.length ? ` ${result.errors.length} skipped.` : ''}` : `Nothing queued: ${result.errors.map(e => e.error).join('; ') || 'unknown reason'}`);
    await load();
  } catch (error) { notice(error.message); }
}

document.getElementById('refresh').addEventListener('click', () => load().catch(error => notice(error.message)));
document.getElementById('tree').addEventListener('click', event => {
  const topicBtn = event.target.closest('[data-topic]');
  if (topicBtn) { generate({ topicIds: [topicBtn.dataset.topic] }); return; }
  const unitBtn = event.target.closest('[data-unit-gen]');
  if (unitBtn) { event.stopPropagation(); generate({ unitId: unitBtn.dataset.unitGen }); return; }
  const toggle = event.target.closest('.unit-toggle');
  if (toggle) {
    const id = toggle.dataset.unit;
    state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
    renderTree();
    document.querySelector(`.unit-toggle[data-unit="${CSS.escape(id)}"]`)?.focus();
  }
});
document.getElementById('review-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-decision]');
  if (!button) return;
  const card = button.closest('.review-card'), jobId = card?.dataset.job;
  if (!jobId) return;
  const note = card.querySelector('input')?.value || '';
  button.disabled = true;
  try {
    await api(`/api/jobs/${encodeURIComponent(jobId)}/review`, { method: 'POST', body: JSON.stringify({ decision: button.dataset.decision, note, reviewer: 'educator' }) });
    await load();
  } catch (error) { notice(error.message); button.disabled = false; }
});

load().catch(error => { notice(error.message); document.getElementById('tree').innerHTML = `<p class="empty-note">${esc(error.message)}</p>`; });
