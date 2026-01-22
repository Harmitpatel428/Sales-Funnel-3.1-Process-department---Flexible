import { NextRequest, NextResponse } from 'next/server';
import { getJackson } from '@/lib/saml';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiContext } from '@/lib/api/types';

export const GET = withApiHandler({ authRequired: false, checkDbHealth: false }, async (context: ApiContext) => {
  // Provide metadata for the setup of IdP
  // Currently returns static metadata XML as per original implementation
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
});
