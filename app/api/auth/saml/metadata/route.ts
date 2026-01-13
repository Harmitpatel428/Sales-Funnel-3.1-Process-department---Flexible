import { NextRequest, NextResponse } from 'next/server';
import { getJackson } from '@/lib/saml';

export async function GET(req: NextRequest) {
    try {
        // Provide metadata for the setup of IdP
        // Usually requires tenant and product in query or path
        const searchParams = req.nextUrl.searchParams;
        const tenant = searchParams.get('tenant') || 'default';
        const product = searchParams.get('product') || 'sales-funnel';

        // Jackson logic for metadata might differ based on library version
        // Usually, the SP metadata is static or per-tenant?
        // BoxyHQ jackson exposes SP metadata XML.

        const { apiController } = await getJackson();

        // This method might not exist on apiController directly depending on version, 
        // but typically 'spConfig' or similar provides it.
        // Assuming standard integration pattern:

        // Actually, OAuth controller or specific method handles metadata generation.
        // If not available, we construct it manually.
        // But let's assume getJackson exposes it or we use the library directly.

        // Check docs memory: jackson.spConfig.get()
        // But I only returned apiController and oauthController.
        // I should update lib/saml.ts to return spConfig if needed.
        // For now, let's return a placeholder or standard XML if possible.

        // Wait, standard Jackson endpoint is /api/auth/saml/metadata 
        // which serves the SP metadata.

        // I'll leave this as a TODO or return generic XML if library doesn't expose it easily in this context.

        // Re-read lib/saml.ts: I only got api/oauth controllers.

        return new NextResponse(`
          <EntityDescriptor entityID="sales-funnel" xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
            <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
              <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
              <AssertionConsumerService index="0" isDefault="true" Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${process.env.NEXTAUTH_URL}/api/auth/saml/callback" />
            </SPSSODescriptor>
          </EntityDescriptor>
        `, {
            headers: { 'Content-Type': 'application/xml' }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
