import { updateExpertStats } from './index';

updateExpertStats()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
