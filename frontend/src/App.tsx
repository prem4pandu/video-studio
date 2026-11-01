import { useEffect } from 'react';

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 5.5h14v13H5zM9 9l6 3-6 3z" /></svg></span>;
}

function Sidebar() {
  return <aside className="sidebar" aria-label="Lesson library">
    <a className="brand" href="./index.html" aria-label="Video Studio home"><BrandMark /><span>Video Studio<span className="brand-sub">LESSON PRODUCTION</span></span></a>
    <button className="new-lesson" id="new-lesson" type="button"><span aria-hidden="true">+</span> New lesson</button>
    <div className="library-heading"><h2>Your lessons</h2><button className="icon-button" id="refresh" type="button">Refresh</button></div>
    <div id="library" className="library"><p className="library-empty">Your first lesson starts here.<br />Give an idea a little room to grow.</p></div>
    <div className="sidebar-footer"><span className="local-dot" aria-hidden="true"></span><span>Local production workspace</span><p>Planning, production, and review<br />stay visible in one place.</p></div>
  </aside>;
}

function WorkflowDashboard() {
  return <section className="pipeline-dashboard" aria-labelledby="pipeline-dashboard-title">
    <div className="dashboard-heading"><div><p className="section-kicker">Production workflow</p><h2 id="pipeline-dashboard-title">How this lesson will be built</h2></div><span id="version-badge" className="recommendation-badge">Recommended</span></div>
    <div className="generation-layout">
      <div className="field generation-field"><label htmlFor="generation-version">Generation version</label><select id="generation-version" name="generationVersion" aria-describedby="generation-description generation-blockers"><option value="quality">KooBits-inspired teaching film</option></select><p id="generation-description" className="field-note"></p><div id="generation-blockers" className="notice setup-blockers" role="status" hidden></div></div>
      <aside className="evidence-summary" aria-labelledby="evidence-title"><p className="section-kicker">Teaching design</p><h3 id="evidence-title">Built around a learning loop</h3><p id="pedagogy-summary">A clear worked example, protected thinking time, guided practice, independent practice, and educator review.</p><dl className="evidence-metrics"><div><dt>Teaching pattern</dt><dd id="teaching-pattern">Concrete to visual to symbolic</dd></div><div><dt>Quality target</dt><dd id="quality-target">Readable, narrated, reviewable</dd></div></dl></aside>
    </div>
    <details className="pipeline-panel" open><summary><span><span className="section-kicker">Pipeline</span><strong id="pipeline-preview-title">What happens after you start</strong></span><span id="generation-summary">Each stage leaves a reviewable artifact.</span></summary><ol id="pipeline-preview" className="pipeline-preview"></ol></details>
    <div className="setup-panel" aria-labelledby="setup-title"><div><p className="section-kicker">Setup status</p><h3 id="setup-title">Ready to generate</h3><p id="setup-summary" role="status" aria-live="polite">Checking this workspace.</p></div><ul id="setup-list" className="setup-list"></ul></div>
  </section>;
}

function CreationGuide() {
  const steps = [
    ['01', 'Define', 'Learning outcome'],
    ['02', 'Design', 'Teaching experience'],
    ['03', 'Produce', 'Voice and animation'],
    ['04', 'Review', 'Quality and release'],
  ];
  return <nav className="creation-guide" aria-label="Lesson creation stages">
    <div className="guide-heading"><span>Guided studio</span><strong>From brief to reviewed film</strong></div>
    <ol>{steps.map(([number, title, detail], index) => <li className={index === 0 ? 'active' : ''} aria-current={index === 0 ? 'step' : undefined} key={number}><span>{number}</span><div><strong>{title}</strong><small>{detail}</small></div></li>)}</ol>
  </nav>;
}

function ComposeView() {
  return <section id="compose-view" aria-labelledby="compose-title">
    <div className="mobile-flow-head" aria-hidden="true"><span>NEW LESSON</span><strong>Shape the experience</strong><div><i className="done"></i><i className="active"></i><i></i><i></i></div></div>
    <CreationGuide />
    <div className="intro studio-intro"><div><p className="eyebrow">New production</p><h1 id="compose-title">Create a lesson film</h1><p className="intro-copy">Start with what learners should understand. The studio turns it into a teachable sequence, directs every scene, and verifies the finished film before review.</p></div><aside className="studio-readiness" aria-label="Studio readiness"><span aria-hidden="true"></span><div><strong>KooBits-inspired teaching structure</strong><small>Local planning · timed narration · educator gates</small></div></aside></div>
    <div id="connection-notice" className="notice" role="status" hidden></div>
    <form id="lesson-form">
      <div className="brief-column">
        <div className="composer"><div className="field-heading"><label htmlFor="brief">Lesson brief</label><span className="required-note">Required</span></div><textarea id="brief" name="text" required minLength={10} maxLength={5000} rows={4} placeholder="What should learners understand? Include the subject, age or grade, examples, and the kind of experience you want."></textarea><div className="composer-foot"><span>Outcome, learner level, and teaching approach.</span><span id="brief-count">0 / 5,000</span></div></div>
        <div id="curriculum-hint" className="notice" role="status" hidden></div>
        <div className="examples"><span>Start with an example</span><button type="button" data-example="Teach place value to Grade 5 learners. Show how a digit changes value in different positions, use everyday examples, and finish with a short challenge.">Place value</button><button type="button" data-example="Explain the water cycle to 9-year-olds through the journey of a single raindrop. Include evaporation, condensation, precipitation, and a quick check for understanding.">Water cycle</button></div>
        <div className="lesson-settings"><div className="field"><label htmlFor="audience">Learners <span>Optional</span></label><input id="audience" name="audience" maxLength={240} placeholder="e.g. Grade 5 · ages 10–11" /></div><div className="field duration-field"><label htmlFor="duration">Target length <output id="duration-label" htmlFor="duration">3 minutes</output></label><input id="duration" name="targetSeconds" type="range" min="60" max="600" defaultValue="180" step="30" /><div className="range-labels"><span>1 min</span><span>10 min</span></div></div></div>
      </div>
      <div className="form-divider"></div>
      <WorkflowDashboard />
      <fieldset id="instructor-field" className="instructor-field"><legend>Visual presenter <span>Optional · clean canvas recommended</span></legend><div id="avatars" className="avatar-grid"><p className="muted">Loading presenter presets…</p></div><p id="lesson-treatment" className="field-note" hidden></p></fieldset>
      <fieldset id="provider-field" className="provider-field"><legend>AI lesson planner</legend><div id="providers" className="provider-grid"><p className="muted">Loading generation options…</p></div><p id="provider-status" className="field-note" role="status"></p></fieldset>
      <div id="voice-field" className="field voice-field" hidden><label htmlFor="voice-provider">Narrator voice</label><select id="voice-provider" name="voiceProvider" aria-describedby="voice-status"></select><p id="voice-status" className="field-note" role="status"></p><audio id="voice-sample" controls preload="none" aria-label="Selected narrator voice sample" hidden></audio></div>
      <details id="pricing-section" className="pricing-section"><summary>Generation costs <span id="cost-summary">Compare local and paid options</span></summary><div id="pricing-detail"></div></details>
      <details className="advanced"><summary>Fine-tune the lesson <span>Curriculum &amp; generation</span></summary><div className="advanced-fields"><div className="field"><label htmlFor="curriculum">Curriculum reference <span>Optional</span></label><textarea id="curriculum" name="curriculumSource" rows={3} maxLength={10000} placeholder="Paste the relevant learning objectives or source excerpt. Include its title and URL if available."></textarea><p className="field-note">Without a supplied source, curriculum alignment remains unverified.</p></div><div className="field"><label id="model-label" htmlFor="model">Local language model</label><input id="model" name="model" defaultValue="gemma3:12b" list="model-options" maxLength={100} /><datalist id="model-options"></datalist><p id="model-hint" className="field-note">Use a model installed in your local generation service.</p></div></div></details>
      <div id="form-error" className="error-message" role="alert" tabIndex={-1} hidden></div>
      <div className="submit-row"><p><strong>Ready for production?</strong><br /><span>You will review the lesson, prompts, timing, and quality report before approval.</span></p><button id="generate" type="submit" className="button primary" disabled>Generate quality lesson <span aria-hidden="true">→</span></button></div>
    </form>
  </section>;
}

function InspectorWorkspace() {
  return <section id="lesson-workspace" className="lesson-workspace" hidden aria-labelledby="lesson-workspace-title">
    <div className="workspace-heading"><div><p className="section-kicker">Storyboard canvas</p><h2 id="lesson-workspace-title">Direct the generated lesson</h2></div><span id="scene-count"></span></div>
    <div className="inspector-tabs" role="tablist" aria-label="Lesson content"><button id="plan-tab" type="button" role="tab" aria-selected="true" aria-controls="plan-panel" data-inspector-tab="plan">Teaching plan</button><button id="script-tab" type="button" role="tab" aria-selected="false" aria-controls="script-panel" data-inspector-tab="script" tabIndex={-1}>Narration script</button><button id="prompts-tab" type="button" role="tab" aria-selected="false" aria-controls="prompts-panel" data-inspector-tab="prompts" tabIndex={-1}>Prompts</button></div>
    <section id="plan-panel" className="inspector-panel" role="tabpanel" aria-labelledby="plan-tab"><div id="lesson-detail" className="lesson-detail"><p id="lesson-concept"></p><div id="curriculum-warnings"></div><h3 className="content-heading">Learning objectives</h3><ul id="objectives" className="objectives"></ul><h3 className="content-heading">Scene plan</h3><div id="storyboard" className="storyboard"></div></div></section>
    <section id="script-panel" className="inspector-panel" role="tabpanel" aria-labelledby="script-tab" hidden><div id="narration-script"></div></section>
    <section id="prompts-panel" className="inspector-panel" role="tabpanel" aria-labelledby="prompts-tab" hidden><div id="prompt-viewer" className="prompt-viewer"><p className="empty-detail">The exact generation prompts appear here after planning and export complete.</p></div></section>
  </section>;
}

function JobView() {
  return <section id="job-view" hidden aria-labelledby="job-title">
    <div className="production-mode-switch" aria-label="Workspace mode"><span>Production workspace</span><div><button type="button" data-mode="storyboard" aria-pressed="true">Storyboard</button><button type="button" data-mode="advanced" aria-pressed="false">Advanced</button></div></div>
    <button id="back-compose" type="button" className="text-button">← Back to studio</button><p className="eyebrow">Production monitor</p><h1 id="job-title" className="job-title" tabIndex={-1}>Creating your lesson</h1><p id="job-brief" className="intro-copy"></p><p id="job-generation" className="field-note"></p>
    <div id="benchmark-note" className="review-note" hidden><span className="review-label">AUTHORED ANIMATION BENCHMARK</span><p>Script authored and reviewed separately. This demonstrates rendering and narration, not automatic planning success.</p></div>
    <section className="production-progress" aria-labelledby="production-progress-title"><div className="progress-heading"><div><p className="section-kicker">Live production</p><h2 id="production-progress-title"><span id="stage-label">Preparing</span></h2></div><strong id="progress-label">0%</strong></div><div className="progress-track"><progress id="progress" max="100" value="0">0%</progress></div><p id="job-status" className="job-status" role="status" aria-live="polite" aria-atomic="true"></p><ol id="stage-list" className="stages" aria-label="Generation timeline"></ol></section>
    <div id="job-error" className="error-message" role="alert" hidden></div><div className="job-actions"><button id="retry" className="button secondary" type="button" hidden>Try again</button><button id="cancel" className="text-button" type="button" hidden>Stop generation</button></div>
    <div className="storyboard-production-grid"><div className="preview-column"><div id="result" hidden><div className="review-note"><span className="review-label">EDUCATOR REVIEW</span><p>Your video is ready to review. Check explanations, examples, pacing, and curriculum fit before sharing.</p></div><video id="video" controls playsInline preload="metadata" aria-label="Generated lesson preview"></video><div className="narration-controls"><button id="play-narration" className="button secondary" type="button" aria-controls="video" aria-describedby="playback-status">Play with narration</button><p id="playback-status" className="field-note" role="status" aria-live="polite" aria-atomic="true">Enables player sound at full volume. Your browser tab and device control the final audio output.</p></div><div id="downloads" className="downloads" aria-label="Download lesson materials"></div></div></div><InspectorWorkspace /></div>
    <section id="quality-section" className="quality-section" hidden aria-labelledby="quality-report-title"><div className="section-heading"><div><p className="section-kicker">Quality gates</p><h2 id="quality-report-title">What passed, what needs review</h2></div><span id="quality-gate-summary"></span></div><div id="quality-report"></div></section>
    <details className="activity"><summary>Generation activity</summary><ol id="events"></ol></details>
  </section>;
}

export function App() {
  useEffect(() => {
    document.documentElement.classList.add('react-studio');
    const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-mode]')];
    const chooseMode = (mode: string) => {
      document.body.dataset.workspaceMode = mode;
      for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    };
    for (const button of modeButtons) button.addEventListener('click', () => chooseMode(button.dataset.mode || 'storyboard'));
    chooseMode(localStorage.getItem('video-studio-mode') || 'storyboard');
    for (const button of modeButtons) button.addEventListener('click', () => localStorage.setItem('video-studio-mode', button.dataset.mode || 'storyboard'));
    const controllerUrl = '/fair-studio.mjs';
    import(/* @vite-ignore */ controllerUrl);
  }, []);

  return <div className="studio-app"><a className="skip-link" href="#main">Skip to lesson studio</a><Sidebar /><main id="main"><header className="topbar"><span>LESSON PRODUCTION</span><nav><a className="workspace-tag" href="./curriculum.html">Curriculum</a><a className="workspace-tag" href="./ui-templates.html">Design direction</a></nav></header><div className="workspace"><ComposeView /><JobView /></div></main></div>;
}
