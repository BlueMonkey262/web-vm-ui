// Small Auth0 SPA helper: loads the SDK, initializes client, handles redirects.
// Exposes:
//  - window.authInitPromise  (resolves once client initialized)
//  - window.ensureAuthenticated() -> redirects to login if not authenticated
//  - window.authGetToken() -> returns access token (or throws / redirects)
//  - window.login(), window.logout(), window.getUser()
(function () {
  const AUTH0_DOMAIN = "dev-7hixvbszm3u7txyc.us.auth0.com";
  const AUTH0_CLIENT_ID = "p0c1sTr0UwzxfVcnWUoRblxIyg9xCRYn";

  // ensure SDK is loaded
  function loadSdk() {
    if (window.createAuth0Client) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.auth0.com/js/auth0-spa-js/1.22/auth0-spa-js.production.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
  }

  window.authInitPromise = (async function init() {
    await loadSdk();
    // createAuth0Client is provided by SDK
    window._auth0 = await createAuth0Client({
      domain: AUTH0_DOMAIN,
      client_id: AUTH0_CLIENT_ID,
      cacheLocation: "localstorage",
      useRefreshTokens: true,
    });

    // handle redirect callback if present in URL
    if (window.location.search.includes("code=") && window.location.search.includes("state=")) {
      try {
        await window._auth0.handleRedirectCallback();
      } catch (e) {
        console.warn("Auth0 redirect handling failed:", e);
      } finally {
        // remove query params
        history.replaceState({}, document.title, location.pathname + location.hash);
      }
    }

    // helpers
    window.authGetToken = async function () {
      try {
        return await window._auth0.getTokenSilently();
      } catch (err) {
        // fallback: try to obtain token via redirect (this will redirect away)
        console.warn("getTokenSilently failed, redirecting to login:", err);
        await window._auth0.loginWithRedirect({ redirect_uri: window.location.href });
        return null; // unreachable in normal flow
      }
    };

    window.ensureAuthenticated = async function () {
      try {
        const isAuth = await window._auth0.isAuthenticated();
        if (!isAuth) {
          await window._auth0.loginWithRedirect({ redirect_uri: window.location.href });
        }
        return true;
      } catch (e) {
        console.warn("ensureAuthenticated failed:", e);
        // attempt redirect to login as a fallback
        try { await window._auth0.loginWithRedirect({ redirect_uri: window.location.href }); } catch (_) {}
        return false;
      }
    };

    window.login = function () { return window._auth0.loginWithRedirect({ redirect_uri: window.location.href }); };
    window.logout = function () { return window._auth0.logout({ returnTo: window.location.origin }); };
    window.getUser = async function () { return window._auth0.getUser(); };

    // New helper: returns an array of role strings found on the user profile or id token (robust to several claim locations)
    window.getUserRoles = async function () {
      try {
        // ensure client ready
        if (window.authInitPromise) await window.authInitPromise;

        const roles = new Set();

        // 1) roles from user profile
        try {
          const user = await window.getUser();
          if (user) {
            const candidates = ['roles', 'role', 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'];
            for (const k of candidates) {
              if (user[k]) {
                if (Array.isArray(user[k])) user[k].forEach(r => roles.add(String(r)));
                else roles.add(String(user[k]));
              }
            }
            // custom namespaced claims under user profile
            for (const key of Object.keys(user)) {
              if (key.toLowerCase().includes('role') && Array.isArray(user[key])) {
                user[key].forEach(r => roles.add(String(r)));
              }
            }
            if (user.app_metadata && user.app_metadata.roles) {
              const a = user.app_metadata.roles;
              if (Array.isArray(a)) a.forEach(r => roles.add(String(r)));
              else roles.add(String(a));
            }
            if (user.user_metadata && user.user_metadata.roles) {
              const a = user.user_metadata.roles;
              if (Array.isArray(a)) a.forEach(r => roles.add(String(r)));
              else roles.add(String(a));
            }
          }
        } catch (e) {
          // ignore profile read errors but continue to check token claims
        }

        // 2) roles from ID token claims (sometimes roles are only in ID token)
        try {
          const claims = await window._auth0.getIdTokenClaims();
          if (claims && typeof claims === 'object') {
            for (const key of Object.keys(claims)) {
              const val = claims[key];
              if (!val) continue;
              // If claim key includes 'role' or is an array with role-like entries, add them
              if (key.toLowerCase().includes('role')) {
                if (Array.isArray(val)) val.forEach(r => roles.add(String(r)));
                else roles.add(String(val));
              }
              // also handle namespaced claims that might be arrays of roles
              if (Array.isArray(val) && val.every(v => typeof v === 'string' && v.length < 64)) {
                // Heuristic: arrays of short strings could be roles; check key contains 'roles' or 'permissions'
                if (key.toLowerCase().includes('roles') || key.toLowerCase().includes('permissions') || key.toLowerCase().includes('groups')) {
                  val.forEach(r => roles.add(String(r)));
                }
              }
            }
          }
        } catch (e) {
          // ignore token claim read errors
        }

        return Array.from(roles);
      } catch (e) {
        console.warn("getUserRoles failed:", e);
        return [];
      }
    };

    // New helper: whether the current user has a specific role (awaits auth init)
    window.userHasRole = async function(role) {
      try {
        if (window.authInitPromise) await window.authInitPromise;
        const roles = await window.getUserRoles();
        return roles.some(r => String(r).toLowerCase() === String(role).toLowerCase());
      } catch (e) {
        console.warn("userHasRole failed:", e);
        return false;
      }
    };

    return window._auth0;
  })();
})();
