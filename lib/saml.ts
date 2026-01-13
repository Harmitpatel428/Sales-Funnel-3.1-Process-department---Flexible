import jackson, { type IJacksonController, type JacksonOption } from '@boxyhq/saml-jackson';
import { prisma } from './db'; // Assuming access to prisma client

// Singleton to hold the controller
let apiController: IJacksonController;
let oauthController: any; // Type inference or explicit import

const opts: JacksonOption = {
    externalUrl: process.env.NEXTAUTH_URL || 'http://localhost:3000',
    samlPath: '/api/auth/saml',
    db: {
        engine: 'prisma',
        prisma: prisma,
    },
    // Ensure we use the schema provided/expected
};

export async function getJackson() {
    if (!apiController || !oauthController) {
        const ret = await jackson(opts);
        apiController = ret.apiController;
        oauthController = ret.oauthController;
    }
    return { apiController, oauthController };
}

/**
 * Handle SAML Login Initiation.
 * Uses Jackson's OAuth flow.
 */
export async function handleSAMLLogin(tenantId: string, state: string, product: string = 'sales-funnel') {
    const { oauthController } = await getJackson();

    // Create an OAuth authorization request
    // This constructs the redirect URL to the IdP
    const response = await oauthController.authorize({
        tenant: tenantId,
        product,
        state,
        redirect_uri: `${opts.externalUrl}/api/auth/saml/callback`,
        response_type: 'code',
    });

    return response.redirect_url;
}

/**
 * Handle SAML Response (Code Exchange).
 */
export async function handleSAMLCallback(code: string) {
    const { oauthController } = await getJackson();

    // Exchange code for profile
    const token = await oauthController.token({
        code,
        redirect_uri: `${opts.externalUrl}/api/auth/saml/callback`,
        grant_type: 'authorization_code',
        client_id: 'dummy', // Jackson might require these but for internal use usually ignored or fixed
        client_secret: 'dummy',
    });

    // Get user profile
    const { access_token } = token;
    const profile = await oauthController.userInfo(access_token);

    return profile;
}
