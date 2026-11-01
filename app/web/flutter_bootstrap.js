{{flutter_js}}
{{flutter_build_config}}

// Serve the renderer from this app, including when hosted below /app/.
// A failed engine startup must leave an actionable message rather than a blank page.
const studioStartup = document.getElementById('studio-startup');
function studioStartupFailed(error) {
  console.error('Video Studio startup failed', error);
  if (studioStartup) {
    studioStartup.hidden = false;
    studioStartup.textContent = 'Video Studio could not start in this browser. Reload the page, or try a current version of Chrome or Safari. Details are available in the browser console.';
    studioStartup.setAttribute('role', 'alert');
  }
}
_flutter.loader.load({
  config: { canvasKitBaseUrl: new URL('canvaskit/', document.baseURI).toString() },
  onEntrypointLoaded: async function(engineInitializer) {
    try {
      const appRunner = await engineInitializer.initializeEngine();
      await appRunner.runApp();
      if (studioStartup) studioStartup.hidden = true;
    } catch (error) {
      studioStartupFailed(error);
    }
  }
}).catch(studioStartupFailed);
