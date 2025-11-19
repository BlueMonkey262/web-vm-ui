// Auth0 Configuration
const AUTH0_DOMAIN = 'YOUR_AUTH0_DOMAIN';  // e.g., 'your-tenant.us.auth0.com'
const AUTH0_CLIENT_ID = 'YOUR_CLIENT_ID';
const AUTH0_REDIRECT_URI = window.location.origin;

let auth0Client = null;

// Initialize Auth0 client
async function initAuth0() {
    if (!auth0Client) {
        auth0Client = await auth0.createAuth0Client({
            domain: AUTH0_DOMAIN,
            clientId: AUTH0_CLIENT_ID,
            authorizationParams: {
                redirect_uri: AUTH0_REDIRECT_URI
            }
        });
    }
    return auth0Client;
}

// Check if user is authenticated, redirect to login if not
async function requireAuth() {
    const client = await initAuth0();

    // Handle the redirect callback from Auth0
    const query = window.location.search;
    if (query.includes('code=') && query.includes('state=')) {
        try {
            await client.handleRedirectCallback();
            // Clean up the URL
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (err) {
            console.error('Error handling redirect:', err);
            return false;
        }
    }

    // Check if already authenticated
    const isAuthenticated = await client.isAuthenticated();

    if (!isAuthenticated) {
        // Redirect to Auth0 login
        await client.loginWithRedirect();
        return false;
    }

    return true;
}

// Get user info
async function getUserInfo() {
    const client = await initAuth0();
    const isAuthenticated = await client.isAuthenticated();

    if (isAuthenticated) {
        return await client.getUser();
    }

    return null;
}

// Logout function
async function logout() {
    const client = await initAuth0();
    await client.logout({
        logoutParams: {
            returnTo: window.location.origin
        }
    });
}
