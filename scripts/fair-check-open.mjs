import { fairServerConfig } from '../src/fair-server.mjs';

const config = await fairServerConfig(process.env);
const version = config.generationVersions.find(item => item.id === 'open-source');
console.log(JSON.stringify({ version: version.id, available: version.available, blockers: version.blockers,
  voices: config.voiceOptions.filter(item => ['qwentts', 'piper', 'kokoro'].includes(item.id)).map(item => ({ id: item.id, available: item.openSourceAvailable })) }, null, 2));
if (!version.available) process.exitCode = 1;
