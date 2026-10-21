// OLIVE YOUNG US affiliate links through Rakuten Advertising (LinkShare). Deep links are built locally:
// no API call, the publisher ID and the advertiser's MID come from the Rakuten dashboard.
export const searchPageUrl = q => 'https://us.oliveyoung.com/search?' + new URLSearchParams({q});

// u1 is Rakuten's member ID: it comes back in reports, so it carries the post/chat ref, never user data.
export function deeplink(url, {publisherId, mid, u1}) {
  const params = new URLSearchParams({id: publisherId, mid, murl: url});
  if (u1) params.set('u1', u1);
  return 'https://click.linksynergy.com/deeplink?' + params;
}
