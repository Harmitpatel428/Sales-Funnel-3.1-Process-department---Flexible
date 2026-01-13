import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import AzureAD from "next-auth/providers/azure-ad"
import Okta from "next-auth/providers/okta"
import { loginWithSSO, SSOProfile } from "@/lib/auth"
import { cookies } from 'next/headers'

export const { handlers, auth, signIn, signOut } = NextAuth({
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }),
        AzureAD({
            clientId: process.env.AZURE_AD_CLIENT_ID,
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
            tenantId: process.env.AZURE_AD_TENANT_ID,
        }),
        Okta({
            clientId: process.env.OKTA_CLIENT_ID,
            clientSecret: process.env.OKTA_CLIENT_SECRET,
            issuer: process.env.OKTA_ISSUER,
        })
    ],
    callbacks: {
        async signIn({ user, account, profile }) {
            if (!user.email || !account) return false;

            // Map to SSOProfile
            const ssoProfile: SSOProfile = {
                email: user.email,
                name: user.name || undefined,
                image: user.image || undefined,
                provider: account.provider.toUpperCase(), // 'google' -> 'GOOGLE'
                providerId: account.providerAccountId,
            };

            try {
                // Get tenant context if needed
                const cookieStore = await cookies();
                const tenantId = cookieStore.get('login_tenant_id')?.value;

                // This will create/find user and set our custom session cookie
                await loginWithSSO(ssoProfile, tenantId);
                return true;
            } catch (error) {
                console.error("SSO Login Error:", error);
                return false;
            }
        },
        async session({ session, token }) {
            return session;
        }
    },
})

export const { GET, POST } = handlers
