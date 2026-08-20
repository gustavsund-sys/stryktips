import { updateCurrentRound } from './index';

updateCurrentRound()
  .then((result) => { console.log(JSON.stringify(result)); if (!result.published) process.exitCode = 2; })
  .catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
