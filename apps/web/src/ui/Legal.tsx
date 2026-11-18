/**
 * Privacy policy and terms of use, shown in-app and at loodle.online/?page=privacy
 * and /?page=terms (app stores need a public privacy-policy address).
 *
 * These describe what the code actually does today. Update them whenever data
 * handling changes (a database, purchases, analytics, chat), and have them reviewed
 * before a store release.
 */

/** Set this to the address players should write to. Shown on both pages when set. */
export const CONTACT_EMAIL = '';

const UPDATED = '18 November 2026';

const contact = CONTACT_EMAIL ? (
  <p>
    Questions or requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
  </p>
) : (
  <p>A contact address for questions and requests will be published here.</p>
);

export function Privacy() {
  return (
    <div className="legal">
      <small>Last updated {UPDATED}</small>
      <h3>The short version</h3>
      <p>
        LOODLE has no ads, no analytics and no tracking. Your progress lives on your own device. The game server only
        holds what it needs to run an online match, and forgets it when the match ends.
      </p>
      <h3>Stored on your device</h3>
      <p>
        Your level, XP, coins, achievements, owned skins, settings, chosen name and picture, a saved offline match and a
        random player code are kept in your browser’s local storage. They never leave your device except as described
        below. Clearing this site’s data deletes them; we cannot restore them.
      </p>
      <h3>Online play</h3>
      <p>
        When you create or join a room, the server receives your chosen display name, picture choice and the random
        player code (so you can rejoin after a dropped connection). Other players in the room see your name and picture.
        Rooms are kept in memory only and are removed when they empty out or the server restarts. To limit abuse the
        server counts connections per network address for a short time; addresses are not stored or logged.
      </p>
      <h3>Signing in with Google</h3>
      <p>
        Signing in is optional. If you do, Google tells us your account ID and name. We keep them only in a signed
        session cookie on your device for up to 24 hours, so the server can recognise you. We do not receive or store
        your email address, and we have no account database. Signing in loads Google’s sign-in script, which is covered
        by Google’s own privacy policy.
      </p>
      <h3>Children</h3>
      <p>LOODLE has no chat and collects no contact details, so it can be played without sharing personal information.</p>
      <h3>Hosting</h3>
      <p>The game is served by Render (render.com). Like any web host, Render handles network traffic to deliver the site.</p>
      <h3>Changes</h3>
      <p>If accounts, purchases or other data handling are added, this page will be updated before they go live.</p>
      {contact}
    </div>
  );
}

export function Terms() {
  return (
    <div className="legal">
      <small>Last updated {UPDATED}</small>
      <h3>Playing LOODLE</h3>
      <p>LOODLE is free to play. You are welcome to play it for your own enjoyment, alone or with friends.</p>
      <h3>Coins and items</h3>
      <p>
        Coins, XP, levels, skins and wagers are game features with no money value. They cannot be bought, sold, traded
        or exchanged for anything outside the game. Wagers only risk coins earned by playing. Because progress is stored
        on your device, it can be lost if you clear your browser data, and we may reset or rebalance it while the game
        is being developed.
      </p>
      <h3>Fair play and names</h3>
      <p>
        Don’t cheat, disrupt other players’ matches, flood the server, or use offensive or impersonating names. Names
        that break the rules are replaced with “Guest”. We may block access for abuse.
      </p>
      <h3>Availability</h3>
      <p>
        The game is provided as it is, while it is still being developed. Online play may be interrupted or changed at
        any time, and an online match can end if the server restarts.
      </p>
      {contact}
    </div>
  );
}
