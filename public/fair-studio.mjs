const $ = (id) => document.getElementById(id);
const fairWorkspace = new URL('.', import.meta.url);
const fairUrl = (path) => new URL(path.replace(/^\//, ''), fairWorkspace).href;
const state = { jobs: [], selected: null, config: null, timer: null, revision: '', resultKey: '', capabilityWarning: '', generationVersion: 'classic', provider: 'local', providerModels: {} };
let playbackAttempt = 0, playerFeedbackActive = false;
const stages = [['plan', 'Plan'], ['review', 'Check content'], ['narration', 'Narrate'], ['composition', 'Animate'], ['render', 'Render'], ['verify', 'Verify export']];
const active = (job) => ['queued', 'running'].includes(job?.status);
const authoredBenchmark = (job) => job?.report?.origin === 'authored' || job?.report?.status === 'authored-benchmark' || job?.status === 'authored-benchmark';
const exportReady = (job) => ['completed', 'authored-benchmark'].includes(job?.status);
const text = (value) => typeof value === 'string' ? value : value?.text || value?.title || value?.label || '';
function el(tag, content, className) {
  const node = document.createElement(tag);
  if (content !== undefined) node.textContent = content;
  if (className) node.className = className;
  return node;
}
function safeArtifact(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null;
  const url = new URL(value, location.origin);
  return url.origin === location.origin && url.pathname.startsWith('/api/') ? fairUrl(url.pathname) : null;
}
async function api(path, options = {}) {
  const response = await fetch(fairUrl(path), { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || data.message || `Request failed (${response.status}).`);
  return data;
}
function notice(message) { $('connection-notice').textContent = message; $('connection-notice').hidden = !message; }
function fail(message) { $('form-error').textContent = message; $('form-error').hidden = !message; if (message) $('form-error').focus(); }
function playbackStatus(message, error = false) {
  $('playback-status').textContent = message;
  $('playback-status').classList.toggle('playback-error', error);
}
function resetNarrationControl() {
  playbackAttempt += 1; playerFeedbackActive = false;
  $('video').pause(); $('play-narration').disabled = false;
  playbackStatus('Enables player sound at full volume. Your browser tab and device control the final audio output.');
}
function reflectPlayback() {
  if (!playerFeedbackActive) return;
  const video = $('video');
  if (video.ended) playbackStatus('Playback finished.');
  else if (video.paused) playbackStatus('Playback paused. Use the player controls or Play with narration to continue.');
  else if (video.muted || video.volume === 0) playbackStatus('The player is muted or its volume is zero. Play with narration restores player sound.');
  else playbackStatus(`Playback started; player sound is enabled at ${Math.round(video.volume * 100)}%. If you hear nothing, check the browser tab and your device’s audio output.`);
}
function avatarArt(id) {
  // Trusted local SVG illustrations. Generated content never enters an HTML string.
  const shell = document.createElement('span');
  shell.className = 'avatar-art'; shell.setAttribute('aria-hidden', 'true');
  if (id === 'mira') { shell.classList.add('pip-art'); return shell; }
  const art = {
    none: '<svg viewBox="0 0 80 86" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="86" rx="12" fill="#eef2ec"/><rect x="12" y="16" width="56" height="38" rx="5" fill="#fffefa" stroke="#a4aea2" stroke-width="2"/><path d="M20 26h34M20 34h24M20 42h30" stroke="#285e50" stroke-width="3" stroke-linecap="round"/><circle cx="63" cy="60" r="12" fill="#285e50"/><path d="M57 60l4 4 8-9" stroke="#fffefa" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="40" y="76" text-anchor="middle" font-size="9" font-weight="700" fill="#646c65" letter-spacing="1">CLEAN</text></svg>',
    mira: '<svg viewBox="0 0 80 86" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="86" rx="40" fill="#e6dfd3"/><path d="M13 62V34C13 5 66 3 67 34v31" fill="#3d302a"/><path d="M8 86c0-28 64-28 64 0" fill="#356c5a"/><path d="M33 58h14v17H33" fill="#c5906f"/><ellipse cx="40" cy="39" rx="22" ry="26" fill="#dca786"/><path d="M17 35C12 5 65 3 64 35L54 17c-9 14-23 8-37 18" fill="#3d302a"/><circle cx="32" cy="39" r="2" fill="#30251f"/><circle cx="48" cy="39" r="2" fill="#30251f"/><path d="M34 51q6 5 12 0" fill="none" stroke="#8c5143" stroke-width="2" stroke-linecap="round"/><circle cx="27" cy="47" r="4" fill="#cf8d77" opacity=".5"/><circle cx="53" cy="47" r="4" fill="#cf8d77" opacity=".5"/><path d="m29 70 11 8 11-8" stroke="#b9ceb6" fill="none" stroke-width="3"/></svg>',
    leo: '<svg viewBox="0 0 80 86" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="86" rx="40" fill="#e8d7bd"/><path d="M8 86c0-28 64-28 64 0" fill="#b96d48"/><path d="M33 57h14v16H33" fill="#ad7751"/><ellipse cx="40" cy="38" rx="22" ry="26" fill="#c89469"/><path d="M18 32C8 18 28 4 41 7c23-7 31 21 21 29l-6-16c-14 8-26 0-38 12" fill="#342a25"/><circle cx="31" cy="39" r="8" fill="none" stroke="#3b3a31" stroke-width="2"/><circle cx="50" cy="39" r="8" fill="none" stroke="#3b3a31" stroke-width="2"/><path d="M39 38h3" stroke="#3b3a31" stroke-width="2"/><circle cx="31" cy="39" r="2" fill="#30251f"/><circle cx="50" cy="39" r="2" fill="#30251f"/><path d="M34 52q6 5 12 0" fill="none" stroke="#754b37" stroke-width="2" stroke-linecap="round"/><path d="m29 69 11 8 11-8" stroke="#f1d9af" fill="none" stroke-width="3"/></svg>',
    orbit: '<svg viewBox="0 0 80 86" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="86" rx="40" fill="#dbe5e5"/><path d="M16 86V70q24-20 48 0v16" fill="#526b78"/><path d="M40 13v10" stroke="#526b78" stroke-width="3"/><circle cx="40" cy="11" r="5" fill="#e8b65e"/><rect x="12" y="26" width="56" height="38" rx="16" fill="#6d8793"/><rect x="18" y="31" width="44" height="28" rx="12" fill="#e9f1e8"/><circle cx="30" cy="42" r="4" fill="#2c5e55"/><circle cx="50" cy="42" r="4" fill="#2c5e55"/><path d="M34 51q6 4 12 0" stroke="#2c5e55" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="40" cy="75" r="5" fill="#e8b65e"/></svg>'
  };
  shell.innerHTML = art[id] || art.orbit;
  return shell;
}
function renderAvatars(avatars) {
  $('avatars').replaceChildren();
  for (const [index, avatar] of avatars.entries()) {
    const label = el('label', undefined, 'avatar-card');
    const input = el('input'); input.type = 'radio'; input.name = 'avatar'; input.value = avatar.id; input.required = true; input.checked = index === 0;
    const name = el('span', undefined, 'avatar-label');
    name.append(el('strong', avatar.name), el('small', avatar.description));
    label.append(input, avatarArt(avatar.id), name); $('avatars').append(label);
  }
}
const openSource = () => state.generationVersion === 'open-source';
const modelKey = () => `${state.generationVersion}:${state.provider}`;
function generationVersions() { return state.config?.generationVersions || [{ id: 'classic', name: 'Classic · illustrated lessons', available: true, description: 'Illustrated lessons with the existing animation studio.' }]; }
function generationName(job) {
  const id = job.brief?.generationVersion || job.generationVersion || 'classic';
  return generationVersions().find((version) => version.id === id)?.name || (id === 'open-source' ? 'Open source' : 'Classic');
}
function renderGenerationVersion() {
  const versions = generationVersions();
  $('generation-version').replaceChildren(...versions.map((version) => { const option = el('option', `${version.name}${version.available ? '' : ' — setup needed'}`); option.value = version.id; return option; }));
  $('generation-version').value = state.generationVersion;
  const selected = versions.find((version) => version.id === state.generationVersion);
  $('generation-description').textContent = [selected?.description, openSource() ? 'No API fees. Hardware, electricity, storage and setup still have a cost. Generated footage needs educator review.' : ''].filter(Boolean).join(' ');
  const blockers = selected?.blockers || [];
  $('generation-blockers').replaceChildren();
  $('generation-blockers').hidden = selected?.available !== false && !blockers.length;
  if (!$('generation-blockers').hidden) {
    $('generation-blockers').append(el('strong', 'Setup needed before generation'));
    const list = el('ul');
    for (const blocker of blockers.length ? blockers : ['Check the studio server configuration.']) list.append(el('li', text(blocker)));
    $('generation-blockers').append(list);
  }
  $('instructor-field').hidden = openSource();
  $('instructor-field').disabled = openSource();
  notice(openSource() ? '' : state.capabilityWarning);
  renderProviders(false);
}
function providers() {
  const choices = state.config?.providers || [{ id: 'local', name: 'Local', available: state.config?.capabilities?.planning?.available !== false, models: state.config?.models || [], description: 'Plan and narrate with your local services.' }];
  return openSource() ? choices.filter((provider) => provider.id === 'local') : choices;
}
function selectedVoice() { return state.config?.voiceOptions?.find((voice) => voice.id === $('voice-provider').value); }
function voiceAvailable(voice) { return Boolean(voice?.available && (!openSource() || voice.openSourceAvailable !== false)); }
function paidVoice() { return ['openai', 'elevenlabs'].includes(selectedVoice()?.id); }
function canGenerate() {
  const voiceReady = openSource() ? ['piper', 'kokoro'].includes(selectedVoice()?.id) && voiceAvailable(selectedVoice()) : !state.config?.voiceOptions?.length || voiceAvailable(selectedVoice());
  return Boolean(generationVersions().find((version) => version.id === state.generationVersion)?.available && (openSource() || state.config?.avatars?.length) && providers().find((provider) => provider.id === state.provider)?.available && voiceReady);
}
function updateVoice() {
  const voice = selectedVoice();
  const quality = { neural: 'Natural neural voice', premium: 'Premium cloud voice', system: 'System voice · draft quality' };
  $('voice-status').textContent = voice ? `${quality[voice.quality] || voice.name}. ${voiceAvailable(voice) ? '' : 'Setup needed. '}${openSource() && voice.openSourceAvailable === false ? 'This voice needs a local service for open-source generation. ' : ''}${voice.description || ''}${paidVoice() ? ' Paid speech charges apply, including with local planning.' : ''}` : '';
  $('generate').disabled = !canGenerate();
  const audio = $('voice-sample'); audio.pause(); audio.removeAttribute('src'); audio.hidden = true;
  if (typeof voice?.sampleUrl === 'string' && voice.sampleUrl.startsWith('/') && !voice.sampleUrl.startsWith('//')) {
    const sample = new URL(voice.sampleUrl, location.origin);
    if (sample.origin === location.origin && ['/assets/', '/api/'].some((prefix) => sample.pathname.startsWith(prefix))) { audio.src = fairUrl(sample.pathname); audio.hidden = false; }
  }
  renderPricing();
}
function renderVoiceOptions(provider) {
  const voices = (state.config?.voiceOptions || []).filter((voice) => !openSource() || ['piper', 'kokoro'].includes(voice.id));
  $('voice-field').hidden = !voices.length && !openSource();
  $('voice-provider').replaceChildren(...voices.map((voice) => {
    const option = el('option', `${voice.name}${voiceAvailable(voice) ? '' : ' — setup needed'}${voice.quality === 'system' ? ' · draft quality' : ''}`); option.value = voice.id; return option;
  }));
  const preferred = provider === 'openai' ? 'openai' : state.config?.defaults?.voiceProvider || 'piper';
  $('voice-provider').value = voices.some((voice) => voice.id === preferred) ? preferred : voices[0]?.id || '';
  updateVoice();
  if (openSource() && !voices.length) $('voice-status').textContent = 'Set up a local Piper or Kokoro narrator before generating.';
}
function selectProvider(id, remember = true) {
  if (remember && state.provider && $('model').value.trim()) state.providerModels[modelKey()] = $('model').value.trim();
  state.provider = id;
  const provider = providers().find((entry) => entry.id === id);
  const models = provider?.models || [];
  $('model').value = openSource() ? state.config.defaults?.openSourceModel || '' : state.providerModels[modelKey()] || (id === 'local' ? state.config.defaults?.model : models[0]) || models[0] || '';
  $('model-options').replaceChildren(...models.map((model) => { const option = el('option'); option.value = typeof model === 'string' ? model : model.name || model.id; return option; }));
  $('model').readOnly = openSource();
  if (openSource()) $('model').removeAttribute('list'); else $('model').setAttribute('list', 'model-options');
  $('model-label').textContent = id === 'local' ? 'Local language model' : 'OpenAI language model';
  $('model-hint').textContent = id === 'local' ? 'Use a model installed in your local generation service.' : 'Paid planning uses the server’s OpenAI API key. Choose the narrator separately; video rendering remains local.';
  if (openSource()) $('model-hint').textContent = 'This version uses the local model configured by the studio server. Keep its local service, such as Strata, running before generating.';
  $('provider-status').textContent = provider?.available ? (id === 'local' ? 'Planning runs on your computer with no cloud API fee. Choose your narrator below.' : 'A server API key is configured; connectivity and account access are checked when generating. Paid planning incurs API usage charges; choose your narrator below.') : `${provider?.name || id} is not configured. ${provider?.description || 'Check the server configuration.'}`;
  renderVoiceOptions(id);
}
function renderProviders(remember = true) {
  $('providers').replaceChildren();
  for (const provider of providers()) {
    const label = el('label', undefined, 'provider-card'); const input = el('input');
    input.type = 'radio'; input.name = 'provider'; input.value = provider.id; input.checked = provider.id === state.provider; input.required = true;
    input.addEventListener('change', () => selectProvider(provider.id));
    const content = el('span'); content.append(el('strong', provider.name), el('small', provider.description));
    if (!provider.available) content.append(el('span', 'Setup needed', 'provider-availability'));
    label.append(input, content); $('providers').append(label);
  }
  selectProvider(state.provider, remember);
}
function money(value) { return typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(value) : 'Not available'; }
function renderPricing() {
  $('pricing-section').hidden = openSource();
  if (openSource()) return;
  const pricing = state.config?.pricing; const paid = pricing?.openai;
  const container = $('pricing-detail'); container.replaceChildren();
  $('cost-summary').textContent = state.provider === 'local' ? (paidVoice() ? 'Local plan · paid speech' : 'Local · no cloud API fee') : paid ? `${money(paid.estimatedLessonMin)}–${money(paid.estimatedLessonMax)} · 2–5 min example` : 'Paid · estimate unavailable';
  const grid = el('div', undefined, 'price-grid'); const local = el('div'); const cloud = el('div');
  local.append(el('h3', 'Local generation'), el('p', pricing?.local?.description || 'No per-request cloud API fee. Your own hardware, electricity, and setup still have a cost.'));
  cloud.append(el('h3', 'OpenAI generation'));
  if (paid) {
    cloud.append(el('p', `${money(paid.estimatedLessonMin)}–${money(paid.estimatedLessonMax)} · 2–5 minute example`, 'price-estimate'));
    const rates = el('dl', undefined, 'price-rates');
    const items = [[`${paid.model} · input / 1M tokens`, paid.inputPerMillion], [`${paid.model} · output / 1M tokens`, paid.outputPerMillion]];
    if (typeof paid.ttsPerMinute === 'number') items.push(['Speech / audio minute', paid.ttsPerMinute]);
    for (const [label, rate] of items) rates.append(el('dt', label), el('dd', money(rate)));
    cloud.append(rates);
    if (paid.description) cloud.append(el('p', paid.description));
  } else cloud.append(el('p', 'Pricing is not available from the studio service. Check current provider rates before using paid generation.'));
  grid.append(local, cloud); container.append(grid);
  const elevenlabs = pricing?.elevenlabs;
  if (elevenlabs) {
    const section = el('div', undefined, 'voice-pricing');
    section.append(el('h3', 'ElevenLabs · optional paid voice'), el('p', elevenlabs.description, 'price-disclaimer'));
    section.append(el('p', 'Available with local or OpenAI planning. Speech subscription charges are separate from planning and rendering; the OpenAI example above does not quote ElevenLabs usage.', 'price-disclaimer'));
    const sources = el('div', undefined, 'pricing-links');
    for (const [index, source] of (elevenlabs.sourceUrls || []).entries()) {
      try { const url = new URL(typeof source === 'string' ? source : source.url); if (url.protocol !== 'https:') continue; const link = el('a', typeof source === 'string' ? `ElevenLabs pricing${index ? ` ${index + 1}` : ''} ↗` : source.title || 'ElevenLabs pricing ↗'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; sources.append(link); } catch { /* Invalid source links are omitted. */ }
    }
    section.append(sources); container.append(section);
  } else if (selectedVoice()?.id === 'elevenlabs') container.append(el('p', 'ElevenLabs speech is billed separately at your account’s current plan rates. The OpenAI example above does not quote ElevenLabs charges.', 'price-disclaimer'));
  container.append(el('p', paid?.estimateDescription || 'Illustrative estimates, not quotes or spending caps. Actual charges depend on the selected model, input and output tokens, spoken duration, review passes, and retries. Changing the target length or model can change the cost.', 'price-disclaimer'));
  if (pricing?.checkedAt) container.append(el('p', `USD · rates checked ${pricing.checkedAt}. Provider pricing can change.`, 'price-disclaimer'));
  const links = el('div', undefined, 'pricing-links');
  for (const [index, source] of (paid?.sourceUrls || []).entries()) {
    try { const url = new URL(typeof source === 'string' ? source : source.url); if (url.protocol !== 'https:') continue; const link = el('a', typeof source === 'string' ? `Official pricing source ${index + 1} ↗` : source.title || `Pricing source ${index + 1} ↗`); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; links.append(link); } catch { /* Invalid source links are omitted. */ }
  }
  container.append(links);
}
function briefTitle(job) { return job.lesson?.title || (typeof job.brief === 'string' ? job.brief : job.brief?.text) || 'Untitled lesson'; }
function renderLibrary() {
  const library = $('library'); library.replaceChildren();
  if (!state.jobs.length) { library.append(el('p', 'Your first lesson starts here. Give an idea a little room to grow.', 'library-empty')); return; }
  for (const job of state.jobs) {
    const button = el('button', undefined, `library-item${job.id === state.selected ? ' active' : ''}`); button.type = 'button';
    if (job.id === state.selected) button.setAttribute('aria-current', 'page');
    const title = briefTitle(job); button.title = title;
    button.append(el('strong', title.length > 72 ? `${title.slice(0, 69)}…` : title));
    const date = new Date(job.createdAt); const status = exportReady(job) ? 'Ready for review' : job.status;
    const label = authoredBenchmark(job) ? `Authored benchmark · ${status}` : status;
    button.append(el('small', `${generationName(job)} · ${label || 'Draft'}${Number.isNaN(date.valueOf()) ? '' : ` · ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}`));
    button.addEventListener('click', () => selectJob(job.id)); library.append(button);
  }
}
function updateJob(job) {
  const index = state.jobs.findIndex((entry) => entry.id === job.id);
  if (index < 0) state.jobs.unshift(job); else state.jobs[index] = { ...state.jobs[index], ...job };
  renderLibrary();
  if (state.selected === job.id) renderJob(job);
}
function showComposer() {
  resetNarrationControl();
  state.selected = null; state.revision = ''; clearTimeout(state.timer);
  $('compose-view').hidden = false; $('job-view').hidden = true; renderLibrary(); $('brief').focus();
  history.replaceState(null, '', location.pathname);
}
async function selectJob(id) {
  resetNarrationControl();
  state.selected = id; state.revision = ''; state.resultKey = ''; clearTimeout(state.timer);
  $('compose-view').hidden = true; $('job-view').hidden = false;
  $('job-title').textContent = 'Opening your lesson…'; $('job-status').textContent = 'Loading the saved lesson.';
  $('job-error').hidden = true; $('result').hidden = true; $('lesson-detail').hidden = true; $('quality-section').hidden = true; $('benchmark-note').hidden = true;
  $('events').replaceChildren(); $('downloads').replaceChildren(); $('stage-list').replaceChildren(); $('cancel').hidden = true; $('retry').hidden = true;
  $('progress').value = 0; $('progress-label').textContent = '0%'; $('job-brief').textContent = '';
  $('job-generation').textContent = '';
  history.replaceState(null, '', `#lesson=${encodeURIComponent(id)}`); renderLibrary();
  $('job-title').focus();
  await pollJob();
}
async function pollJob() {
  const id = state.selected;
  if (!id) return;
  try {
    const { job } = await api(`/api/jobs/${encodeURIComponent(id)}`);
    if (state.selected !== id) return;
    updateJob(job);
    if (active(job)) state.timer = setTimeout(pollJob, 2000);
  } catch (error) {
    if (state.selected !== id) return;
    $('job-status').textContent = `Connection interrupted. ${error.message} Reconnecting…`;
    state.timer = setTimeout(pollJob, 5000);
  }
}
function renderJob(job) {
  const signature = JSON.stringify([job.updatedAt, job.status, job.stage, job.progress, job.message, job.error, job.report?.origin, job.report?.status]);
  if (state.revision === signature) return;
  state.revision = signature;
  const authored = authoredBenchmark(job), ready = exportReady(job);
  $('benchmark-note').hidden = !authored;
  $('job-title').textContent = job.lesson?.title || (ready ? (authored ? 'Authored animation benchmark' : 'Your lesson is ready.') : 'An idea becomes a lesson.');
  $('job-brief').textContent = typeof job.brief === 'string' ? job.brief : job.brief?.text || '';
  $('job-generation').textContent = `Generation version: ${generationName(job)}`;
  $('job-status').textContent = ready ? (authored ? 'Authored benchmark export complete · educator review needed' : 'Export complete · educator review needed') : job.message || `Lesson ${job.status}`;
  $('video').setAttribute('aria-label', authored ? 'Authored animation benchmark preview' : 'Generated lesson preview');
  const progress = Math.max(0, Math.min(100, Number(job.progress) || 0));
  $('progress').value = progress; $('progress').textContent = `${progress}%`; $('progress-label').textContent = `${progress}%`;
  const jobStages = job.brief?.generationVersion === 'open-source' || job.generationVersion === 'open-source' || job.stage === 'footage' ? [...stages.slice(0, 3), ['footage', 'Generate footage'], ...stages.slice(3)] : stages;
  const current = jobStages.findIndex(([id]) => id === job.stage);
  $('stage-list').classList.toggle('stages-open-source', jobStages.length > stages.length);
  $('stage-label').textContent = ready ? 'Ready for review' : jobStages[current]?.[1] || 'Preparing';
  $('stage-list').replaceChildren(...jobStages.map(([id, label], index) => {
    const complete = ready || index < current;
    const stageLabel = authored && id === 'plan' ? 'Authored script' : authored && id === 'review' ? 'Script review' : label;
    const li = el('li', `${complete ? '✓ ' : `${index + 1}. `}${stageLabel}`, complete ? 'done' : id === job.stage ? 'current' : '');
    if (id === job.stage && active(job)) li.setAttribute('aria-current', 'step');
    return li;
  }));
  $('job-error').textContent = typeof job.error === 'string' ? job.error : job.error?.message || '';
  $('job-error').hidden = !$('job-error').textContent;
  $('retry').hidden = !['failed', 'interrupted'].includes(job.status); $('cancel').hidden = !active(job);
  $('events').replaceChildren(...(job.events || []).map((event) => {
    const li = el('li'); const when = new Date(event.at); const time = el('time', Number.isNaN(when.valueOf()) ? '' : when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
    if (!Number.isNaN(when.valueOf())) time.dateTime = when.toISOString();
    li.append(time, el('span', event.message)); return li;
  }));
  renderLesson(job.lesson);
  renderReport(job.report);
  const resultKey = JSON.stringify(job.artifacts || {});
  if (resultKey !== state.resultKey || !ready) {
    state.resultKey = resultKey;
    const src = safeArtifact(job.artifacts?.video);
    $('result').hidden = !(ready && src);
    if (ready && src) {
      resetNarrationControl();
      const video = $('video'); video.src = src; video.replaceChildren();
      const captions = safeArtifact(job.artifacts?.captions);
      if (captions) { const track = el('track'); track.kind = 'captions'; track.srclang = 'en'; track.label = 'English (also shown in video)'; track.src = captions; video.append(track); }
      const names = { video: 'Download video', captions: 'Captions', transcript: 'Transcript', lesson: 'Lesson plan', prompts: 'Generation prompts', composition: 'Composition source', renderPlan: 'Render plan', footage: 'Footage provenance', report: 'Quality report' };
      $('downloads').replaceChildren();
      for (const [key, name] of Object.entries(names)) {
        const href = safeArtifact(job.artifacts?.[key]); if (!href) continue;
        const link = el('a', name); link.href = href; link.download = ''; $('downloads').append(link);
      }
    }
  }
}
function renderLesson(lesson) {
  $('lesson-detail').hidden = !lesson;
  if (!lesson) return;
  $('lesson-concept').textContent = typeof lesson.concept === 'string' ? lesson.concept : [lesson.concept?.hook, lesson.concept?.analogy, lesson.concept?.arc].filter(Boolean).join(' ');
  $('objectives').replaceChildren(...(lesson.objectives || []).map((objective) => el('li', text(objective))));
  const warnings = [...(lesson.curriculum?.warnings || []), ...(lesson.quality?.warnings || [])];
  $('curriculum-warnings').replaceChildren();
  if (warnings.length) {
    const box = el('div', undefined, 'notice'); box.append(el('strong', 'Review notes'));
    for (const warning of warnings) box.append(el('p', text(warning)));
    $('curriculum-warnings').append(box);
  }
  const scenes = lesson.scenes || []; $('scene-count').textContent = `${scenes.length} scenes`;
  $('storyboard').replaceChildren(...scenes.map((scene, index) => {
    const row = el('article', undefined, 'scene'); row.append(el('span', String(index + 1).padStart(2, '0'), 'scene-number'));
    const body = el('div', undefined, 'scene-content'); const heading = el('div', undefined, 'scene-heading');
    heading.append(el('h3', scene.title || scene.beat || `Scene ${index + 1}`));
    const meta = [scene.beat, scene.pauseSeconds ? `${scene.pauseSeconds}s ${scene.beat === 'question' ? 'thinking pause' : 'pause'}` : ''].filter(Boolean).join(' · ');
    if (meta) heading.append(el('span', meta, 'scene-timing'));
    body.append(heading);
    if (scene.beat === 'question') body.append(el('p', 'Question prompt'));
    else if (scene.visual?.label) body.append(el('p', scene.visual.label));
    const details = el('details'); details.append(el('summary', 'Read narration'), el('p', scene.narration || 'Narration is being prepared.'));
    body.append(details); row.append(body); return row;
  }));
}
function renderReport(report) {
  $('quality-section').hidden = !report;
  if (!report) return;
  const container = $('quality-report'); container.replaceChildren();
  container.append(el('p', 'Automated checks cover the export and lesson structure. They do not replace an educator’s review.', 'muted'));
  if (report.voice) {
    const voice = report.voice;
    const parts = typeof voice === 'string' ? [voice] : [voice.provider, voice.voice, voice.model, voice.tier || voice.quality?.tier || (typeof voice.quality === 'string' ? voice.quality : '')].filter(Boolean);
    container.append(el('p', `Narration used: ${parts.join(' · ')}`, 'voice-metadata'));
  }
  if (Array.isArray(report.checks)) {
    const list = el('ul', undefined, 'objectives');
    for (const check of report.checks) list.append(el('li', `${check.passed ? 'Passed' : 'Needs attention'} — ${check.name}${check.detail ? `: ${check.detail}` : ''}`));
    container.append(list);
  }
  if (Array.isArray(report.coverage) && report.coverage.length) {
    container.append(el('h3', 'Objective coverage'));
    const list = el('ul', undefined, 'objectives');
    for (const objective of report.coverage) list.append(el('li', `${objective.text} — ${objective.explained ? 'explained' : 'explanation missing'}, ${objective.practised ? 'practised' : 'practice missing'}`));
    container.append(list);
  }
  for (const warning of report.warnings || []) container.append(el('p', text(warning), 'notice'));
}
async function loadLibrary() { const { jobs } = await api('/api/jobs'); state.jobs = Array.isArray(jobs) ? jobs : []; renderLibrary(); }
async function initialize() {
  const results = await Promise.allSettled([api('/api/config'), loadLibrary()]);
  if (results[0].status === 'fulfilled') {
    state.config = results[0].value;
    renderAvatars(state.config.avatars || []);
    $('lesson-treatment').textContent = [state.config.animation?.name, state.config.animation?.description].filter(Boolean).join(' · ');
    $('lesson-treatment').hidden = !$('lesson-treatment').textContent;
    state.generationVersion = state.config.defaults?.generationVersion || 'classic';
    if (openSource()) state.provider = 'local';
    renderGenerationVersion();
    renderLibrary();
    state.capabilityWarning = Object.entries(state.config.capabilities || {}).filter(([, capability]) => capability.available === false).map(([name, capability]) => `${name.charAt(0).toUpperCase() + name.slice(1)} unavailable: ${capability.detail || 'Check the local service setup.'}`).join(' ');
    notice(openSource() ? '' : state.capabilityWarning);
  } else { notice(`The studio service is unavailable. ${results[0].reason.message} Use Refresh to reconnect.`); }
  if (results[1].status === 'rejected') notice(`Your lesson library could not load. ${results[1].reason.message} Use Refresh to retry.`);
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.get('lesson') && !state.selected) await selectJob(params.get('lesson'));
}
function updateBrief() {
  $('brief-count').textContent = `${$('brief').value.length.toLocaleString()} / 5,000`;
  const brief = `${$('brief').value} ${$('audience').value}`;
  const mismatch = /\bigcse\b/i.test(brief) && /\b(?:(?:grade|year|stage)\s*5|5th\s*(?:grade|year))\b/i.test(brief);
  $('curriculum-hint').hidden = !mismatch;
  $('curriculum-hint').textContent = mismatch ? 'A quick curriculum check: IGCSE is normally for ages 14–16; Grade 5 usually means primary school. This draft will use the primary learner level and flag the assumption. Add a curriculum reference below to guide the lesson; official syllabus alignment remains unverified.' : '';
}
$('brief').addEventListener('input', updateBrief);
$('audience').addEventListener('input', updateBrief);
$('play-narration').addEventListener('click', async () => {
  const video = $('video'), attempt = ++playbackAttempt;
  playerFeedbackActive = true; $('play-narration').disabled = true;
  playbackStatus('Starting playback with player sound enabled…');
  try {
    video.muted = false; video.volume = 1;
    await video.play();
    if (attempt === playbackAttempt) reflectPlayback();
  } catch (error) {
    if (attempt !== playbackAttempt) return;
    playerFeedbackActive = false;
    playbackStatus(error.name === 'AbortError' ? 'Playback was interrupted. Press Play with narration when you are ready.' : 'The browser could not start playback. Try the video’s play control or download the video to play it in another player.', true);
  } finally { if (attempt === playbackAttempt) $('play-narration').disabled = false; }
});
for (const event of ['playing', 'pause', 'volumechange', 'ended']) $('video').addEventListener(event, reflectPlayback);
$('voice-provider').addEventListener('change', updateVoice);
$('generation-version').addEventListener('change', () => {
  if ($('model').value.trim()) state.providerModels[modelKey()] = $('model').value.trim();
  state.generationVersion = $('generation-version').value;
  if (openSource()) state.provider = 'local';
  renderGenerationVersion();
});
$('duration').addEventListener('input', () => { const minutes = Number($('duration').value) / 60; $('duration-label').textContent = `${minutes} minute${minutes === 1 ? '' : 's'}`; });
document.querySelectorAll('[data-example]').forEach((button) => button.addEventListener('click', () => { $('brief').value = button.dataset.example; $('brief').dispatchEvent(new Event('input')); $('brief').focus(); }));
$('new-lesson').addEventListener('click', showComposer); $('back-compose').addEventListener('click', showComposer);
$('refresh').addEventListener('click', async () => {
  $('refresh').disabled = true;
  try {
    if (!state.config) await initialize();
    else {
      const voice = $('voice-provider').value;
      if ($('model').value.trim()) state.providerModels[modelKey()] = $('model').value.trim();
      const [config] = await Promise.all([api('/api/config'), loadLibrary()]);
      state.config = config;
      state.capabilityWarning = Object.entries(config.capabilities || {}).filter(([, capability]) => capability.available === false)
        .map(([name, capability]) => `${name.charAt(0).toUpperCase() + name.slice(1)} unavailable: ${capability.detail || 'Check the local service setup.'}`).join(' ');
      renderGenerationVersion();
      if ([...$('voice-provider').options].some(option => option.value === voice)) { $('voice-provider').value = voice; updateVoice(); }
    }
  }
  catch (error) { notice(`The library could not refresh. ${error.message}`); }
  finally { $('refresh').disabled = false; }
});
$('lesson-form').addEventListener('submit', async (event) => {
  event.preventDefault(); fail('');
  const values = new FormData(event.currentTarget);
  const payload = { text: String(values.get('text') || '').trim(), generationVersion: state.generationVersion, provider: String(values.get('provider') || state.provider), targetSeconds: Number(values.get('targetSeconds')), avatar: String(values.get('avatar') || state.config?.avatars?.[0]?.id || 'mira') };
  for (const field of ['audience', 'model', 'curriculumSource', 'voiceProvider']) { const value = String(values.get(field) || '').trim(); if (value) payload[field] = value; }
  if (payload.text.length < 10) { fail('Describe your lesson in at least 10 characters so the teaching plan has enough context.'); return; }
  if (!canGenerate()) { fail('Choose an available generation option or finish its server setup first.'); return; }
  $('generate').disabled = true; $('generate').textContent = 'Starting your lesson…';
  try { const { job } = await api('/api/jobs', { method: 'POST', body: JSON.stringify(payload) }); updateJob(job); await selectJob(job.id); }
  catch (error) { fail(error.message); }
  finally { $('generate').disabled = !canGenerate(); $('generate').textContent = 'Create my lesson ↗'; }
});
for (const action of ['retry', 'cancel']) {
  $(action).addEventListener('click', async () => {
    const id = state.selected; if (!id) return;
    $(action).disabled = true; clearTimeout(state.timer);
    try { const { job } = await api(`/api/jobs/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: '{}' }); if (state.selected === id) { state.revision = ''; updateJob(job); if (active(job)) state.timer = setTimeout(pollJob, 1000); } }
    catch (error) { if (state.selected === id) { $('job-error').textContent = error.message; $('job-error').hidden = false; state.timer = setTimeout(pollJob, 2000); } }
    finally { $(action).disabled = false; }
  });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.selected) { clearTimeout(state.timer); pollJob(); } });
initialize();
