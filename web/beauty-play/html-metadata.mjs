import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

// Generic game metadata only. Never embed invitation IDs, answers, or private notes.
// No canonical/og:url is added: the original share URL (including its query) stays
// distinct instead of being collapsed onto one generic game URL by a static shell.
export function englishGameHtml(html) {
  const replacements = [
    [/<html lang="ko">/, '<html lang="en">'],
    [/<title>[^<]*<\/title>/, '<title>Let Me Pick · Seoul Beauty</title>'],
    [/<meta name="description" content="[^"]*">/, '<meta name="description" content="Recommend a product for a friend from a painting. Invite a friend to compare your choices.">'],
    [/<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="Let Me Pick">'],
    [/<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="Make your pick, then reveal and compare your friend’s choice.">'],
  ];
  for (const [pattern,value] of replacements) {
    if (!pattern.test(html)) throw Error('Required game HTML metadata is missing');
    html = html.replace(pattern,value);
  }
  return html;
}
export function localizedGameMetadata() {
  let outputDirectory;
  return {
    name:'localized-game-static-metadata', apply:'build',
    configResolved(config) { outputDirectory = config.build.outDir; },
    async closeBundle() {
      const html = await readFile(join(outputDirectory,'index.html'),'utf8');
      await writeFile(join(outputDirectory,'index.en.html'),englishGameHtml(html));
    },
  };
}
